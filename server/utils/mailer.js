const nodemailer = require('nodemailer');

let transporter;

const DEFAULT_EMAIL_REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_SMTP_CONNECTION_TIMEOUT_MS = 10000;
const DEFAULT_SMTP_GREETING_TIMEOUT_MS = 10000;
const DEFAULT_SMTP_SOCKET_TIMEOUT_MS = 15000;

const parsePositiveInteger = (value, fallback) => {
  const parsedValue = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const readEnv = (name) => process.env[name]?.trim() || '';

class EmailConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmailConfigurationError';
    this.statusCode = 500;
  }
}

class EmailDeliveryError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'EmailDeliveryError';
    this.statusCode = 503;

    if (cause) {
      this.cause = cause;
    }
  }
}

const getEmailProvider = () => {
  const configuredProvider = readEnv('EMAIL_PROVIDER').toLowerCase();

  if (!configuredProvider) {
    return readEnv('RESEND_API_KEY') ? 'resend' : 'smtp';
  }

  if (!['auto', 'resend', 'smtp'].includes(configuredProvider)) {
    throw new EmailConfigurationError(
      'EMAIL_PROVIDER must be one of auto, resend, or smtp.'
    );
  }

  if (configuredProvider === 'auto') {
    return readEnv('RESEND_API_KEY') ? 'resend' : 'smtp';
  }

  return configuredProvider;
};

const getFromAddress = () =>
  readEnv('EMAIL_FROM') || readEnv('SMTP_FROM') || readEnv('SMTP_USER');
const getSupportEmail = () => readEnv('SUPPORT_EMAIL') || 'chirpchat404@gmail.com';

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toEmailDeliveryError = (error, provider) => {
  if (error instanceof EmailConfigurationError || error instanceof EmailDeliveryError) {
    return error;
  }

  if (provider === 'smtp') {
    if (error?.code === 'ETIMEDOUT' && error?.command === 'CONN') {
      return new EmailDeliveryError(
        'Could not deliver the email because the SMTP connection timed out. Free Render web services block outbound SMTP traffic on ports 25, 465, and 587, so use RESEND_API_KEY or move this service to a paid Render instance.',
        error
      );
    }

    if (error?.code === 'EAUTH') {
      return new EmailConfigurationError(
        'Could not authenticate with the SMTP provider. Check SMTP_USER, SMTP_PASS, and SMTP_FROM.'
      );
    }

    return new EmailDeliveryError(
      error?.message
        ? `Could not deliver the email via SMTP: ${error.message}`
        : 'Could not deliver the email via SMTP.',
      error
    );
  }

  return new EmailDeliveryError(
    error?.message
      ? `Could not deliver the email: ${error.message}`
      : 'Could not deliver the email.',
    error
  );
};

const getTransporter = () => {
  if (transporter) {
    return transporter;
  }

  const host = readEnv('SMTP_HOST');
  const port = Number(process.env.SMTP_PORT || 587);
  const user = readEnv('SMTP_USER');
  const pass = readEnv('SMTP_PASS');
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

  if (!host || !port || !user || !pass) {
    throw new EmailConfigurationError(
      'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.'
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    connectionTimeout: parsePositiveInteger(
      process.env.SMTP_CONNECTION_TIMEOUT_MS,
      DEFAULT_SMTP_CONNECTION_TIMEOUT_MS
    ),
    greetingTimeout: parsePositiveInteger(
      process.env.SMTP_GREETING_TIMEOUT_MS,
      DEFAULT_SMTP_GREETING_TIMEOUT_MS
    ),
    socketTimeout: parsePositiveInteger(
      process.env.SMTP_SOCKET_TIMEOUT_MS,
      DEFAULT_SMTP_SOCKET_TIMEOUT_MS
    ),
    auth: {
      user,
      pass,
    },
  });

  return transporter;
};

const buildOtpEmail = ({ email, code, purpose }) => {
  const from = getFromAddress();

  if (!from) {
    throw new EmailConfigurationError('EMAIL_FROM, SMTP_FROM, or SMTP_USER must be configured.');
  }

  const subject =
    purpose === 'change-password'
      ? 'Your ChirpChat password change OTP'
      : 'Your ChirpChat password reset OTP';

  const action =
    purpose === 'change-password'
      ? 'change your ChirpChat password'
      : 'reset your ChirpChat password';

  return {
    from,
    to: email,
    subject,
    text: `Your ChirpChat OTP is ${code}. Use it within 10 minutes to ${action}. If you did not request this code, ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#102734;">
        <h2 style="margin:0 0 12px;">ChirpChat verification</h2>
        <p style="font-size:15px;line-height:1.6;">Use this 6-digit OTP to ${action}:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#eef7fb;border-radius:12px;padding:18px 20px;text-align:center;margin:20px 0;">
          ${code}
        </div>
        <p style="font-size:14px;line-height:1.6;">This code expires in 10 minutes. If you did not request it, you can safely ignore this email.</p>
      </div>
    `,
  };
};

const buildAccountCreatedEmail = ({ user }) => {
  const from = getFromAddress();

  if (!from) {
    throw new EmailConfigurationError('EMAIL_FROM, SMTP_FROM, or SMTP_USER must be configured.');
  }

  const name = String(user?.name || 'there').trim();
  const email = String(user?.email || '').trim();
  const username = String(user?.username || '').trim();

  return {
    from,
    to: email,
    subject: 'Your ChirpChat account has been created',
    text: `Hi ${name}, your ChirpChat account has been created. You can now log in with your email or username (${username}) and your password. If you did not create this account, contact support.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#102734;">
        <h2 style="margin:0 0 12px;">Welcome to ChirpChat</h2>
        <p style="font-size:15px;line-height:1.6;">Hi ${escapeHtml(name)}, your ChirpChat account has been created.</p>
        <div style="background:#eef7fb;border-radius:12px;padding:16px;margin:18px 0;">
          <p style="margin:0 0 8px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p style="margin:0;"><strong>Username:</strong> ${escapeHtml(username)}</p>
        </div>
        <p style="font-size:14px;line-height:1.6;">You can now log in with your email or username and your password.</p>
        <p style="font-size:14px;line-height:1.6;">If you did not create this account, contact support.</p>
      </div>
    `,
  };
};

const buildFeedbackEmail = ({ user, feedbackType, subject, message, rating }) => {
  const from = getFromAddress();
  const to = getSupportEmail();

  if (!from) {
    throw new EmailConfigurationError('EMAIL_FROM, SMTP_FROM, or SMTP_USER must be configured.');
  }

  const safeType = String(feedbackType || 'feedback').trim();
  const safeSubject = String(subject || 'ChirpChat feedback').trim();
  const safeMessage = String(message || '').trim();
  const safeRating = Number(rating);
  const senderName = String(user?.name || 'ChirpChat user').trim();
  const senderEmail = String(user?.email || '').trim();
  const senderUsername = String(user?.username || '').trim();
  const title = `[ChirpChat ${safeType}] ${safeSubject}`;

  return {
    from,
    to,
    replyTo: senderEmail || undefined,
    subject: title,
    text: [
      `Type: ${safeType}`,
      `Rating: ${safeRating}/5`,
      `From: ${senderName} (@${senderUsername})`,
      `Email: ${senderEmail}`,
      '',
      safeMessage,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#102734;">
        <h2 style="margin:0 0 16px;">New ChirpChat ${escapeHtml(safeType)}</h2>
        <div style="background:#eef7fb;border-radius:12px;padding:16px;margin-bottom:18px;">
          <p style="margin:0 0 8px;"><strong>Rating:</strong> ${escapeHtml(String(safeRating))}/5</p>
          <p style="margin:0 0 8px;"><strong>From:</strong> ${escapeHtml(senderName)} (@${escapeHtml(senderUsername)})</p>
          <p style="margin:0;"><strong>Email:</strong> ${escapeHtml(senderEmail)}</p>
        </div>
        <p style="font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(safeMessage)}</p>
      </div>
    `,
  };
};

const sendViaSmtp = async (message) => {
  try {
    await getTransporter().sendMail(message);
  } catch (error) {
    throw toEmailDeliveryError(error, 'smtp');
  }
};

const extractResendErrorMessage = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }

  return '';
};

const sendViaResend = async (message) => {
  const apiKey = readEnv('RESEND_API_KEY');

  if (!apiKey) {
    throw new EmailConfigurationError(
      'RESEND_API_KEY is not configured. Set it or switch EMAIL_PROVIDER to smtp.'
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    parsePositiveInteger(process.env.EMAIL_REQUEST_TIMEOUT_MS, DEFAULT_EMAIL_REQUEST_TIMEOUT_MS)
  );

  try {
    // Resend uses HTTPS, which works on Render free instances where SMTP is blocked.
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo ? [message.replyTo] : undefined,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const resendErrorMessage = extractResendErrorMessage(payload);
      throw new EmailDeliveryError(
        resendErrorMessage
          ? `Resend API rejected the email: ${resendErrorMessage}`
          : 'Resend API rejected the email.'
      );
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new EmailDeliveryError(
        'The email provider took too long to respond while sending the email.',
        error
      );
    }

    throw toEmailDeliveryError(error, 'resend');
  } finally {
    clearTimeout(timeout);
  }
};

const sendOtpEmail = async ({ email, code, purpose }) => {
  const provider = getEmailProvider();
  const message = buildOtpEmail({ email, code, purpose });

  if (provider === 'resend') {
    await sendViaResend(message);
    return;
  }

  await sendViaSmtp(message);
};

const sendAccountCreatedEmail = async ({ user }) => {
  const provider = getEmailProvider();
  const message = buildAccountCreatedEmail({ user });

  if (provider === 'resend') {
    await sendViaResend(message);
    return;
  }

  await sendViaSmtp(message);
};

const sendFeedbackEmail = async ({ user, feedbackType, subject, message, rating }) => {
  const provider = getEmailProvider();
  const feedbackMessage = buildFeedbackEmail({ user, feedbackType, subject, message, rating });

  if (provider === 'resend') {
    await sendViaResend(feedbackMessage);
    return;
  }

  await sendViaSmtp(feedbackMessage);
};

module.exports = {
  sendAccountCreatedEmail,
  sendFeedbackEmail,
  sendOtpEmail,
};
