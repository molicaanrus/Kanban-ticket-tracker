// Shared test setup: runs the real app against a dedicated test database and captures emails in memory.
process.env.MAIL_TRANSPORT = 'memory';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://tracker@localhost:5432/tracker_test';

// Create the test database if it does not exist yet (e.g. first run inside docker compose)
{
  const pg = (await import('pg')).default;
  const url = new URL(process.env.DATABASE_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';
  const { connectionConfig } = await import('../src/dbconfig.js');
  const admin = new pg.Client(connectionConfig(url.toString()));
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();
}

const { migrate, pool, q } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { outbox } = await import('../src/mailer.js');

export { pool, q, outbox };

export async function startServer() {
  await migrate();
  await q('TRUNCATE users, teams RESTART IDENTITY CASCADE');
  outbox.length = 0;
  const server = await new Promise((resolve) => {
    const s = createApp().listen(0, () => resolve(s));
  });
  return { server, base: `http://localhost:${server.address().port}` };
}

export async function stopServer(server) {
  await new Promise((r) => server.close(r));
  await pool.end();
}

// Tiny HTTP client that keeps cookies like a browser
export function client(base) {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  };
  return {
    get: (u) => call('GET', u),
    post: (u, b = {}) => call('POST', u, b),
    patch: (u, b) => call('PATCH', u, b),
    del: (u) => call('DELETE', u),
  };
}

export const tokenFromEmail = (mail) => new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');

// Creates a verified, logged-in user through the real API
export async function verifiedUser(base, email, password = 'password123') {
  const c = client(base);
  await c.post('/api/auth/signup', { email, password });
  const mail = [...outbox].reverse().find((m) => m.to === email.trim());
  await c.post('/api/auth/verify-email', { token: tokenFromEmail(mail) });
  const login = await c.post('/api/auth/login', { email, password });
  if (login.status !== 200) throw new Error('login failed in test setup');
  return c;
}
