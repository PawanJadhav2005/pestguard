const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { allow } = require('../auth');
const { wrap, parse, HttpError } = require('../errors');
const { customerOut } = require('../serialize');
const { notify } = require('../notify');
const { emit } = require('../realtime');
const { audit } = require('../audit');

const OPEN = ['Pending', 'Assigned', 'Accepted', 'On the way', 'In Progress', 'On Hold', 'Awaiting Approval'];
// What a technician may change a job's status to, from each status
const TECH_TRANSITIONS = {
  'Assigned': ['Accepted'],
  'Accepted': ['On the way'],
  'On the way': ['In Progress'],
  'In Progress': ['On Hold', 'Unable to Complete'],
  'On Hold': ['In Progress', 'Unable to Complete']
};

const JOB_SELECT = `SELECT j.*, s.name service_name, s.warranty, u.name technician_name,
  c.id c_id, c.ref c_ref, c.name c_name, c.mobile c_mobile, c.address c_address, c.area c_area, c.property_type c_property_type, c.notes c_notes,
  a.visits_done amc_visits_done, a.visits_total amc_visits_total
  FROM jobs j JOIN services s ON s.code=j.service_code JOIN customers c ON c.id=j.customer_id
  LEFT JOIN users u ON u.id=j.technician_id LEFT JOIN amc_contracts a ON a.id=j.amc_id`;

function jobOut(r, role) {
  return {
    id: r.id, ref: `JB-${r.id}`, status: r.status, priority: r.priority, infestation: r.infestation,
    serviceCode: r.service_code, serviceName: r.service_name, warranty: r.warranty,
    propertyType: r.property_type, price: r.price, scheduledAt: r.scheduled_at, notes: r.notes,
    technicianId: r.technician_id, technicianName: r.technician_name, completedAt: r.completed_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
    overdue: ['Pending', 'Assigned', 'Accepted'].includes(r.status) && new Date(r.scheduled_at) < new Date(Date.now() - 30 * 60000),
    amc: r.amc_id ? { visitsDone: r.amc_visits_done, visitsTotal: r.amc_visits_total } : null,
    customer: customerOut({ id: r.c_id, ref: r.c_ref, name: r.c_name, mobile: r.c_mobile, address: r.c_address, area: r.c_area, property_type: r.c_property_type, notes: r.c_notes }, role)
  };
}
async function loadJob(id, db = { query }) {
  const r = (await db.query(`${JOB_SELECT} WHERE j.id=$1`, [id])).rows[0];
  if (!r) throw new HttpError(404, 'Job not found');
  return r;
}
function assertCanSee(user, row) {
  if (user.role === 'technician' && row.technician_id !== user.id) throw new HttpError(403, 'This job is not assigned to you');
}
async function event(db, jobId, userId, text) { await db.query('INSERT INTO job_events (job_id,user_id,text) VALUES ($1,$2,$3)', [jobId, userId, text]); }
function broadcastJob(job, extraRooms = []) {
  const rooms = ['role:admin', 'role:callcenter', ...extraRooms];
  if (job.technician_id) rooms.push(`user:${job.technician_id}`);
  emit([...new Set(rooms)], 'job:updated', { id: job.id, status: job.status });
}

// ---- List ----
router.get('/', wrap(async (req, res) => {
  const q = parse(z.object({
    status: z.string().optional(), view: z.enum(['open', 'attention', 'today', 'done', 'all']).default('all'),
    technicianId: z.coerce.number().int().optional(), customerId: z.coerce.number().int().optional(),
    from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100)
  }), req.query);
  const where = [], p = [];
  if (req.user.role === 'technician') { p.push(req.user.id); where.push(`j.technician_id=$${p.length}`); }
  else if (q.technicianId) { p.push(q.technicianId); where.push(`j.technician_id=$${p.length}`); }
  if (q.customerId) { p.push(q.customerId); where.push(`j.customer_id=$${p.length}`); }
  if (q.status) { p.push(q.status.split(',')); where.push(`j.status = ANY($${p.length})`); }
  if (q.view === 'open') { p.push(OPEN); where.push(`j.status = ANY($${p.length})`); }
  if (q.view === 'attention') where.push(`(j.status='Pending' OR (j.status IN ('Assigned','Accepted') AND j.scheduled_at < now() - interval '30 minutes'))`);
  if (q.view === 'today') where.push(`j.scheduled_at >= date_trunc('day', now()) AND j.scheduled_at < date_trunc('day', now()) + interval '1 day'`);
  if (q.view === 'done') where.push(`j.status IN ('Completed','Awaiting Approval')`);
  if (q.from) { p.push(q.from); where.push(`j.scheduled_at >= $${p.length}`); }
  if (q.to) { p.push(q.to); where.push(`j.scheduled_at < $${p.length}`); }
  p.push(q.limit);
  const { rows } = await query(`${JOB_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${q.view === 'done' ? 'j.scheduled_at DESC' : 'j.scheduled_at ASC'} LIMIT $${p.length}`, p);
  res.json({ items: rows.map(r => jobOut(r, req.user.role)) });
}));

// ---- Detail ----
router.get('/:id', wrap(async (req, res) => {
  const row = await loadJob(Number(req.params.id));
  assertCanSee(req.user, row);
  const [events, report] = await Promise.all([
    query(`SELECT e.text, e.created_at, u.name by_name FROM job_events e LEFT JOIN users u ON u.id=e.user_id WHERE job_id=$1 ORDER BY e.created_at`, [row.id]),
    query(`SELECT r.* FROM reports r WHERE job_id=$1`, [row.id])
  ]);
  let rep = report.rows[0] || null;
  if (rep) rep.items = (await query(`SELECT ri.item_id, ri.quantity, i.name, i.unit FROM report_items ri JOIN inventory_items i ON i.id=ri.item_id WHERE report_id=$1`, [rep.id])).rows;
  res.json({ job: jobOut(row, req.user.role), events: events.rows, report: rep });
}));

// ---- Create (book a service) ----
router.post('/', allow('admin', 'callcenter'), wrap(async (req, res) => {
  const b = parse(z.object({
    customerId: z.number().int(), serviceCode: z.string(), scheduledAt: z.string().datetime({ offset: true }),
    priority: z.enum(['Low', 'Normal', 'High', 'Urgent']).default('Normal'), infestation: z.enum(['Low', 'Medium', 'High']).default('Medium'),
    plan: z.enum(['once', 'amc']).default('once'), notes: z.string().max(1000).optional(),
    technicianId: z.number().int().optional(), propertyType: z.enum(['1 BHK', '2 BHK', '3 BHK', 'Bungalow', 'Commercial']).optional()
  }), req.body);
  if (b.technicianId && req.user.role !== 'admin') throw new HttpError(403, 'Only admins can assign technicians');
  const created = await tx(async db => {
    const c = (await db.query('SELECT * FROM customers WHERE id=$1', [b.customerId])).rows[0];
    if (!c) throw new HttpError(404, 'Customer not found');
    const s = (await db.query('SELECT * FROM services WHERE code=$1 AND active', [b.serviceCode])).rows[0];
    if (!s) throw new HttpError(400, 'Unknown service');
    const prop = b.propertyType || c.property_type;
    const unit = Number(s.prices[prop]);
    if (!unit) throw new HttpError(400, `No price set for ${s.name} / ${prop}`);
    let amcId = null, price = unit;
    if (b.plan === 'amc') {
      price = Math.round(unit * 2.4 / 10) * 10;
      amcId = (await db.query(`INSERT INTO amc_contracts (customer_id, service_code, visits_total, start_date, end_date, price)
        VALUES ($1,$2,3,current_date,current_date + 365,$3) RETURNING id`, [c.id, s.code, price])).rows[0].id;
    }
    if (b.technicianId) {
      const t = (await db.query(`SELECT * FROM users WHERE id=$1 AND role='technician' AND active`, [b.technicianId])).rows[0];
      if (!t) throw new HttpError(400, 'Technician not found');
    }
    let job;
    try {
      job = (await db.query(`INSERT INTO jobs (customer_id, service_code, property_type, price, priority, infestation, status, technician_id, scheduled_at, notes, amc_id, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [c.id, s.code, prop, b.plan === 'amc' ? unit : price, b.priority, b.infestation, b.technicianId ? 'Assigned' : 'Pending', b.technicianId || null, b.scheduledAt, b.notes || null, amcId, req.user.id])).rows[0];
    } catch (e) {
      if (e.code === '23505') {
        const dup = (await query(`SELECT id, scheduled_at FROM jobs WHERE customer_id=$1 AND service_code=$2 AND status = ANY($3)`, [c.id, s.code, OPEN])).rows[0];
        throw new HttpError(409, `JB-${dup?.id} is already open for this customer and service. Update that job instead.`);
      }
      throw e;
    }
    await event(db, job.id, req.user.id, `Booked by ${req.user.name}${b.plan === 'amc' ? ` (new AMC, ₹${price})` : ''}`);
    if (b.technicianId) await event(db, job.id, req.user.id, `Assigned by ${req.user.name}`);
    return { job, customer: c, service: s };
  });
  const { job, customer, service } = created;
  if (req.user.role !== 'admin') await notify({ role: 'admin', title: `New booking JB-${job.id}: ${service.name} for ${customer.name}`, link: `/jobs/${job.id}` });
  if (job.technician_id) await notify({ userId: job.technician_id, title: `New job JB-${job.id}: ${service.name}`, link: `/jobs/${job.id}` });
  await audit(req.user.id, 'create_job', 'job', job.id);
  broadcastJob(job);
  res.status(201).json({ job: jobOut(await loadJob(job.id), req.user.role) });
}));

// ---- Admin: assign / reassign ----
router.post('/:id/assign', allow('admin'), wrap(async (req, res) => {
  const { technicianId } = parse(z.object({ technicianId: z.number().int() }), req.body);
  const out = await tx(async db => {
    const j = (await db.query('SELECT * FROM jobs WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!j) throw new HttpError(404, 'Job not found');
    if (!['Pending', 'Assigned', 'Accepted', 'On Hold'].includes(j.status)) throw new HttpError(409, `A job that is ${j.status} cannot be reassigned`);
    const t = (await db.query(`SELECT * FROM users WHERE id=$1 AND role='technician' AND active`, [technicianId])).rows[0];
    if (!t) throw new HttpError(400, 'Technician not found');
    if (!t.available) throw new HttpError(409, `${t.name} is on leave`);
    const prev = j.technician_id;
    const upd = (await db.query(`UPDATE jobs SET technician_id=$1, status='Assigned', updated_at=now() WHERE id=$2 RETURNING *`, [t.id, j.id])).rows[0];
    await event(db, j.id, req.user.id, prev && prev !== t.id ? `Reassigned to ${t.name}` : `Assigned to ${t.name}`);
    return { upd, prev, t };
  });
  await notify({ userId: out.t.id, title: `New job JB-${out.upd.id} assigned to you`, link: `/jobs/${out.upd.id}` });
  if (out.prev && out.prev !== out.t.id) await notify({ userId: out.prev, title: `JB-${out.upd.id} was moved to another technician` });
  await audit(req.user.id, 'assign_job', 'job', out.upd.id, { technicianId });
  broadcastJob(out.upd, out.prev ? [`user:${out.prev}`] : []);
  res.json({ job: jobOut(await loadJob(out.upd.id), req.user.role) });
}));

// ---- Admin: cancel ----
router.post('/:id/cancel', allow('admin'), wrap(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().min(3).max(300) }), req.body);
  const j = await tx(async db => {
    const j = (await db.query('SELECT * FROM jobs WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!j) throw new HttpError(404, 'Job not found');
    if (!['Pending', 'Assigned', 'Accepted', 'On Hold'].includes(j.status)) throw new HttpError(409, `A job that is ${j.status} cannot be cancelled`);
    const u = (await db.query(`UPDATE jobs SET status='Cancelled', updated_at=now() WHERE id=$1 RETURNING *`, [j.id])).rows[0];
    await event(db, j.id, req.user.id, `Cancelled: ${reason}`);
    return u;
  });
  if (j.technician_id) await notify({ userId: j.technician_id, title: `JB-${j.id} was cancelled` });
  await audit(req.user.id, 'cancel_job', 'job', j.id, { reason });
  broadcastJob(j);
  res.json({ ok: true });
}));

// ---- Technician: status changes ----
router.post('/:id/status', allow('technician'), wrap(async (req, res) => {
  const { status, reason } = parse(z.object({ status: z.string(), reason: z.string().max(300).optional() }), req.body);
  const j = await tx(async db => {
    const j = (await db.query('SELECT * FROM jobs WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!j) throw new HttpError(404, 'Job not found');
    if (j.technician_id !== req.user.id) throw new HttpError(403, 'This job is not assigned to you');
    if (!(TECH_TRANSITIONS[j.status] || []).includes(status)) throw new HttpError(409, `Cannot change a job from ${j.status} to ${status}`);
    if (['On Hold', 'Unable to Complete'].includes(status) && (!reason || reason.trim().length < 3)) throw new HttpError(400, 'Please give a reason');
    const u = (await db.query(`UPDATE jobs SET status=$1, updated_at=now() WHERE id=$2 RETURNING *`, [status, j.id])).rows[0];
    await event(db, j.id, req.user.id, `${status}${reason ? ': ' + reason : ''}`);
    return u;
  });
  if (status === 'On the way') await notify({ role: 'callcenter', title: `${req.user.name} is on the way for JB-${j.id}` });
  if (['On Hold', 'Unable to Complete'].includes(status)) await notify({ role: 'admin', title: `JB-${j.id} ${status.toLowerCase()}: ${reason}`, link: `/jobs/${j.id}` });
  broadcastJob(j);
  res.json({ job: jobOut(await loadJob(j.id), req.user.role) });
}));

router.post('/:id/reschedule-request', allow('technician'), wrap(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().min(5).max(300) }), req.body);
  const j = await loadJob(Number(req.params.id));
  assertCanSee(req.user, j);
  await query('INSERT INTO job_events (job_id,user_id,text) VALUES ($1,$2,$3)', [j.id, req.user.id, `Reschedule requested: ${reason}`]);
  await notify({ role: 'admin', title: `${req.user.name} asked to reschedule JB-${j.id}: ${reason}`, link: `/jobs/${j.id}` });
  res.json({ ok: true });
}));

module.exports = { router, OPEN, loadJob, jobOut, event, broadcastJob, assertCanSee };
