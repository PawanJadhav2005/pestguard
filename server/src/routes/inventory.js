const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { allow } = require('../auth');
const { wrap, parse, HttpError } = require('../errors');
const { emit } = require('../realtime');
const { audit } = require('../audit');
const { applyMovement, lowStockCheck } = require('../inventory');

const changed = ids => emit(['role:admin', 'role:technician'], 'inventory:changed', { itemIds: [].concat(ids) });

// Admin sees everything; technicians see a short list to pick chemicals in reports
router.get('/', wrap(async (req, res) => {
  if (req.user.role === 'admin') {
    const { rows } = await query(`SELECT i.*, (i.reorder_level > 0 AND i.quantity <= i.reorder_level) low,
        COALESCE((SELECT -sum(change) FROM inventory_movements m WHERE m.item_id=i.id AND m.reason='job_usage' AND m.created_at > now() - interval '30 days'),0) used_30d
      FROM inventory_items i ORDER BY i.active DESC, i.category, i.name`);
    return res.json({ items: rows });
  }
  if (req.user.role !== 'technician') throw new HttpError(403, 'You do not have permission to do this');
  const { rows } = await query(`SELECT id, name, unit, category, quantity FROM inventory_items WHERE active AND category IN ('chemical','consumable') ORDER BY name`);
  res.json({ items: rows });
}));

const itemSchema = z.object({
  sku: z.string().min(2).max(40), name: z.string().min(2).max(120),
  category: z.enum(['chemical', 'equipment', 'consumable', 'safety']), unit: z.string().min(1).max(12),
  quantity: z.number().min(0).max(1e7).default(0), reorderLevel: z.number().min(0).max(1e7).default(0),
  costPerUnit: z.number().min(0).max(1e6).default(0)
});
router.post('/', allow('admin'), wrap(async (req, res) => {
  const b = parse(itemSchema, req.body);
  const item = await tx(async db => {
    let it;
    try {
      it = (await db.query(`INSERT INTO inventory_items (sku,name,category,unit,quantity,reorder_level,cost_per_unit) VALUES ($1,$2,$3,$4,0,$5,$6) RETURNING *`,
        [b.sku.toUpperCase(), b.name, b.category, b.unit, b.reorderLevel, b.costPerUnit])).rows[0];
    } catch (e) { if (e.code === '23505') throw new HttpError(409, `SKU ${b.sku.toUpperCase()} already exists`); throw e; }
    if (b.quantity > 0) it = await applyMovement(db, { itemId: it.id, change: b.quantity, reason: 'stock_in', userId: req.user.id, note: 'Opening stock' });
    return it;
  });
  await audit(req.user.id, 'create_item', 'inventory_item', item.id);
  changed(item.id);
  res.status(201).json({ item });
}));

router.patch('/:id', allow('admin'), wrap(async (req, res) => {
  const b = parse(itemSchema.omit({ quantity: true, sku: true }).partial().extend({ active: z.boolean().optional() }), req.body);
  const map = { name: 'name', category: 'category', unit: 'unit', reorderLevel: 'reorder_level', costPerUnit: 'cost_per_unit', active: 'active' };
  const sets = [], p = [];
  for (const [k, col] of Object.entries(map)) if (b[k] !== undefined) { p.push(b[k]); sets.push(`${col}=$${p.length}`); }
  if (!sets.length) throw new HttpError(400, 'Nothing to update');
  p.push(req.params.id);
  const { rows } = await query(`UPDATE inventory_items SET ${sets.join(',')}, updated_at=now() WHERE id=$${p.length} RETURNING *`, p);
  if (!rows[0]) throw new HttpError(404, 'Item not found');
  await audit(req.user.id, 'update_item', 'inventory_item', rows[0].id, b);
  changed(rows[0].id);
  res.json({ item: rows[0] });
}));

// Add stock (+), remove stock (-) or correct a count. Quantity updates instantly everywhere.
router.post('/:id/adjust', allow('admin'), wrap(async (req, res) => {
  const b = parse(z.object({
    reason: z.enum(['stock_in', 'stock_out', 'adjustment']), quantity: z.number().positive().max(1e7).optional(),
    countedQuantity: z.number().min(0).max(1e7).optional(), note: z.string().max(300).optional()
  }), req.body);
  const item = await tx(async db => {
    let change;
    if (b.reason === 'adjustment') {
      if (b.countedQuantity === undefined) throw new HttpError(400, 'Enter the counted quantity');
      const cur = (await db.query('SELECT quantity FROM inventory_items WHERE id=$1', [req.params.id])).rows[0];
      if (!cur) throw new HttpError(404, 'Item not found');
      change = b.countedQuantity - Number(cur.quantity);
      if (change === 0) throw new HttpError(400, 'Counted quantity is the same as current stock');
    } else {
      if (!b.quantity) throw new HttpError(400, 'Enter a quantity');
      change = b.reason === 'stock_in' ? b.quantity : -b.quantity;
    }
    return applyMovement(db, { itemId: Number(req.params.id), change, reason: b.reason, userId: req.user.id, note: b.note || null });
  });
  await lowStockCheck(item);
  await audit(req.user.id, `inventory_${b.reason}`, 'inventory_item', item.id, b);
  changed(item.id);
  res.json({ item });
}));

router.get('/movements', allow('admin'), wrap(async (req, res) => {
  const { itemId, limit } = parse(z.object({ itemId: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }), req.query);
  const p = [limit]; let w = '';
  if (itemId) { p.push(itemId); w = 'WHERE m.item_id=$2'; }
  const { rows } = await query(`SELECT m.*, i.name item_name, i.unit, u.name user_name FROM inventory_movements m
    JOIN inventory_items i ON i.id=m.item_id LEFT JOIN users u ON u.id=m.user_id ${w} ORDER BY m.created_at DESC, m.id DESC LIMIT $1`, p);
  res.json({ items: rows });
}));
module.exports = router;
