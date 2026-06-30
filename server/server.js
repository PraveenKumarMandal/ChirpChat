require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');

const {
  createOtpVerificationToken,
  createSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
  verifyOtpVerificationToken,
} = require('./utils/auth');
const { sendAccountCreatedEmail, sendFeedbackEmail, sendOtpEmail } = require('./utils/mailer');
const User = require('./models/User');
const Message = require('./models/Message');
const FriendRequest = require('./models/FriendRequest');
const EmailOtp = require('./models/EmailOtp');

const REQUIRED_ENV_VARS = ['MONGO_URI', 'AUTH_SECRET'];
const DEFAULT_UPLOAD_MAX_FILE_SIZE_MB = 15;
const DEFAULT_ALLOWED_UPLOAD_MIME_TYPES = [
  'image/*',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const normalizeUrl = (value = '') => String(value).trim().replace(/\/+$/, '');
const parsePositiveInteger = (value, fallback) => {
  const parsedValue = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};
const parseCsvEnv = (value = '') =>
  String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
const ensureRequiredEnvVars = () => {
  const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]?.trim());

  if (missingEnvVars.length) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }
};

const PUBLIC_SERVER_URL = normalizeUrl(process.env.PUBLIC_SERVER_URL);
const ALLOWED_ORIGINS = parseCsvEnv(process.env.CLIENT_ORIGIN);
const UPLOAD_MAX_FILE_SIZE_BYTES =
  parsePositiveInteger(process.env.UPLOAD_MAX_FILE_SIZE_MB, DEFAULT_UPLOAD_MAX_FILE_SIZE_MB) *
  1024 *
  1024;
const ALLOWED_UPLOAD_MIME_TYPES = new Set(
  parseCsvEnv(process.env.ALLOWED_UPLOAD_MIME_TYPES).length
    ? parseCsvEnv(process.env.ALLOWED_UPLOAD_MIME_TYPES)
    : DEFAULT_ALLOWED_UPLOAD_MIME_TYPES
);
const MAX_MESSAGE_TEXT_LENGTH = 4000;
const PORT = parsePositiveInteger(process.env.PORT, 5000);

ensureRequiredEnvVars();

const app = express();
const uploadsDir = process.env.UPLOADS_DIR?.trim() || path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const isAllowedOrigin = (origin = '') =>
  !origin || !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin);

const corsOrigin = (origin, callback) => {
  if (isAllowedOrigin(origin)) {
    return callback(null, true);
  }

  return callback(new Error('Origin not allowed by server policy'));
};

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
});
app.use('/uploads', express.static(uploadsDir));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});

const onlineUsers = {};
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_ATTEMPTS = 5;
const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;
const FEEDBACK_SUBJECT_MAX_LENGTH = 120;
const FEEDBACK_TYPES = new Set(['feedback', 'complaint', 'bug']);

const normalizeEmail = (value = '') => String(value).trim().toLowerCase();
const normalizeUsername = (username = '') => String(username).trim().toLowerCase();
const normalizeIdentifier = (identifier = '') => String(identifier).trim();
const isValidEmail = (email = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidUsername = (username = '') => /^[a-z0-9_.]{3,24}$/.test(username);
const isStrongPassword = (password = '') =>
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,64}$/.test(password);
const isAllowedUploadMimeType = (mimetype = '') => {
  const normalizedMimeType = String(mimetype).trim().toLowerCase();

  if (!normalizedMimeType) {
    return false;
  }

  return Array.from(ALLOWED_UPLOAD_MIME_TYPES).some((allowedMimeType) => {
    const normalizedAllowedMimeType = String(allowedMimeType).trim().toLowerCase();

    if (normalizedAllowedMimeType.endsWith('/*')) {
      return normalizedMimeType.startsWith(normalizedAllowedMimeType.slice(0, -1));
    }

    return normalizedMimeType === normalizedAllowedMimeType;
  });
};
const removeUploadedFile = async (filePath = '') => {
  if (!filePath) {
    return;
  }

  try {
    await fs.promises.unlink(filePath);
  } catch {
    // Ignore cleanup errors for temporary upload files.
  }
};
const logError = (...args) => console.error(...args);
const getHttpStatusFromError = (error, fallback = 400) => {
  const statusCode = Number(error?.statusCode || error?.status || fallback);
  return statusCode >= 400 && statusCode <= 599 ? statusCode : fallback;
};
const snapshotOtpRecord = (record) => {
  if (!record) {
    return null;
  }

  return {
    codeHash: record.codeHash,
    expiresAt: record.expiresAt,
    resendAvailableAt: record.resendAvailableAt,
    attemptsRemaining: record.attemptsRemaining,
    consumedAt: record.consumedAt,
  };
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase() || '.bin';
    const safeBaseName = path
      .basename(file.originalname || 'upload', extension)
      .replace(/[^a-z0-9-_]/gi, '-')
      .toLowerCase();
    cb(null, `${Date.now()}-${safeBaseName}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: UPLOAD_MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedUploadMimeType(file.mimetype)) {
      return cb(new Error('Unsupported file type. Only common images and document formats are allowed.'));
    }

    return cb(null, true);
  },
});

const isUserOnline = (userId) => Boolean(onlineUsers[String(userId)]);

const userSummary = (user) => ({
  _id: String(user._id),
  name: user.name,
  email: user.email,
  username: user.username,
  profilePicture: user.profilePicture || '',
  lastSeen: user.lastSeen,
  isOnline: isUserOnline(user._id),
});

const safeMessage = (message) => ({
  _id: String(message._id),
  text: message.text,
  sender: message.sender,
  receiver: message.receiver,
  messageType: message.messageType,
  mediaUrl: message.mediaUrl,
  mediaName: message.mediaName,
  mediaMimeType: message.mediaMimeType,
  mediaSize: message.mediaSize,
  status: message.status,
  deliveredAt: message.deliveredAt,
  readAt: message.readAt,
  time: message.time,
});

const hashOtpCode = (code) => crypto.createHash('sha256').update(code).digest('hex');
const generateOtpCode = () => `${Math.floor(100000 + Math.random() * 900000)}`;

const getAuthTokenFromHeader = (authorizationHeader = '') => {
  if (!authorizationHeader.startsWith('Bearer ')) {
    return '';
  }

  return authorizationHeader.slice(7).trim();
};

const requireAuth = async (req, res, next) => {
  try {
    const token = getAuthTokenFromHeader(req.headers.authorization || '');

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const payload = verifySessionToken(token);
    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    req.authUser = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }
};

const ensureOwnUserParam = (paramName = 'userId') => (req, res, next) => {
  if (String(req.authUser._id) !== String(req.params[paramName])) {
    return res.status(403).json({ error: 'You are not allowed to perform this action' });
  }

  next();
};

const ensureOwnUserQuery = (queryName = 'currentUserId') => (req, res, next) => {
  if (String(req.authUser._id) !== String(req.query[queryName] || '')) {
    return res.status(403).json({ error: 'You are not allowed to perform this action' });
  }

  next();
};

const createFileUrl = (req, filename) => `${req.protocol}://${req.get('host')}/uploads/${filename}`;
const createPublicFileUrl = (req, filename) =>
  PUBLIC_SERVER_URL ? `${PUBLIC_SERVER_URL}/uploads/${filename}` : createFileUrl(req, filename);

const issueAuthResponse = (res, user) => {
  res.json({
    token: createSessionToken(user._id),
    user: userSummary(user),
  });
};

const emitPresenceUpdate = async (userId) => {
  const user = await User.findById(userId);

  if (!user) {
    return;
  }

  io.emit('presenceUpdate', {
    userId: String(user._id),
    isOnline: isUserOnline(user._id),
    lastSeen: user.lastSeen,
  });
};

const setUserOffline = async (userId) => {
  delete onlineUsers[String(userId)];
  await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
  await emitPresenceUpdate(userId);
};

const markMessagesDelivered = async (userId) => {
  const pendingMessages = await Message.find({
    receiver: String(userId),
    status: 'sent',
  });

  if (!pendingMessages.length) {
    return;
  }

  const deliveredAt = new Date();
  const messageIds = pendingMessages.map((message) => message._id);

  await Message.updateMany(
    { _id: { $in: messageIds } },
    {
      $set: {
        status: 'delivered',
        deliveredAt,
      },
    }
  );

  pendingMessages.forEach((message) => {
    const senderSocket = onlineUsers[String(message.sender)];

    if (senderSocket) {
      io.to(senderSocket).emit('messageStatusUpdate', {
        messageId: String(message._id),
        status: 'delivered',
        deliveredAt,
        readAt: null,
      });
    }
  });
};

const areUsersBlocked = async (firstUserId, secondUserId) => {
  const [firstUser, secondUser] = await Promise.all([
    User.findById(firstUserId).select('blockedUsers'),
    User.findById(secondUserId).select('blockedUsers'),
  ]);

  if (!firstUser || !secondUser) {
    return false;
  }

  const firstBlocked = firstUser.blockedUsers.some((id) => String(id) === String(secondUserId));
  const secondBlocked = secondUser.blockedUsers.some((id) => String(id) === String(firstUserId));
  return firstBlocked || secondBlocked;
};

const areUsersConnected = async (firstUserId, secondUserId) => {
  const connection = await FriendRequest.exists({
    status: 'accepted',
    $or: [
      { from: firstUserId, to: secondUserId },
      { from: secondUserId, to: firstUserId },
    ],
  });

  return Boolean(connection);
};

const getAcceptedContacts = async (userId) => {
  const requests = await FriendRequest.find({
    status: 'accepted',
    $or: [{ from: userId }, { to: userId }],
  })
    .populate('from')
    .populate('to');

  const currentUser = await User.findById(userId).select('blockedUsers');

  return requests
    .map((request) => {
      const otherUser = String(request.from._id) === String(userId) ? request.to : request.from;
      return { otherUser };
    })
    .filter(({ otherUser }) => {
      if (!otherUser) {
        return false;
      }

      const isBlockedByCurrentUser = currentUser?.blockedUsers.some(
        (id) => String(id) === String(otherUser._id)
      );
      const isBlockedByOtherUser = otherUser.blockedUsers?.some(
        (id) => String(id) === String(userId)
      );

      return !isBlockedByCurrentUser && !isBlockedByOtherUser;
    });
};

const getLatestMessage = (userId, otherUserId) =>
  Message.findOne({
    $or: [
      { sender: String(userId), receiver: String(otherUserId) },
      { sender: String(otherUserId), receiver: String(userId) },
    ],
  }).sort({ time: -1 });

const buildHomePayload = async (userId) => {
  const [currentUser, pendingRequests, acceptedContacts] = await Promise.all([
    User.findById(userId),
    FriendRequest.find({
      to: userId,
      status: 'pending',
    }).populate('from'),
    getAcceptedContacts(userId),
  ]);

  if (!currentUser) {
    return null;
  }

  const contacts = await Promise.all(
    acceptedContacts.map(async ({ otherUser }) => {
      const [lastMessage, unreadCount] = await Promise.all([
        getLatestMessage(userId, otherUser._id),
        Message.countDocuments({
          sender: String(otherUser._id),
          receiver: String(userId),
          status: { $ne: 'read' },
        }),
      ]);

      return {
        ...userSummary(otherUser),
        unreadCount,
        lastMessage: lastMessage
          ? {
              text:
                lastMessage.messageType === 'text'
                  ? lastMessage.text
                  : lastMessage.messageType === 'image'
                    ? 'Photo'
                    : lastMessage.mediaName || 'File',
              time: lastMessage.time,
              sender: lastMessage.sender,
              status: lastMessage.status,
              messageType: lastMessage.messageType,
            }
          : null,
      };
    })
  );

  contacts.sort((first, second) => {
    const firstTime = first.lastMessage?.time ? new Date(first.lastMessage.time).getTime() : 0;
    const secondTime = second.lastMessage?.time ? new Date(second.lastMessage.time).getTime() : 0;
    return secondTime - firstTime;
  });

  return {
    currentUser: userSummary(currentUser),
    contacts,
    pendingRequests: pendingRequests.map((request) => ({
      _id: String(request._id),
      from: userSummary(request.from),
      status: request.status,
      createdAt: request.createdAt,
    })),
  };
};

const cleanupExpiredOtps = async () => {
  await EmailOtp.deleteMany({
    $or: [{ expiresAt: { $lt: new Date() } }, { consumedAt: { $ne: null } }],
  });
};

const issueEmailOtp = async ({ email, purpose }) => {
  await cleanupExpiredOtps();

  const now = new Date();
  const existingOtp = await EmailOtp.findOne({
    email,
    purpose,
    consumedAt: null,
    expiresAt: { $gt: now },
  });

  if (existingOtp && existingOtp.resendAvailableAt > now) {
    const secondsRemaining = Math.ceil(
      (existingOtp.resendAvailableAt.getTime() - now.getTime()) / 1000
    );
    throw new Error(`Please wait ${secondsRemaining} seconds before requesting another OTP.`);
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);
  const resendAvailableAt = new Date(now.getTime() + OTP_RESEND_COOLDOWN_MS);
  const previousOtpState = snapshotOtpRecord(existingOtp);

  await EmailOtp.findOneAndUpdate(
    { email, purpose },
    {
      $set: {
        codeHash,
        expiresAt,
        resendAvailableAt,
        attemptsRemaining: OTP_ATTEMPTS,
        consumedAt: null,
      },
    },
    { returnDocument: 'after', upsert: true }
  );

  try {
    await sendOtpEmail({ email, code, purpose });
  } catch (error) {
    try {
      // Keep the previous OTP usable if the replacement email was never delivered.
      if (previousOtpState) {
        await EmailOtp.findOneAndUpdate(
          { email, purpose },
          { $set: previousOtpState },
          { returnDocument: 'after', upsert: true }
        );
      } else {
        await EmailOtp.deleteOne({ email, purpose, codeHash });
      }
    } catch (rollbackError) {
      logError('OTP rollback error:', rollbackError);
    }

    throw error;
  }
};

const verifyEmailOtpCode = async ({ email, purpose, code }) => {
  await cleanupExpiredOtps();

  const record = await EmailOtp.findOne({
    email,
    purpose,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!record) {
    throw new Error('OTP expired or not found. Please request a new OTP.');
  }

  const hashedCode = hashOtpCode(code);

  if (record.codeHash !== hashedCode) {
    record.attemptsRemaining -= 1;

    if (record.attemptsRemaining <= 0) {
      await record.deleteOne();
      throw new Error('Too many incorrect OTP attempts. Please request a new OTP.');
    }

    await record.save();
    throw new Error(`Incorrect OTP. ${record.attemptsRemaining} attempt(s) remaining.`);
  }

  record.consumedAt = new Date();
  await record.save();

  return createOtpVerificationToken({ email, purpose });
};

io.use(async (socket, next) => {
  try {
    const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
    const payload = verifySessionToken(token);
    const user = await User.findById(payload.sub);

    if (!user) {
      return next(new Error('Authentication required'));
    }

    socket.data.userId = String(user._id);
    next();
  } catch {
    next(new Error('Authentication required'));
  }
});

app.get('/health', async (_req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  res.json({
    status: databaseConnected ? 'ok' : 'degraded',
    database: databaseConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get('/', (_req, res) => {
  res.json({
    status: 'success',
    message: 'ChirpChat Backend Running 🚀',
  });
});

io.on('connection', (socket) => {
  const connectedUserId = String(socket.data.userId);

  socket.on('join', async () => {
    onlineUsers[connectedUserId] = socket.id;
    await User.findByIdAndUpdate(connectedUserId, { lastSeen: new Date() });
    await markMessagesDelivered(connectedUserId);
    await emitPresenceUpdate(connectedUserId);
  });

  socket.on('typingStart', ({ receiver }) => {
    const receiverSocket = onlineUsers[String(receiver)];

    if (receiverSocket) {
      io.to(receiverSocket).emit('typingUpdate', {
        userId: connectedUserId,
        isTyping: true,
      });
    }
  });

  socket.on('typingStop', ({ receiver }) => {
    const receiverSocket = onlineUsers[String(receiver)];

    if (receiverSocket) {
      io.to(receiverSocket).emit('typingUpdate', {
        userId: connectedUserId,
        isTyping: false,
      });
    }
  });

  socket.on('sendMessage', async (data, acknowledge) => {
    const sendAcknowledgement = (payload) => {
      if (typeof acknowledge === 'function') {
        acknowledge(payload);
        return true;
      }

      return false;
    };

    try {
      const {
        text,
        receiver,
        messageType = 'text',
        mediaUrl = '',
        mediaName = '',
        mediaMimeType = '',
        mediaSize = 0,
      } = data;
      const normalizedReceiver = String(receiver || '').trim();
      const normalizedText = String(text || '').trim();
      const normalizedMessageType = ['text', 'image', 'file'].includes(messageType)
        ? messageType
        : 'text';

      if ((!normalizedText && !mediaUrl) || !normalizedReceiver) {
        sendAcknowledgement({ success: false, error: 'Message text or attachment is required.' });
        return;
      }

      if (normalizedText.length > MAX_MESSAGE_TEXT_LENGTH) {
        const error = `Messages can contain up to ${MAX_MESSAGE_TEXT_LENGTH} characters.`;
        if (!sendAcknowledgement({ success: false, error })) {
          socket.emit('messageError', { error });
        }
        return;
      }

      const [blocked, connected] = await Promise.all([
        areUsersBlocked(connectedUserId, normalizedReceiver),
        areUsersConnected(connectedUserId, normalizedReceiver),
      ]);

      if (blocked) {
        const error = 'Messaging is unavailable for this user.';
        if (!sendAcknowledgement({ success: false, error })) {
          socket.emit('messageError', { error });
        }
        return;
      }

      if (!connected) {
        const error = 'You can only message accepted contacts.';
        if (!sendAcknowledgement({ success: false, error })) {
          socket.emit('messageError', { error });
        }
        return;
      }

      const receiverSocket = onlineUsers[String(normalizedReceiver)];
      const deliveredAt = receiverSocket ? new Date() : null;

      const message = new Message({
        text: normalizedText,
        sender: connectedUserId,
        receiver: normalizedReceiver,
        messageType: normalizedMessageType,
        mediaUrl,
        mediaName,
        mediaMimeType,
        mediaSize,
        status: receiverSocket ? 'delivered' : 'sent',
        deliveredAt,
      });

      await message.save();

      if (receiverSocket) {
        io.to(receiverSocket).emit('receiveMessage', safeMessage(message));
      }

      const outgoingMessage = safeMessage(message);
      socket.emit('receiveMessage', outgoingMessage);
      sendAcknowledgement({ success: true, message: outgoingMessage });
    } catch (error) {
      logError('Error saving message:', error);
      const message = 'Could not send this message right now. Please try again.';
      if (!sendAcknowledgement({ success: false, error: message })) {
        socket.emit('messageError', { error: message });
      }
    }
  });

  socket.on('markMessagesRead', async ({ chatUserId }) => {
    if (!chatUserId) {
      return;
    }

    const readAt = new Date();
    const unreadMessages = await Message.find({
      sender: String(chatUserId),
      receiver: connectedUserId,
      status: { $in: ['sent', 'delivered'] },
    });

    if (!unreadMessages.length) {
      return;
    }

    const messageIds = unreadMessages.map((message) => message._id);

    await Message.updateMany(
      { _id: { $in: messageIds } },
      {
        $set: {
          status: 'read',
          readAt,
          deliveredAt: readAt,
        },
      }
    );

    const senderSocket = onlineUsers[String(chatUserId)];

    if (senderSocket) {
      messageIds.forEach((messageId) => {
        io.to(senderSocket).emit('messageStatusUpdate', {
          messageId: String(messageId),
          status: 'read',
          deliveredAt: readAt,
          readAt,
        });
      });
    }
  });

  socket.on('manualLogout', async () => {
    await setUserOffline(connectedUserId);
  });

  socket.on('disconnect', async () => {
    if (onlineUsers[connectedUserId] === socket.id) {
      await setUserOffline(connectedUserId);
    }
  });
});

app.get('/auth/availability', async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.query.email);
    const normalizedUsername = normalizeUsername(req.query.username);
    const queryFilters = [];

    if (normalizedEmail) {
      queryFilters.push({ email: normalizedEmail });
    }

    if (normalizedUsername) {
      queryFilters.push({ username: normalizedUsername });
    }

    const existingUsers = queryFilters.length
      ? await User.find({ $or: queryFilters }).select('email username')
      : [];

    res.json({
      emailAvailable: normalizedEmail
        ? !existingUsers.some((user) => user.email === normalizedEmail)
        : true,
      usernameAvailable: normalizedUsername
        ? !existingUsers.some((user) => user.username === normalizedUsername)
        : true,
    });
  } catch {
    res.status(500).json({ error: 'Error checking account availability' });
  }
});

app.post('/auth/email-otp/send', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const purpose = String(req.body.purpose || '');

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    if (!['reset-password', 'change-password'].includes(purpose)) {
      return res.status(400).json({ error: 'Invalid OTP purpose' });
    }

    const existingUser = await User.findOne({ email });

    if (purpose === 'change-password') {
      const token = getAuthTokenFromHeader(req.headers.authorization || '');

      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const payload = verifySessionToken(token);
      const authUser = await User.findById(payload.sub);

      if (!authUser) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (authUser.email !== email) {
        return res.status(403).json({ error: 'OTP can only be sent to your linked email address' });
      }
    }

    if (purpose === 'reset-password' && !existingUser) {
      return res.status(404).json({ error: 'No account was found for this email' });
    }

    await issueEmailOtp({ email, purpose });
    res.json({ success: true });
  } catch (error) {
    logError('OTP send error:', error);
    res.status(getHttpStatusFromError(error)).json({
      error: error.message || 'Could not send OTP email',
    });
  }
});

app.post('/auth/email-otp/verify', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const purpose = String(req.body.purpose || '');
    const code = String(req.body.code || '').trim();

    if (!isValidEmail(email) || !code) {
      return res.status(400).json({ error: 'Email and OTP code are required' });
    }

    if (!['reset-password', 'change-password'].includes(purpose)) {
      return res.status(400).json({ error: 'Invalid OTP purpose' });
    }

    const otpToken = await verifyEmailOtpCode({ email, purpose, code });
    res.json({ otpToken });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not verify OTP email' });
  }
});

app.post('/auth/register', upload.single('profilePicture'), async (req, res) => {
  try {
    const { name, email, username, password } = req.body;
    const trimmedName = String(name || '').trim();
    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = normalizeUsername(username);

    if (!trimmedName || !normalizedEmail || !normalizedUsername || !password) {
      return res
        .status(400)
        .json({ error: 'Name, email, username, and password are required' });
    }

    if (trimmedName.length > 80) {
      return res.status(400).json({ error: 'Name must be 80 characters or fewer' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Profile picture is required to register' });
    }

    if (!isValidEmail(normalizedEmail)) {
      await removeUploadedFile(req.file.path);
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (!isValidUsername(normalizedUsername)) {
      await removeUploadedFile(req.file.path);
      return res.status(400).json({
        error: 'Username must be 3-24 characters and can only use letters, numbers, underscores, or dots',
      });
    }

    if (!isStrongPassword(password)) {
      await removeUploadedFile(req.file.path);
      return res.status(400).json({
        error: 'Password must be 8-64 characters and include letters, numbers, and a symbol',
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
    });

    if (existingUser) {
      await removeUploadedFile(req.file.path);
      return res.status(409).json({ error: 'This email or username is already registered' });
    }

    const user = new User({
      name: trimmedName,
      email: normalizedEmail,
      username: normalizedUsername,
      passwordHash: hashPassword(password),
      profilePicture: createPublicFileUrl(req, req.file.filename),
    });

    await user.save();
    sendAccountCreatedEmail({ user }).catch((emailError) => {
      logError('Account created email error:', emailError);
    });
    issueAuthResponse(res, user);
  } catch (error) {
    if (req.file?.path) {
      await removeUploadedFile(req.file.path);
    }

    if (error.code === 11000) {
      return res.status(409).json({ error: 'This email or username is already registered' });
    }

    res.status(400).json({ error: error.message || 'Error registering user' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const normalizedIdentifier = normalizeIdentifier(identifier);
    const normalizedEmail = normalizeEmail(normalizedIdentifier);
    const normalizedUsername = normalizeUsername(normalizedIdentifier);
    const isEmailLogin = normalizedIdentifier.includes('@');

    if (!normalizedIdentifier || !password) {
      return res.status(400).json({ error: 'Email or username and password are required' });
    }

    const user = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
    });

    if (!user) {
      return res.status(401).json({
        error: isEmailLogin ? 'Email not registered' : 'Username not registered',
      });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Wrong password' });
    }

    issueAuthResponse(res, user);
  } catch {
    res.status(500).json({ error: 'Error logging in' });
  }
});

app.post('/auth/reset-password', async (req, res) => {
  try {
    const { email, password, otpToken } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password || !otpToken) {
      return res.status(400).json({ error: 'Email, new password, and verified OTP are required' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: 'Password must be 8-64 characters and include letters, numbers, and a symbol',
      });
    }

    const otpPayload = verifyOtpVerificationToken(otpToken, 'reset-password');

    if (otpPayload.sub !== normalizedEmail) {
      return res.status(400).json({ error: 'The verified email does not match this account' });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ error: 'No account was found for this email' });
    }

    user.passwordHash = hashPassword(password);
    user.emailVerifiedAt = user.emailVerifiedAt || new Date();
    await user.save();

    issueAuthResponse(res, user);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error resetting password' });
  }
});

app.post('/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { password, otpToken } = req.body;

    if (!password || !otpToken) {
      return res.status(400).json({ error: 'New password and verified OTP are required' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: 'Password must be 8-64 characters and include letters, numbers, and a symbol',
      });
    }

    const otpPayload = verifyOtpVerificationToken(otpToken, 'change-password');

    if (otpPayload.sub !== req.authUser.email) {
      return res.status(400).json({ error: 'The verified email does not match your linked account' });
    }

    req.authUser.passwordHash = hashPassword(password);
    req.authUser.emailVerifiedAt = req.authUser.emailVerifiedAt || new Date();
    await req.authUser.save();

    res.json({
      success: true,
      user: userSummary(req.authUser),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error changing password' });
  }
});

app.get('/auth/me', requireAuth, async (req, res) => {
  res.json(userSummary(req.authUser));
});

app.post('/feedback', requireAuth, async (req, res) => {
  try {
    const feedbackType = String(req.body.feedbackType || 'feedback').trim().toLowerCase();
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();
    const rating = Number(req.body.rating);

    if (!FEEDBACK_TYPES.has(feedbackType)) {
      return res.status(400).json({ error: 'Choose a valid feedback type' });
    }

    if (!subject || subject.length > FEEDBACK_SUBJECT_MAX_LENGTH) {
      return res.status(400).json({
        error: `Subject is required and must be ${FEEDBACK_SUBJECT_MAX_LENGTH} characters or fewer`,
      });
    }

    if (message.length < 10 || message.length > FEEDBACK_MESSAGE_MAX_LENGTH) {
      return res.status(400).json({
        error: `Feedback must be between 10 and ${FEEDBACK_MESSAGE_MAX_LENGTH} characters`,
      });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    await sendFeedbackEmail({
      user: req.authUser,
      feedbackType,
      subject,
      message,
      rating,
    });

    res.json({ success: true });
  } catch (error) {
    logError('Feedback send error:', error);
    res.status(getHttpStatusFromError(error, 500)).json({
      error: error.message || 'Could not send feedback right now',
    });
  }
});

app.get('/users', requireAuth, async (_req, res) => {
  try {
    const users = await User.find().select('name email username profilePicture lastSeen');
    res.json(users.map(userSummary));
  } catch {
    res.status(500).json({ error: 'Error fetching users' });
  }
});

app.get('/users/:userId/summary', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select(
      'name email username profilePicture lastSeen blockedUsers'
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(userSummary(user));
  } catch {
    res.status(500).json({ error: 'Error fetching user summary' });
  }
});

app.get('/users/search', requireAuth, ensureOwnUserQuery('currentUserId'), async (req, res) => {
  try {
    const { q = '', currentUserId } = req.query;
    const query = String(q).trim();

    if (!currentUserId) {
      return res.status(400).json({ error: 'Current user is required' });
    }

    const currentUser = await User.findById(currentUserId).select('blockedUsers');

    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const users = await User.find({
      _id: { $ne: currentUserId },
      $or: [{ username: regex }, { email: regex }, { name: regex }],
    }).select('name email username profilePicture blockedUsers lastSeen');

    const results = [];

    for (const user of users) {
      const currentBlockedUser = currentUser.blockedUsers.some((id) => String(id) === String(user._id));
      const blockedCurrentUser = user.blockedUsers.some((id) => String(id) === String(currentUserId));

      if (currentBlockedUser || blockedCurrentUser) {
        continue;
      }

      const request = await FriendRequest.findOne({
        $or: [
          { from: currentUserId, to: user._id },
          { from: user._id, to: currentUserId },
        ],
      });

      let relationStatus = 'none';

      if (request) {
        if (request.status === 'accepted') {
          relationStatus = 'accepted';
        } else if (request.status === 'pending' && String(request.from) === String(currentUserId)) {
          relationStatus = 'sent';
        } else if (request.status === 'pending') {
          relationStatus = 'received';
        } else {
          relationStatus = request.status;
        }
      }

      results.push({
        ...userSummary(user),
        relationStatus,
      });
    }

    res.json(results);
  } catch {
    res.status(500).json({ error: 'Error searching users' });
  }
});

app.put('/users/:userId/profile', requireAuth, ensureOwnUserParam('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, username, profilePicture } = req.body;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (name?.trim()) {
      if (name.trim().length > 80) {
        return res.status(400).json({ error: 'Name must be 80 characters or fewer' });
      }

      user.name = name.trim();
    }

    if (typeof profilePicture === 'string') {
      user.profilePicture = profilePicture.trim();
    }

    if (username?.trim()) {
      const normalizedUsername = normalizeUsername(username);

      if (!isValidUsername(normalizedUsername)) {
        return res.status(400).json({
          error: 'Username must be 3-24 characters and can only use letters, numbers, underscores, or dots',
        });
      }

      const existingUser = await User.findOne({
        username: normalizedUsername,
        _id: { $ne: userId },
      });

      if (existingUser) {
        return res.status(409).json({ error: 'Username already taken' });
      }

      user.username = normalizedUsername;
    }

    await user.save();
    res.json(userSummary(user));
  } catch {
    res.status(500).json({ error: 'Error updating profile' });
  }
});

app.post(
  '/users/:userId/profile-picture',
  requireAuth,
  ensureOwnUserParam('userId'),
  upload.single('profilePicture'),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);

      if (!user) {
        await removeUploadedFile(req.file?.path);
        return res.status(404).json({ error: 'User not found' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Profile picture file is required' });
      }

      user.profilePicture = createPublicFileUrl(req, req.file.filename);
      await user.save();

      res.json(userSummary(user));
    } catch (error) {
      res.status(500).json({ error: error.message || 'Error uploading profile picture' });
    }
  }
);

app.post('/messages/upload', requireAuth, upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Media file is required' });
    }

    const receiver = String(req.body.receiver || '').trim();

    if (receiver) {
      const [blocked, connected] = await Promise.all([
        areUsersBlocked(req.authUser._id, receiver),
        areUsersConnected(req.authUser._id, receiver),
      ]);

      if (blocked || !connected) {
        await removeUploadedFile(req.file.path);
        return res.status(403).json({ error: 'You can only upload attachments for accepted contacts.' });
      }
    }

    const fileUrl = createPublicFileUrl(req, req.file.filename);
    const isImage = req.file.mimetype?.startsWith('image/');

    res.json({
      mediaUrl: fileUrl,
      mediaName: req.file.originalname,
      mediaMimeType: req.file.mimetype,
      mediaSize: req.file.size,
      messageType: isImage ? 'image' : 'file',
    });
  } catch (error) {
    if (req.file?.path) {
      await removeUploadedFile(req.file.path);
    }

    res.status(500).json({ error: error.message || 'Error uploading media' });
  }
});

app.get('/users/:userId/blocked', requireAuth, ensureOwnUserParam('userId'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('blockedUsers');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user.blockedUsers.map(userSummary));
  } catch {
    res.status(500).json({ error: 'Error fetching blocked users' });
  }
});

app.post('/users/:userId/block', requireAuth, ensureOwnUserParam('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { targetUserId } = req.body;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!targetUserId || String(userId) === String(targetUserId)) {
      return res.status(400).json({ error: 'Invalid target user' });
    }

    const targetUser = await User.findById(targetUserId).select('_id');

    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    if (!user.blockedUsers.some((id) => String(id) === String(targetUserId))) {
      user.blockedUsers.push(targetUserId);
      await user.save();
    }

    await FriendRequest.deleteMany({
      status: { $in: ['pending', 'accepted'] },
      $or: [
        { from: userId, to: targetUserId },
        { from: targetUserId, to: userId },
      ],
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error blocking user' });
  }
});

app.post('/users/:userId/unblock', requireAuth, ensureOwnUserParam('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { targetUserId } = req.body;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.blockedUsers = user.blockedUsers.filter(
      (blockedUserId) => String(blockedUserId) !== String(targetUserId)
    );
    await user.save();

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error unblocking user' });
  }
});

app.get('/home/:userId', requireAuth, ensureOwnUserParam('userId'), async (req, res) => {
  try {
    const data = await buildHomePayload(req.params.userId);

    if (!data) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error fetching home data' });
  }
});

app.post('/friend-requests', requireAuth, async (req, res) => {
  try {
    const { fromUserId, toUserId } = req.body;

    if (!fromUserId || !toUserId || String(fromUserId) === String(toUserId)) {
      return res.status(400).json({ error: 'Invalid request users' });
    }

    if (String(fromUserId) !== String(req.authUser._id)) {
      return res.status(403).json({ error: 'You are not allowed to perform this action' });
    }

    const [blocked, targetUserExists] = await Promise.all([
      areUsersBlocked(fromUserId, toUserId),
      User.exists({ _id: toUserId }),
    ]);

    if (!targetUserExists) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (blocked) {
      return res.status(403).json({ error: 'Cannot send request to this user' });
    }

    const existingRequest = await FriendRequest.findOne({
      $or: [
        { from: fromUserId, to: toUserId },
        { from: toUserId, to: fromUserId },
      ],
    });

    if (existingRequest) {
      if (existingRequest.status === 'accepted') {
        return res.status(409).json({ error: 'You are already connected' });
      }

      if (existingRequest.status === 'pending') {
        return res.status(409).json({ error: 'A pending request already exists' });
      }
    }

    if (existingRequest && existingRequest.status === 'rejected') {
      existingRequest.from = fromUserId;
      existingRequest.to = toUserId;
      existingRequest.status = 'pending';
      await existingRequest.save();
      return res.json(existingRequest);
    }

    const request = new FriendRequest({
      from: fromUserId,
      to: toUserId,
      status: 'pending',
    });

    await request.save();
    res.json(request);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A request already exists' });
    }

    res.status(500).json({ error: 'Error sending friend request' });
  }
});

app.post('/friend-requests/:requestId/accept', requireAuth, async (req, res) => {
  try {
    const request = await FriendRequest.findById(req.params.requestId).populate('from').populate('to');

    if (!request || request.status !== 'pending') {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (String(request.to._id) !== String(req.authUser._id)) {
      return res.status(403).json({ error: 'You are not allowed to perform this action' });
    }

    request.status = 'accepted';
    await request.save();

    res.json({
      success: true,
      requestId: String(request._id),
      from: userSummary(request.from),
      to: userSummary(request.to),
    });
  } catch {
    res.status(500).json({ error: 'Error accepting request' });
  }
});

app.post('/friend-requests/:requestId/reject', requireAuth, async (req, res) => {
  try {
    const request = await FriendRequest.findById(req.params.requestId);

    if (!request || request.status !== 'pending') {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (String(request.to) !== String(req.authUser._id)) {
      return res.status(403).json({ error: 'You are not allowed to perform this action' });
    }

    request.status = 'rejected';
    await request.save();

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error rejecting request' });
  }
});

app.get('/messages/:sender/:receiver', requireAuth, async (req, res) => {
  try {
    const { sender, receiver } = req.params;

    if (![String(sender), String(receiver)].includes(String(req.authUser._id))) {
      return res.status(403).json({ error: 'You are not allowed to view this chat' });
    }

    const blocked = await areUsersBlocked(sender, receiver);

    if (blocked) {
      return res.json([]);
    }

    const connected = await areUsersConnected(sender, receiver);

    if (!connected) {
      return res.json([]);
    }

    const messages = await Message.find({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender },
      ],
    }).sort({ time: 1 });

    res.json(messages.map(safeMessage));
  } catch {
    res.status(500).json({ error: 'Error fetching messages' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: `Attachment exceeds the ${Math.round(UPLOAD_MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB limit.`,
      });
    }

    return res.status(400).json({ error: error.message });
  }

  if (error?.message === 'Origin not allowed by server policy') {
    return res.status(403).json({ error: error.message });
  }

  if (error?.message === 'Unsupported file type. Only common images and document formats are allowed.') {
    return res.status(400).json({ error: error.message });
  }

  logError('Unhandled server error:', error);
  return res.status(500).json({ error: 'Internal server error' });
});

const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.info('MongoDB connected');

    server.listen(PORT, () => {
      console.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logError('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
