import { Router } from 'express';
import { one, q, tx } from '../db.js';
import { ah, fail, randomToken, sha256 } from '../util.js';
import { hashPassword, verifyPassword, startSession, endSession, requireAuth } from '../auth.js';
import { sendMail, verificationEmail } from '../mailer.js';

const r = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_HOURS = 24;

const normalizeEmail = (v) => (typeof v === 'string' ? v.trim() : '');

function appBaseUrl(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '');
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return `${proto}://${host}`;
}

// Issues a new single-use token and invalidates all earlier unused ones, then emails the link
async function issueVerification(req, user) {
  const token = randomToken();
  await tx(async (t) => {
    await t.q(
      'UPDATE email_verification_tokens SET revoked_at = now() WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL',
      [user.id]
    );
    await t.q(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '${TOKEN_HOURS} hours')`,
      [user.id, sha256(token)]
    );
  });
  const link = `${appBaseUrl(req)}/verify-email?token=${encodeURIComponent(token)}`;
  try {
    await sendMail({ to: user.email, ...verificationEmail(link) });
    return true;
  } catch (e) {
    console.error(`Could not send verification email to ${user.email}: ${e.message}`);
    return false;
  }
}

r.post('/signup', ah(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  if (!EMAIL_RE.test(email)) fail(400, 'Enter a valid email address', 'VALIDATION_ERROR');
  if (typeof password !== 'string' || password.length < 8) fail(400, 'Password must be at least 8 characters', 'VALIDATION_ERROR');
  if (await one('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])) {
    fail(409, 'An account with this email already exists', 'EMAIL_TAKEN');
  }
  const user = await one(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [email, await hashPassword(password)]
  );
  const emailSent = await issueVerification(req, user);
  res.status(201).json({
    message: emailSent
      ? 'Account created. Check your inbox and open the verification link to activate it.'
      : 'Account created, but the verification email could not be sent. Use "Resend email" to try again.',
    emailSent,
  });
}));

r.post('/verify-email', ah(async (req, res) => {
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  const row = token ? await one('SELECT * FROM email_verification_tokens WHERE token_hash = $1', [sha256(token)]) : null;
  if (!row || row.used_at || row.revoked_at || row.expires_at < new Date()) {
    fail(400, 'This verification link is invalid or has expired. Request a new one.', 'INVALID_OR_EXPIRED_TOKEN');
  }
  await tx(async (t) => {
    await t.q('UPDATE email_verification_tokens SET used_at = now() WHERE id = $1', [row.id]);
    await t.q('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [row.user_id]);
  });
  res.json({ message: 'Email verified. You can now log in.' });
}));

// Resend works by email (login screen) or by an old token (verification result screen)
r.post('/resend-verification', ah(async (req, res) => {
  let user = null;
  if (typeof req.body.token === 'string' && req.body.token) {
    user = await one(
      `SELECT u.id, u.email, u.email_verified_at FROM email_verification_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1`,
      [sha256(req.body.token)]
    );
  } else {
    const email = normalizeEmail(req.body.email);
    if (!EMAIL_RE.test(email)) fail(400, 'Enter a valid email address', 'VALIDATION_ERROR');
    user = await one('SELECT id, email, email_verified_at FROM users WHERE lower(email) = lower($1)', [email]);
  }
  if (user && !user.email_verified_at) await issueVerification(req, user);
  // Same answer in every case, so the endpoint cannot be used to discover accounts
  res.json({ message: 'If an unverified account exists for this address, a new verification email has been sent.' });
}));

r.post('/login', ah(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const user = await one('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  if (!user || !(await verifyPassword(String(req.body.password || ''), user.password_hash))) {
    fail(401, 'Wrong email or password', 'INVALID_CREDENTIALS');
  }
  if (!user.email_verified_at) {
    fail(403, 'Your email address is not verified yet. Check your inbox or resend the email.', 'EMAIL_NOT_VERIFIED');
  }
  await startSession(res, user.id);
  res.json({ user: { id: user.id, email: user.email } });
}));

r.post('/logout', ah(async (req, res) => {
  await endSession(req, res);
  res.json({ message: 'Logged out' });
}));

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default r;
