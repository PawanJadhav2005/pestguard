const { query } = require('./db');
async function audit(userId, action, entity = null, entityId = null, details = null, db = { query }) {
  await db.query('INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
    [userId, action, entity, entityId, details ? JSON.stringify(details) : null]);
}
module.exports = { audit };
