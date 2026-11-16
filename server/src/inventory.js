const { HttpError } = require('./errors');
const { notify } = require('./notify');

// Change an item's stock and record why. Must run inside a transaction (db = client).
// Locks the row so two people changing stock at once can't lose an update.
async function applyMovement(db, { itemId, change, reason, jobId = null, userId = null, note = null }) {
  const item = (await db.query('SELECT * FROM inventory_items WHERE id=$1 FOR UPDATE', [itemId])).rows[0];
  if (!item) throw new HttpError(400, `Inventory item ${itemId} not found`);
  if (!item.active && change < 0) throw new HttpError(409, `${item.name} is no longer in use`);
  const next = Math.round((Number(item.quantity) + Number(change)) * 100) / 100;
  if (next < 0) throw new HttpError(409, `Not enough ${item.name} in store: ${item.quantity} ${item.unit} available, ${Math.abs(change)} ${item.unit} needed. Ask the admin to add stock.`,
    { itemId: item.id, available: item.quantity });
  const upd = (await db.query('UPDATE inventory_items SET quantity=$1, updated_at=now() WHERE id=$2 RETURNING *', [next, item.id])).rows[0];
  await db.query(`INSERT INTO inventory_movements (item_id, change, reason, balance_after, job_id, user_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [item.id, change, reason, next, jobId, userId, note]);
  return upd;
}

// Alert admins once when an item drops to or below its reorder level.
// The dedupe key includes the day, so it re-alerts at most once a day while still low.
async function lowStockCheck(item) {
  if (Number(item.reorder_level) > 0 && Number(item.quantity) <= Number(item.reorder_level)) {
    await notify({ role: 'admin', title: `Low stock: ${item.name} (${item.quantity} ${item.unit} left)`, link: '/inventory',
      dedupeKey: `low:${item.id}:${new Date().toISOString().slice(0, 10)}` });
  }
}
module.exports = { applyMovement, lowStockCheck };
