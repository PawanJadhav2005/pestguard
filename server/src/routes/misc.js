// Follow-ups, notifications, services/prices, dashboard
const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../db');
const { allow } = require('../auth');
const { wrap, parse, HttpError } = require('../errors');
const { audit } = require('../audit');

router.get('/services', wrap(async (req, res) => res.json({ items: (await query('SELECT * FROM services ORDER BY name')).rows })));
router.patch('/services/:code', allow('admin'), wrap(async (req, res) => {
  const b = parse(z.object({ prices: z.record(z.enum(['1 BHK', '2 BHK', '3 BHK', 'Bungalow', 'Commercial']), z.number().positive().max(1e6)).optional(),
    warranty: z.string().max(40).optional(), active: z.boolean().optional() }), req.body);
  const { rows } = await query(`UPDATE services SET prices=COALESCE($1, prices), warranty=COALESCE($2, warranty), active=COALESCE($3, active) WHERE code=$4 RETURNING *`,
    [b.prices ? JSON.stringify(b.prices) : null, b.warranty ?? null, b.active ?? null, req.params.code]);
  if (!rows[0]) throw new HttpError(404, 'Service not found');
  await audit(req.user.id, 'update_service', 'service', null, { code: req.params.code, ...b });
  res.json({ service: rows[0] }); // existing jobs keep the price they were booked at
}));

router.get('/followups', allow('admin', 'callcenter'), wrap(async (req, res) => {
  const { rows } = await query(`SELECT f.*, c.name customer_name, c.ref customer_ref, c.area customer_area FROM followups f JOIN customers c ON c.id=f.customer_id
    WHERE NOT f.done ORDER BY f.due_at LIMIT 200`);
  const renewals = (await query(`SELECT a.*, c.name customer_name, c.ref customer_ref FROM amc_contracts a JOIN customers c ON c.id=a.customer_id
    WHERE a.end_date < current_date + 30 AND a.end_date > current_date - 60 ORDER BY a.end_date`)).rows;
  res.json({ items: rows, renewals });
}));
router.post('/followups', allow('admin', 'callcenter'), wrap(async (req, res) => {
  const b = parse(z.object({ customerId: z.number().int(), dueAt: z.string().datetime({ offset: true }), type: z.enum(['Callback', 'Renewal', 'Feedback']).default('Callback'), note: z.string().max(500).optional() }), req.body);
  const { rows } = await query(`INSERT INTO followups (customer_id, due_at, type, note, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [b.customerId, b.dueAt, b.type, b.note || null, req.user.id]);
  res.status(201).json({ followup: rows[0] });
}));
router.post('/followups/:id/done', allow('admin', 'callcenter'), wrap(async (req, res) => {
  const { rowCount } = await query('UPDATE followups SET done=true WHERE id=$1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Follow-up not found');
  res.json({ ok: true });
}));

router.get('/notifications', wrap(async (req, res) => {
  const { rows } = await query(`SELECT n.*, (r.user_id IS NOT NULL) read FROM notifications n
    LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.user_id=$1
    WHERE (n.user_id=$1 OR n.role=$2) AND n.created_at > now() - interval '30 days' ORDER BY n.created_at DESC LIMIT 100`, [req.user.id, req.user.role]);
  res.json({ items: rows, unread: rows.filter(r => !r.read).length });
}));
router.post('/notifications/read', wrap(async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int()).optional() }), req.body);
  await query(`INSERT INTO notification_reads (notification_id, user_id)
    SELECT n.id, $1 FROM notifications n WHERE (n.user_id=$1 OR n.role=$2) AND ($3::int[] IS NULL OR n.id = ANY($3)) ON CONFLICT DO NOTHING`,
    [req.user.id, req.user.role, ids || null]);
  res.json({ ok: true });
}));

router.get('/dashboard', allow('admin'), wrap(async (req, res) => {
  const one = async sql => (await query(sql)).rows[0];
  const counts = await one(`SELECT
    count(*) FILTER (WHERE status IN ('Pending','Assigned','Accepted','On the way','In Progress','On Hold','Awaiting Approval'))::int open,
    count(*) FILTER (WHERE status='Pending')::int unassigned,
    count(*) FILTER (WHERE status IN ('Assigned','Accepted') AND scheduled_at < now() - interval '30 minutes')::int overdue,
    count(*) FILTER (WHERE status='Awaiting Approval')::int awaiting,
    count(*) FILTER (WHERE scheduled_at >= date_trunc('day', now()) AND scheduled_at < date_trunc('day', now()) + interval '1 day' AND status<>'Cancelled')::int today,
    count(*) FILTER (WHERE status='Completed' AND completed_at > now() - interval '7 days')::int done7,
    COALESCE(sum(price) FILTER (WHERE status='Completed' AND completed_at > now() - interval '7 days'),0) revenue7
    FROM jobs`);
  const bySvc = (await query(`SELECT s.code, s.name, count(j.id)::int jobs, COALESCE(sum(j.price),0) revenue FROM services s
    LEFT JOIN jobs j ON j.service_code=s.code AND j.status='Completed' AND j.completed_at > now() - interval '7 days' GROUP BY s.code, s.name ORDER BY revenue DESC`)).rows;
  const lowStock = (await query(`SELECT id, name, quantity, unit, reorder_level FROM inventory_items WHERE active AND reorder_level > 0 AND quantity <= reorder_level ORDER BY quantity / NULLIF(reorder_level,0)`)).rows;
  const activeAmc = (await one(`SELECT count(*)::int n FROM amc_contracts WHERE end_date >= current_date`)).n;
  res.json({ counts: { ...counts, activeAmc }, bySvc, lowStock });
}));
module.exports = router;
