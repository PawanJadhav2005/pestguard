const { query } = require('./db');
const { emit } = require('./realtime');

// Send an in-app notification to one user ({userId}) or a whole role ({role}).
// dedupeKey stops the same alert being created twice (e.g. overdue checks every minute).
async function notify({ userId = null, role = null, title, link = null, dedupeKey = null }, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO notifications (user_id, role, title, link, dedupe_key) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (dedupe_key) DO NOTHING RETURNING *`, [userId, role, title, link, dedupeKey]);
  if (rows[0]) emit(userId ? `user:${userId}` : `role:${role}`, 'notification', rows[0]);
  return rows[0] || null;
}
module.exports = { notify };
