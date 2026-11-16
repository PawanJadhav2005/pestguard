// Runs every .sql file in db/migrations once, in order.
const fs = require('fs');
const path = require('path');
require('../src/config');
const { pool } = require('../src/db');
(async () => {
  const dir = path.join(__dirname, '..', 'db', 'migrations');
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      console.log('Applied', f);
    } catch (e) { await client.query('ROLLBACK'); console.error('Failed', f, e.message); process.exit(1); }
    finally { client.release(); }
  }
  console.log('Database is up to date');
  await pool.end();
})();
