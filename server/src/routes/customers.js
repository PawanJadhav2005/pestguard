const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../db');
const { allow } = require('../auth');
const { wrap, parse, HttpError } = require('../errors');
const { customerOut } = require('../serialize');
const { audit } = require('../audit');

// List with server-side search, filter and pagination
router.get('/', allow('admin', 'callcenter'), wrap(async (req, res) => {
  const q = parse(z.object({
    q: z.string().max(100).optional(), area: z.string().max(60).optional(),
    amc: z.enum(['active', 'renewal', 'none']).optional(),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20)
  }), req.query);
  const where = [], p = [];
  if (q.q) { p.push(`%${q.q.toLowerCase()}%`); where.push(`(lower(c.name) LIKE $${p.length} OR lower(c.ref) LIKE $${p.length} OR lower(c.address) LIKE $${p.length})`); }
  if (q.area) { p.push(q.area); where.push(`c.area = $${p.length}`); }
  if (q.amc === 'active') where.push(`a.end_date >= current_date`);
  if (q.amc === 'renewal') where.push(`a.end_date < current_date + 30`);
  if (q.amc === 'none') where.push(`a.id IS NULL`);
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const base = `FROM customers c
    LEFT JOIN LATERAL (SELECT * FROM amc_contracts x WHERE x.customer_id=c.id ORDER BY end_date DESC LIMIT 1) a ON true
    LEFT JOIN LATERAL (
      SELECT d, price, service_code FROM (
        SELECT completed_at::date d, price, service_code FROM jobs WHERE customer_id=c.id AND status='Completed'
        UNION ALL SELECT service_date, price, service_code FROM service_history WHERE customer_id=c.id) h
      ORDER BY d DESC LIMIT 1) last ON true ${w}`;
  const total = (await query(`SELECT count(*)::int n ${base}`, p)).rows[0].n;
  p.push(q.pageSize, (q.page - 1) * q.pageSize);
  const { rows } = await query(`SELECT c.*, a.id amc_id, a.service_code amc_service, a.visits_done, a.visits_total, a.end_date amc_end,
      last.d last_date, last.price last_price, last.service_code last_service
    ${base} ORDER BY c.name LIMIT $${p.length - 1} OFFSET $${p.length}`, p);
  res.json({
    total, page: q.page, pageSize: q.pageSize,
    items: rows.map(r => ({ ...customerOut(r, req.user.role),
      amc: r.amc_id ? { service: r.amc_service, visitsDone: r.visits_done, visitsTotal: r.visits_total, endDate: r.amc_end } : null,
      lastService: r.last_date ? { date: r.last_date, price: r.last_price, service: r.last_service } : null }))
  });
}));

router.get('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role === 'technician') {
    const ok = await query(`SELECT 1 FROM jobs WHERE customer_id=$1 AND technician_id=$2 LIMIT 1`, [id, req.user.id]);
    if (!ok.rows.length) throw new HttpError(403, 'This customer is not on any of your jobs');
  }
  const c = (await query('SELECT * FROM customers WHERE id=$1', [id])).rows[0];
  if (!c) throw new HttpError(404, 'Customer not found');
  const [amc, history, openJobs, calls] = await Promise.all([
    query('SELECT * FROM amc_contracts WHERE customer_id=$1 ORDER BY end_date DESC', [id]),
    query(`SELECT * FROM (
        SELECT 'job' src, j.id, j.completed_at::date date, j.service_code, j.price, u.name technician_name, 'JB-'||j.id ref
          FROM jobs j LEFT JOIN users u ON u.id=j.technician_id WHERE j.customer_id=$1 AND j.status='Completed'
        UNION ALL SELECT 'import', h.id, h.service_date, h.service_code, h.price, h.technician_name, h.ref FROM service_history h WHERE h.customer_id=$1
      ) x ORDER BY date DESC LIMIT 50`, [id]),
    query(`SELECT j.id, j.service_code, j.status, j.scheduled_at, u.name technician_name FROM jobs j LEFT JOIN users u ON u.id=j.technician_id
           WHERE j.customer_id=$1 AND j.status NOT IN ('Completed','Cancelled','Unable to Complete') ORDER BY scheduled_at`, [id]),
    req.user.role === 'technician' ? { rows: [] } :
      query(`SELECT l.id, l.outcome, l.status, l.duration_sec, l.notes, l.created_at, u.name by_name FROM call_logs l JOIN users u ON u.id=l.user_id
             WHERE l.customer_id=$1 ORDER BY l.created_at DESC LIMIT 20`, [id])
  ]);
  await audit(req.user.id, 'view_customer', 'customer', id);
  res.json({ customer: customerOut(c, req.user.role), amc: amc.rows, history: history.rows, openJobs: openJobs.rows, calls: calls.rows });
}));

const customerSchema = z.object({
  ref: z.string().min(1).max(40).optional(), name: z.string().min(2).max(120), mobile: z.string().regex(/^\+?[0-9 ]{10,15}$/, 'enter a valid phone number'),
  address: z.string().min(5).max(300), area: z.string().max(60).optional(),
  propertyType: z.enum(['1 BHK', '2 BHK', '3 BHK', 'Bungalow', 'Commercial']).default('2 BHK'), notes: z.string().max(500).optional()
});
// Call center may enter a new customer's number but can never read it back
router.post('/', allow('admin', 'callcenter'), wrap(async (req, res) => {
  const b = parse(customerSchema, req.body);
  const ref = b.ref || `PG-${Date.now().toString().slice(-6)}`;
  try {
    const { rows } = await query(`INSERT INTO customers (ref,name,mobile,address,area,property_type,notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ref, b.name, b.mobile, b.address, b.area || null, b.propertyType, b.notes || null]);
    await audit(req.user.id, 'create_customer', 'customer', rows[0].id);
    res.status(201).json({ customer: customerOut(rows[0], req.user.role) });
  } catch (e) { if (e.code === '23505') throw new HttpError(409, `Customer reference ${ref} already exists`); throw e; }
}));
router.patch('/:id', allow('admin'), wrap(async (req, res) => {
  const b = parse(customerSchema.partial(), req.body);
  const map = { name: 'name', mobile: 'mobile', address: 'address', area: 'area', propertyType: 'property_type', notes: 'notes' };
  const sets = [], p = [];
  for (const [k, col] of Object.entries(map)) if (b[k] !== undefined) { p.push(b[k]); sets.push(`${col}=$${p.length}`); }
  if (!sets.length) throw new HttpError(400, 'Nothing to update');
  p.push(req.params.id);
  const { rows } = await query(`UPDATE customers SET ${sets.join(',')} WHERE id=$${p.length} RETURNING *`, p);
  if (!rows[0]) throw new HttpError(404, 'Customer not found');
  await audit(req.user.id, 'update_customer', 'customer', rows[0].id, Object.keys(b));
  res.json({ customer: customerOut(rows[0], req.user.role) });
}));
module.exports = router;
