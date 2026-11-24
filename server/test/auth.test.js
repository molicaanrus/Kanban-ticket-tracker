import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, client, outbox, tokenFromEmail, q } from './helpers.js';

let ctx;
before(async () => { ctx = await startServer(); });
after(() => stopServer(ctx.server));

test('sign-up -> verification email -> login is blocked until verified -> verify -> login works', async () => {
  const c = client(ctx.base);
  const email = '  Alice@Example.com ';

  let r = await c.post('/api/auth/signup', { email, password: 'short' });
  assert.equal(r.status, 400, 'passwords under 8 characters are rejected');

  r = await c.post('/api/auth/signup', { email, password: 'password123' });
  assert.equal(r.status, 201);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, 'Alice@Example.com', 'email is trimmed');
  assert.match(outbox[0].text, /\/verify-email\?token=/);

  const [stored] = await q('SELECT email, password_hash, email_verified_at FROM users');
  assert.match(stored.password_hash, /^\$argon2id\$/, 'password is hashed with Argon2id');
  assert.ok(!stored.password_hash.includes('password123'));
  assert.equal(stored.email_verified_at, null);

  r = await c.post('/api/auth/signup', { email: 'ALICE@example.COM', password: 'password123' });
  assert.equal(r.status, 409, 'emails are unique case-insensitively');

  r = await c.post('/api/auth/login', { email: 'alice@example.com', password: 'password123' });
  assert.equal(r.status, 403);
  assert.equal(r.data.code, 'EMAIL_NOT_VERIFIED');

  r = await c.get('/api/teams');
  assert.equal(r.status, 401, 'protected endpoints need a session');

  const token = tokenFromEmail(outbox[0]);
  r = await c.post('/api/auth/verify-email', { token });
  assert.equal(r.status, 200);

  r = await c.post('/api/auth/verify-email', { token });
  assert.equal(r.status, 400, 'a token is single-use');

  r = await c.post('/api/auth/login', { email: 'alice@example.com', password: 'wrong-password' });
  assert.equal(r.status, 401);

  r = await c.post('/api/auth/login', { email: 'alice@example.com', password: 'password123' });
  assert.equal(r.status, 200);
  r = await c.get('/api/auth/me');
  assert.equal(r.status, 200);
  r = await c.get('/api/teams');
  assert.equal(r.status, 200);

  await c.post('/api/auth/logout');
  r = await c.get('/api/teams');
  assert.equal(r.status, 401, 'logout ends the session');
});

test('resend issues a new token and invalidates earlier unused ones; expired tokens are rejected', async () => {
  const c = client(ctx.base);
  await c.post('/api/auth/signup', { email: 'bob@example.com', password: 'password123' });
  const first = tokenFromEmail(outbox.at(-1));

  const r = await c.post('/api/auth/resend-verification', { email: 'bob@example.com' });
  assert.equal(r.status, 200);
  const second = tokenFromEmail(outbox.at(-1));
  assert.notEqual(first, second);

  let v = await c.post('/api/auth/verify-email', { token: first });
  assert.equal(v.status, 400, 'older token no longer works');

  await q(`UPDATE email_verification_tokens SET expires_at = now() - interval '1 minute' WHERE revoked_at IS NULL AND used_at IS NULL`);
  v = await c.post('/api/auth/verify-email', { token: second });
  assert.equal(v.status, 400, 'tokens expire (24 h)');
  assert.equal(v.data.code, 'INVALID_OR_EXPIRED_TOKEN');

  // resend from the verification-result screen using the dead token
  const before = outbox.length;
  await c.post('/api/auth/resend-verification', { token: second });
  assert.equal(outbox.length, before + 1);
  v = await c.post('/api/auth/verify-email', { token: tokenFromEmail(outbox.at(-1)) });
  assert.equal(v.status, 200);
});

test('a fresh account has an expiry of exactly 24 hours', async () => {
  const [row] = await q(`SELECT extract(epoch FROM (expires_at - created_at)) AS secs FROM email_verification_tokens ORDER BY id LIMIT 1`);
  assert.ok(Math.abs(row.secs - 24 * 3600) < 5);
});
