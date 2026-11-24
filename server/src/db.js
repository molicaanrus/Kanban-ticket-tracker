import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

// BIGINT ids come back as strings by default; our ids fit safely into JS numbers
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://tracker:tracker@localhost:5432/tracker',
  max: 20,
});

export async function q(text, params) {
  return (await pool.query(text, params)).rows;
}

export async function one(text, params) {
  return (await q(text, params))[0] || null;
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn({
      q: async (t, p) => (await client.query(t, p)).rows,
      one: async (t, p) => (await client.query(t, p)).rows[0] || null,
    });
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function waitForDatabase() {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      console.log(`Waiting for database (attempt ${attempt}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Database is not reachable');
}

// Applies every migrations/*.sql file once, in name order, each in its own transaction.
// Only schema is created: no seed or sample data is ever loaded.
export async function migrate() {
  await waitForDatabase();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(424242)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const done = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied migration ${file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${e.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(424242)').catch(() => {});
    client.release();
  }
}
