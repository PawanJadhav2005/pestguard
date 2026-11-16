const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../db');
const { allow } = require('../auth');
const { wrap, parse, HttpError } = require('../errors');
const { exotel } = require('../config');
const { audit } = require('../audit');
const { notify } = require('../notify');

const configured = () => Boolean(exotel.sid && exotel.key && exotel.token && exotel.callerId);

// Start a masked call. The customer's number is read here on the server and sent
// only to the calling provider. It never goes back to the app.
router.post('/', wrap(async (req, res) => {
  const { customerId } = parse(z.object({ customerId: z.number().int() }), req.body);
  if (req.user.role === 'technician') {
    const ok = await query(`SELECT 1 FROM jobs WHERE customer_id=$1 AND technician_id=$2 AND status IN ('Assigned','Accepted','On the way','In Progress','On Hold')`, [customerId, req.user.id]);
    if (!ok.rows.length) throw new HttpError(403, 'You can only call customers on your open jobs');
  }
  const c = (await query('SELECT id, mobile FROM customers WHERE id=$1', [customerId])).rows[0];
  if (!c) throw new HttpError(404, 'Customer not found');
  const log = (await query(`INSERT INTO call_logs (customer_id, user_id, status) VALUES ($1,$2,'initiated') RETURNING id`, [c.id, req.user.id])).rows[0];
  await audit(req.user.id, 'start_call', 'customer', c.id, { callId: log.id });

  const fail = async (status, msg) => { await query(`UPDATE call_logs SET status='failed', notes=$1 WHERE id=$2`, [msg, log.id]); throw new HttpError(status, msg, { callId: log.id }); };
  if (!configured()) await fail(503, 'Calling is not set up yet. An admin needs to add the Exotel details in the server .env file. No call was placed.');
  if (!c.mobile) await fail(422, 'This customer has no phone number on file.');
  if (!req.user.phone) await fail(422, 'Your own phone number is missing from your staff profile. Ask the admin to add it.');

  // Exotel "connect two numbers": rings the staff member first, then the customer.
  const url = `https://${exotel.subdomain}/v1/Accounts/${exotel.sid}/Calls/connect.json`;
  const body = new URLSearchParams({ From: req.user.phone, To: c.mobile, CallerId: exotel.callerId, Record: 'false' });
  let resp;
  try {
    resp = await fetch(url, { method: 'POST', body, headers: { Authorization: 'Basic ' + Buffer.from(`${exotel.key}:${exotel.token}`).toString('base64') } });
  } catch { await fail(502, 'Could not reach the calling provider. Check the internet connection and try again.'); }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) await fail(502, `Calling provider refused the call (${resp.status}). Check the Exotel account and balance.`);
  await query(`UPDATE call_logs SET provider_call_id=$1 WHERE id=$2`, [data?.Call?.Sid || null, log.id]);
  res.status(201).json({ callId: log.id, status: 'ringing', message: 'Your phone will ring first. Answer it to be connected to the customer.' });
}));

router.post('/:id/outcome', wrap(async (req, res) => {
  const b = parse(z.object({ outcome: z.enum(['Connected', 'No answer', 'Busy', 'Booked service', 'Complaint', 'Wrong number', 'Feedback received']),
    durationSec: z.number().int().min(0).max(36000).optional(), notes: z.string().max(1000).optional(),
    callbackAt: z.string().datetime({ offset: true }).optional() }), req.body);
  const l = (await query('SELECT * FROM call_logs WHERE id=$1', [req.params.id])).rows[0];
  if (!l) throw new HttpError(404, 'Call not found');
  if (l.user_id !== req.user.id && req.user.role !== 'admin') throw new HttpError(403, 'This is not your call');
  await query(`UPDATE call_logs SET outcome=$1, duration_sec=$2, notes=COALESCE($3, notes), status='logged' WHERE id=$4`, [b.outcome, b.durationSec ?? null, b.notes || null, l.id]);
  if (b.callbackAt) await query(`INSERT INTO followups (customer_id, due_at, type, note, created_by) VALUES ($1,$2,'Callback',$3,$4)`, [l.customer_id, b.callbackAt, b.notes || `Callback after: ${b.outcome}`, req.user.id]);
  if (b.outcome === 'Complaint') await notify({ role: 'admin', title: `Complaint logged by ${req.user.name}: ${b.notes || 'see call log'}` });
  res.json({ ok: true });
}));

router.get('/', allow('admin', 'callcenter'), wrap(async (req, res) => {
  const p = [], w = req.user.role === 'admin' ? '' : (p.push(req.user.id), 'WHERE l.user_id=$1');
  const { rows } = await query(`SELECT l.id, l.customer_id, c.name customer_name, c.ref customer_ref, u.name by_name, l.status, l.outcome, l.duration_sec, l.notes, l.created_at
    FROM call_logs l JOIN customers c ON c.id=l.customer_id JOIN users u ON u.id=l.user_id ${w} ORDER BY l.created_at DESC LIMIT 200`, p);
  res.json({ items: rows, callingConfigured: configured() });
}));
module.exports = router;
