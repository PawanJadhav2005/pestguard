const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query, tx } = require('../db');
const { allow } = require('../auth');
const { wrap, parse, HttpError } = require('../errors');
const { audit } = require('../audit');

router.get('/', allow('admin'), wrap(async (req, res) => {
  const { rows } = await query(`SELECT u.id, u.name, u.email, u.role, u.phone, u.area, u.skills, u.available, u.active, u.approved, u.signed_up_at,
      (SELECT count(*)::int FROM jobs j WHERE j.technician_id=u.id AND j.status IN ('Assigned','Accepted','On the way','In Progress','On Hold')) open_jobs,
      (SELECT count(*)::int FROM jobs j WHERE j.technician_id=u.id AND j.status='Completed') completed_jobs
    FROM users u ORDER BY u.approved, u.role, u.name`);
  res.json({ items: rows });
}));
const SKILLS = z.array(z.enum(['gpc', 'ter', 'bed', 'mos', 'rod', 'san'])).default([]);
router.post('/', allow('admin'), wrap(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(2).max(80), email: z.string().email(), password: z.string().min(8, 'at least 8 characters'),
    role: z.enum(['admin', 'callcenter', 'technician']), phone: z.string().max(20).optional(), area: z.string().max(60).optional(), skills: SKILLS }), req.body);
  try {
    const { rows } = await query(`INSERT INTO users (name,email,password_hash,role,phone,area,skills) VALUES ($1,lower($2),$3,$4,$5,$6,$7)
      RETURNING id,name,email,role,phone,area,skills,available,active`, [b.name, b.email, await bcrypt.hash(b.password, 10), b.role, b.phone || null, b.area || null, b.skills]);
    await audit(req.user.id, 'create_user', 'user', rows[0].id);
    res.status(201).json({ user: rows[0] });
  } catch (e) { if (e.code === '23505') throw new HttpError(409, 'That email is already used'); throw e; }
}));
router.patch('/:id', allow('admin'), wrap(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(2).max(80).optional(), email: z.string().email().optional(), phone: z.string().max(20).optional(), area: z.string().max(60).optional(),
    skills: SKILLS.optional(), available: z.boolean().optional(), active: z.boolean().optional(), password: z.string().min(8).optional(),
    approved: z.literal(true).optional(), role: z.enum(['admin', 'callcenter', 'technician']).optional() }), req.body);
  if (Number(req.params.id) === req.user.id && b.role && b.role !== 'admin') throw new HttpError(400, 'You cannot remove your own admin role');
  if (Number(req.params.id) === req.user.id && b.active === false) throw new HttpError(400, 'You cannot deactivate your own account');
  const sets = [], p = [];
  for (const k of ['name', 'phone', 'area', 'skills', 'available', 'active']) if (b[k] !== undefined) { p.push(b[k]); sets.push(`${k}=$${p.length}`); }
  if (b.email) { p.push(b.email.toLowerCase()); sets.push(`email=$${p.length}`); }
  if (b.role) { p.push(b.role); sets.push(`role=$${p.length}`); }
  if (b.approved) sets.push('approved=true', 'active=true');
  if (b.password) { p.push(await bcrypt.hash(b.password, 10)); sets.push(`password_hash=$${p.length}`); }
  if (!sets.length) throw new HttpError(400, 'Nothing to update');
  p.push(req.params.id);
  let rows;
  try { ({ rows } = await query(`UPDATE users SET ${sets.join(',')} WHERE id=$${p.length} RETURNING id,name,email,role,phone,area,skills,available,active,approved`, p)); }
  catch (e) { if (e.code === '23505') throw new HttpError(409, 'That email is already used'); throw e; }
  if (!rows[0]) throw new HttpError(404, 'User not found');
  await audit(req.user.id, 'update_user', 'user', rows[0].id, { ...b, password: b.password ? '***' : undefined });
  res.json({ user: rows[0] });
}));
// Reject a sign-up request (only accounts that were never approved can be deleted)
router.delete('/:id', allow('admin'), wrap(async (req, res) => {
  const rows = await tx(async db => {
    const u = (await db.query('SELECT id FROM users WHERE id=$1 AND approved=false FOR UPDATE', [req.params.id])).rows[0];
    if (!u) return [];
    await db.query('UPDATE audit_log SET user_id=NULL WHERE user_id=$1', [u.id]); // keep the log, unlink the person
    await db.query('DELETE FROM notification_reads WHERE user_id=$1', [u.id]);
    return (await db.query('DELETE FROM users WHERE id=$1 RETURNING id, name', [u.id])).rows;
  });
  if (!rows[0]) throw new HttpError(409, 'Only sign-up requests that are still waiting can be rejected. Turn off "Active" for existing staff instead.');
  await audit(req.user.id, 'reject_signup', 'user', rows[0].id, { name: rows[0].name });
  res.json({ ok: true });
}));

module.exports = router;
