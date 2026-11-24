import nodemailer from 'nodemailer';

// SMTP is configured only through environment variables (see .env.example), never in source control.
//   SMTP_HOST=relay1.dataart.com  SMTP_PORT=25  SMTP_SECURE=false  (no login needed for an internal relay)
// MAIL_TRANSPORT=memory keeps messages in memory (used by automated tests).

export const outbox = []; // messages captured when MAIL_TRANSPORT=memory

function buildTransport() {
  if (process.env.MAIL_TRANSPORT === 'memory') return null;
  if (!process.env.SMTP_HOST) return null;
  const auth = process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 25),
    secure: process.env.SMTP_SECURE === 'true', // true = TLS from the start (port 465); false = plain or STARTTLS
    auth,
    tls: { rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false' },
    connectionTimeout: 10000,
  });
}

const transport = buildTransport();
const FROM = process.env.SMTP_FROM || 'Ticket Tracker <no-reply@ticket-tracker.local>';

export async function sendMail({ to, subject, text, html }) {
  if (process.env.MAIL_TRANSPORT === 'memory') {
    outbox.push({ to, subject, text, html });
    return;
  }
  if (!transport) {
    // No SMTP configured: keep the app usable for local development by printing the message
    console.log(`[mail] SMTP_HOST is not set. Message to ${to}: ${subject}\n${text}`);
    return;
  }
  await transport.sendMail({ from: FROM, to, subject, text, html });
}

export function verificationEmail(link) {
  return {
    subject: 'Confirm your email for Ticket Tracker',
    text: `Welcome to Ticket Tracker!\n\nConfirm your email address by opening this link (valid for 24 hours, can be used once):\n\n${link}\n\nIf you did not sign up, ignore this email.\n`,
    html: `<p>Welcome to Ticket Tracker!</p><p>Confirm your email address by opening this link (valid for 24 hours, can be used once):</p><p><a href="${link}">${link}</a></p><p>If you did not sign up, ignore this email.</p>`,
  };
}
