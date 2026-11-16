const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { allow } = require('../auth');
const { wrap, parse, HttpError } = require('../errors');
const { notify } = require('../notify');
const { emit } = require('../realtime');
const { audit } = require('../audit');
const { loadJob, jobOut, event, broadcastJob } = require('./jobs');
const { applyMovement, lowStockCheck } = require('../inventory');

const fileName = z.string().regex(/^[a-f0-9]{32}\.(jpg|png)$/, 'upload the file first');

// Technician submits the treatment report.
// In ONE database transaction: save the report, deduct every chemical from the
// central store (with a movement record), and move the job to Awaiting Approval.
// Admin's portal is told instantly over the live connection.
router.post('/jobs/:id/report', allow('technician'), wrap(async (req, res) => {
  const b = parse(z.object({
    areas: z.array(z.string().min(1).max(40)).min(1, 'select at least one area'),
    items: z.array(z.object({ itemId: z.number().int(), quantity: z.number().positive().max(100000) })).max(30).default([]),
    notes: z.string().max(2000).optional(),
    safetyConfirmed: z.literal(true, { message: 'complete the safety checklist' }),
    beforePhoto: fileName.optional(), afterPhoto: fileName, signature: fileName
  }), req.body);

  // merge duplicate lines for the same item
  const qty = new Map();
  for (const it of b.items) qty.set(it.itemId, (qty.get(it.itemId) || 0) + it.quantity);

  const result = await tx(async db => {
    const j = (await db.query('SELECT * FROM jobs WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!j) throw new HttpError(404, 'Job not found');
    if (j.technician_id !== req.user.id) throw new HttpError(403, 'This job is not assigned to you');
    if (j.status !== 'In Progress') throw new HttpError(409, `Start the treatment before submitting a report (job is ${j.status})`);

    // A report sent back by the admin is being resubmitted: put its old stock back first
    const prev = (await db.query('SELECT * FROM reports WHERE job_id=$1 FOR UPDATE', [j.id])).rows[0];
    if (prev) {
      const old = (await db.query('SELECT item_id, quantity FROM report_items WHERE report_id=$1', [prev.id])).rows;
      for (const o of old) await applyMovement(db, { itemId: o.item_id, change: o.quantity, reason: 'job_usage_reversed', jobId: j.id, userId: req.user.id, note: 'Report resubmitted' });
      await db.query('DELETE FROM report_items WHERE report_id=$1', [prev.id]);
    }

    const report = prev
      ? (await db.query(`UPDATE reports SET areas=$1, notes=$2, safety_confirmed=true, before_photo=$3, after_photo=$4, signature=$5,
           status='submitted', submitted_at=now(), reviewed_at=NULL, reviewed_by=NULL WHERE id=$6 RETURNING *`,
           [b.areas, b.notes || null, b.beforePhoto || null, b.afterPhoto, b.signature, prev.id])).rows[0]
      : (await db.query(`INSERT INTO reports (job_id, technician_id, areas, notes, safety_confirmed, before_photo, after_photo, signature)
           VALUES ($1,$2,$3,$4,true,$5,$6,$7) RETURNING *`,
           [j.id, req.user.id, b.areas, b.notes || null, b.beforePhoto || null, b.afterPhoto, b.signature])).rows[0];

    const touched = [];
    for (const [itemId, q] of qty) {
      const item = await applyMovement(db, { itemId, change: -q, reason: 'job_usage', jobId: j.id, userId: req.user.id, note: `Used on JB-${j.id}` });
      await db.query('INSERT INTO report_items (report_id, item_id, quantity) VALUES ($1,$2,$3)', [report.id, itemId, q]);
      touched.push(item);
    }
    const upd = (await db.query(`UPDATE jobs SET status='Awaiting Approval', updated_at=now() WHERE id=$1 RETURNING *`, [j.id])).rows[0];
    await event(db, j.id, req.user.id, `Treatment report submitted by ${req.user.name}`);
    return { report, job: upd, touched };
  });

  await notify({ role: 'admin', title: `${req.user.name} submitted a treatment report for JB-${result.job.id}`, link: `/approvals` });
  for (const item of result.touched) await lowStockCheck(item);
  await audit(req.user.id, 'submit_report', 'job', result.job.id, { items: [...qty.entries()] });
  emit('role:admin', 'report:submitted', { reportId: result.report.id, jobId: result.job.id });
  if (result.touched.length) emit(['role:admin', 'role:technician'], 'inventory:changed', { itemIds: result.touched.map(i => i.id) });
  broadcastJob(result.job);
  res.status(201).json({ report: result.report, job: jobOut(await loadJob(result.job.id), req.user.role) });
}));

// Admin: list reports (default: waiting for approval)
router.get('/reports', allow('admin'), wrap(async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['submitted', 'approved', 'returned']).default('submitted') }), req.query);
  const { rows } = await query(`SELECT r.*, j.service_code, j.price, j.property_type, s.name service_name, u.name technician_name, c.name customer_name, c.area customer_area
    FROM reports r JOIN jobs j ON j.id=r.job_id JOIN services s ON s.code=j.service_code JOIN users u ON u.id=r.technician_id JOIN customers c ON c.id=j.customer_id
    WHERE r.status=$1 ORDER BY r.submitted_at DESC LIMIT 100`, [status]);
  const ids = rows.map(r => r.id);
  const items = ids.length ? (await query(`SELECT ri.report_id, ri.item_id, ri.quantity, i.name, i.unit FROM report_items ri JOIN inventory_items i ON i.id=ri.item_id WHERE report_id = ANY($1)`, [ids])).rows : [];
  res.json({ items: rows.map(r => ({ ...r, items: items.filter(i => i.report_id === r.id) })) });
}));

router.get('/reports/:id', allow('admin'), wrap(async (req, res) => {
  const r = (await query(`SELECT r.*, j.service_code, j.price, j.property_type, s.name service_name, u.name technician_name, c.name customer_name, c.area customer_area
    FROM reports r JOIN jobs j ON j.id=r.job_id JOIN services s ON s.code=j.service_code JOIN users u ON u.id=r.technician_id JOIN customers c ON c.id=j.customer_id
    WHERE r.id=$1`, [req.params.id])).rows[0];
  if (!r) throw new HttpError(404, 'Report not found');
  r.items = (await query(`SELECT ri.item_id, ri.quantity, i.name, i.unit FROM report_items ri JOIN inventory_items i ON i.id=ri.item_id WHERE report_id=$1`, [r.id])).rows;
  res.json({ report: r });
}));

router.post('/reports/:id/approve', allow('admin'), wrap(async (req, res) => {
  const out = await tx(async db => {
    const r = (await db.query('SELECT * FROM reports WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!r) throw new HttpError(404, 'Report not found');
    if (r.status !== 'submitted') throw new HttpError(409, `This report is already ${r.status}`);
    await db.query(`UPDATE reports SET status='approved', reviewed_at=now(), reviewed_by=$1 WHERE id=$2`, [req.user.id, r.id]);
    const j = (await db.query(`UPDATE jobs SET status='Completed', completed_at=now(), updated_at=now() WHERE id=$1 RETURNING *`, [r.job_id])).rows[0];
    if (j.amc_id) await db.query(`UPDATE amc_contracts SET visits_done = LEAST(visits_done+1, visits_total) WHERE id=$1`, [j.amc_id]);
    await db.query(`INSERT INTO followups (customer_id, due_at, type, note, created_by) VALUES ($1, now() + interval '2 days', 'Feedback', $2, $3)`,
      [j.customer_id, `Feedback call after JB-${j.id}`, req.user.id]);
    await event(db, j.id, req.user.id, `Report approved by ${req.user.name}`);
    return j;
  });
  await notify({ userId: out.technician_id, title: `JB-${out.id} report approved` });
  await notify({ role: 'callcenter', title: `JB-${out.id} completed. Feedback call added to follow-ups.` });
  await audit(req.user.id, 'approve_report', 'job', out.id);
  emit('role:admin', 'report:reviewed', { jobId: out.id });
  broadcastJob(out);
  res.json({ ok: true });
}));

router.post('/reports/:id/return', allow('admin'), wrap(async (req, res) => {
  const { comment } = parse(z.object({ comment: z.string().min(4).max(500) }), req.body);
  const out = await tx(async db => {
    const r = (await db.query('SELECT * FROM reports WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!r) throw new HttpError(404, 'Report not found');
    if (r.status !== 'submitted') throw new HttpError(409, `This report is already ${r.status}`);
    await db.query(`UPDATE reports SET status='returned', admin_comment=$1, reviewed_at=now(), reviewed_by=$2 WHERE id=$3`, [comment, req.user.id, r.id]);
    const j = (await db.query(`UPDATE jobs SET status='In Progress', updated_at=now() WHERE id=$1 RETURNING *`, [r.job_id])).rows[0];
    await event(db, j.id, req.user.id, `Returned for correction: ${comment}`);
    return j;
  });
  await notify({ userId: out.technician_id, title: `JB-${out.id} returned: ${comment}`, link: `/jobs/${out.id}` });
  await audit(req.user.id, 'return_report', 'job', out.id, { comment });
  emit('role:admin', 'report:reviewed', { jobId: out.id });
  broadcastJob(out);
  res.json({ ok: true });
}));

module.exports = router;
