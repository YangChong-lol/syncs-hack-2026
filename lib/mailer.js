const nodemailer = require('nodemailer');

function configured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function send(to, subject, body) {
  if (!configured()) {
    return {
      sent: false,
      note: 'Email preview only. Set SMTP_HOST / SMTP_USER / SMTP_PASS in .env to send real emails.',
    };
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: `"FridgeTinder" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject,
    text: body,
  });
  return { sent: true, note: 'Sent anonymously via FridgeTinder relay.' };
}

module.exports = { send, configured };
