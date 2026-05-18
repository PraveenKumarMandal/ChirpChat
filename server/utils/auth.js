const crypto = require('crypto');

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_KEY_LENGTH = 64;
const OTP_TOKEN_DURATION_MS = 15 * 60 * 1000;

const getSessionSecret = () => {
  const secret = process.env.AUTH_SECRET?.trim();

  if (!secret) {
    throw new Error('AUTH_SECRET is not configured.');
  }

  return secret;
};

const toBase64Url = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const fromBase64Url = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
};

const signPayload = (encodedPayload) =>
  crypto.createHmac('sha256', getSessionSecret()).update(encodedPayload).digest('base64url');

const createSessionToken = (userId) => {
  return createSignedToken({
    sub: String(userId),
    type: 'session',
  }, SESSION_DURATION_MS);
};

const createSignedToken = (payload, durationMs) => {
  const now = Date.now();
  const encodedPayload = toBase64Url(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + durationMs,
    })
  );
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
};

const verifySignedToken = (token = '') => {
  const [encodedPayload, signature] = token.split('.');

  if (!encodedPayload || !signature) {
    throw new Error('Invalid session token.');
  }

  const expectedSignature = signPayload(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw new Error('Invalid session token signature.');
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload));

  if (!payload.sub || !payload.exp || payload.exp < Date.now()) {
    throw new Error('Token expired.');
  }

  return payload;
};

const verifySessionToken = (token = '') => {
  const payload = verifySignedToken(token);

  if (payload.type !== 'session') {
    throw new Error('Invalid session token.');
  }

  return payload;
};

const createOtpVerificationToken = ({ email, purpose }) =>
  createSignedToken(
    {
      sub: String(email).toLowerCase(),
      purpose,
      type: 'otp',
    },
    OTP_TOKEN_DURATION_MS
  );

const verifyOtpVerificationToken = (token = '', expectedPurpose) => {
  const payload = verifySignedToken(token);

  if (payload.type !== 'otp' || !payload.sub || !payload.purpose) {
    throw new Error('Invalid OTP verification token.');
  }

  if (expectedPurpose && payload.purpose !== expectedPurpose) {
    throw new Error('OTP verification token purpose mismatch.');
  }

  return payload;
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');
  return `${salt}:${derivedKey}`;
};

const verifyPassword = (password, storedHash = '') => {
  const [salt, originalHash] = storedHash.split(':');

  if (!salt || !originalHash) {
    return false;
  }

  const suppliedHash = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');
  const originalBuffer = Buffer.from(originalHash, 'hex');
  const suppliedBuffer = Buffer.from(suppliedHash, 'hex');

  return (
    originalBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(originalBuffer, suppliedBuffer)
  );
};

module.exports = {
  createOtpVerificationToken,
  createSessionToken,
  hashPassword,
  verifyOtpVerificationToken,
  verifyPassword,
  verifySessionToken,
};
