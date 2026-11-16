const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query } = require('../db');
const { allow } = require('../auth');
const { wrap, parse, HttpError } = require('../errors');
const { audit } = require('../audit');

router.get('/', allow('admin'), wrap(async (req, res) => {
  const { rows } = await query(`SELECT u.id, u.name, u.email, u.role, u.phone, u.area, u.skills, u.available, u.active,
      (SELECT count(*)::int FROM jobs j WHERE j.technician_id=u.id AND j.status IN ('Assigned','Accepted','On the way','In Progress','On Hold')) open_jobs,
      (SELECT count(*)::int FROM jobs j WHERE j.technician_id=u.id AND j.status='Completed') completed_jobs
    FROM users u ORDER BY u.role, u.name`);
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
  const b = parse(z.object({ name: z.string().min(2).max(80).optional(), phone: z.string().max(20).optional(), area: z.string().max(60).optional(),
    skills: SKILLS.optional(), available: z.boolean().optional(), active: z.boolean().optional(), password: z.string().min(8).optional() }), req.body);
  if (Number(req.params.id) === req.user.id && b.active === false) throw new HttpError(400, 'You cannot deactivate your own account');
  const sets = [], p = [];
  for (const k of ['name', 'phone', 'area', 'skills', 'available', 'active']) if (b[k] !== undefined) { p.push(b[k]); sets.push(`${k}=$${p.length}`); }
  if (b.password) { p.push(await bcrypt.hash(b.password, 10)); sets.push(`password_hash=$${p.length}`); }
  if (!sets.length) throw new HttpError(400, 'Nothing to update');
  p.push(req.params.id);
  const { rows } = await query(`UPDATE users SET ${sets.join(',')} WHERE id=$${p.length} RETURNING id,name,email,role,phone,area,skills,available,active`, p);
  if (!rows[0]) throw new HttpError(404, 'User not found');
  await audit(req.user.id, 'update_user', 'user', rows[0].id, { ...b, password: b.password ? '***' : undefined });
  res.json({ user: rows[0] });
}));
module.exports = router;
