const nodemailer = require('nodemailer');

let transporter;

const getTransporter = () => {
  if (transporter) {
    return transporter;
  }

  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

  if (!host || !port || !user || !pass) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  return transporter;
};

const sendOtpEmail = async ({ email, code, purpose }) => {
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();

  if (!from) {
    throw new Error('SMTP_FROM or SMTP_USER must be configured.');
  }

  const subject =
    purpose === 'register'
      ? 'Your ChirpChat registration OTP'
      : purpose === 'change-password'
        ? 'Your ChirpChat password change OTP'
        : 'Your ChirpChat password reset OTP';

  const action =
    purpose === 'register'
      ? 'complete your ChirpChat registration'
      : purpose === 'change-password'
        ? 'change your ChirpChat password'
        : 'reset your ChirpChat password';

  await getTransporter().sendMail({
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
  });
};

module.exports = {
  sendOtpEmail,
};
