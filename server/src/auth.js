import crypto from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';
import { one, q } from './db.js';
import { fail, randomToken, sha256 } from './util.js';

export const COOKIE = 'tt_session';
const SESSION_DAYS = 14;

// Argon2id with OWASP-recommended parameters (19 MiB memory, 2 iterations, 1 lane)
export async function hashPassword(password) {
  return argon2id({
    password,
    salt: crypto.randomBytes(16),
    parallelism: 1,
    iterations: 2,
    memorySize: 19456,
    hashLength: 32,
    outputType: 'encoded',
  });
}

export async function verifyPassword(password, hash) {
  try {
    return await argon2Verify({ password, hash });
  } catch {
    return false;
  }
}

export async function startSession(res, userId) {
  const token = randomToken();
  await q(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
    [sha256(token), userId]
  );
  // The session id lives only in an httpOnly cookie, never in URLs
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600 * 1000,
  });
}

export async function endSession(req, res) {
  const token = req.cookies[COOKIE];
  if (token) await q('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  res.clearCookie(COOKIE, { path: '/' });
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE];
    const row = token
      ? await one(
          `SELECT u.id, u.email, u.email_verified_at FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = $1 AND s.expires_at > now()`,
          [sha256(token)]
        )
      : null;
    if (!row) fail(401, 'Please log in', 'UNAUTHENTICATED');
    if (!row.email_verified_at) fail(403, 'Please verify your email address first', 'EMAIL_NOT_VERIFIED');
    req.user = { id: row.id, email: row.email };
    next();
  } catch (e) {
    next(e);
  }
}
