const { Pool } = require('pg');
const { databaseUrl, timezone } = require('./config');
// Every connection uses the business time zone, so "today" means today in India
const pool = new Pool({ connectionString: databaseUrl, max: 10, options: `-c TimeZone=${timezone}` });
// NUMERIC columns come back as strings by default; turn them into numbers
require('pg').types.setTypeParser(1700, v => (v === null ? null : Number(v)));

async function query(text, params) { return pool.query(text, params); }
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}
module.exports = { pool, query, tx };
