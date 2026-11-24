import fs from 'node:fs';

// The database password is never stored in the source or the repository.
// In Docker it is read from a file (DB_PASSWORD_FILE) that is generated at first start;
// outside Docker put a password into DATABASE_URL or use the standard PGPASSWORD variable.
export function dbPassword() {
  const file = process.env.DB_PASSWORD_FILE;
  return file ? fs.readFileSync(file, 'utf8').trim() : undefined;
}

// Turn a postgres:// URL into a pg connection config, filling the password from the secret file when the URL has none.
export function connectionConfig(urlString) {
  const url = new URL(urlString);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: url.password ? decodeURIComponent(url.password) : dbPassword(),
    database: decodeURIComponent(url.pathname.slice(1)),
  };
}
