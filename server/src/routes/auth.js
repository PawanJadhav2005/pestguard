const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { query } = require('../db');
const { sign, requireAuth } = require('../auth');
const { wrap, parse, HttpError } = require('../errors');
const { audit } = require('../audit');
const { notify } = require('../notify');

// 10 attempts per 15 minutes per address (LOGIN_RATE_LIMIT can raise it, e.g. for automated tests)
const LIMIT = Number(process.env.LOGIN_RATE_LIMIT || 10);
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: LIMIT, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' } });
const passwordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: LIMIT, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' } });

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
  const { rows } = await query('SELECT * FROM users WHERE lower(email)=lower($1)', [email]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new HttpError(401, 'Email or password is incorrect');
  // only explain the account state after the password is proven correct
  if (!u.approved) throw new HttpError(403, 'Your account is waiting for the admin to approve it. You can sign in once it is approved.');
  if (!u.active) throw new HttpError(403, 'This account is turned off. Ask your admin to turn it back on.');
  await audit(u.id, 'login');
  res.json({ token: sign(u), user: { id: u.id, name: u.name, email: u.email, role: u.role, area: u.area } });
}));
router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

// New staff create their own account; it stays locked until an admin approves it in Team.
const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: Number(process.env.SIGNUP_RATE_LIMIT || 5), standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-up attempts. Try again later.' } });
router.post('/signup', signupLimiter, wrap(async (req, res) => {
  const b = parse(z.object({
    name: z.string().trim().min(2, 'enter your full name').max(80),
    email: z.string().trim().email('enter a valid email'),
    phone: z.string().trim().regex(/^\+?[0-9 ]{10,15}$/, 'enter a valid phone number'),
    password: z.string().min(8, 'password must be at least 8 characters').max(100),
    role: z.enum(['technician', 'callcenter'], { message: 'choose Technician or Call center' }),
    area: z.string().trim().max(60).optional()
  }), req.body);
  let u;
  try {
    u = (await query(`INSERT INTO users (name, email, password_hash, role, phone, area, approved, active, signed_up_at)
      VALUES ($1, lower($2), $3, $4, $5, $6, false, false, now()) RETURNING id, name, role`,
      [b.name, b.email, await bcrypt.hash(b.password, 10), b.role, b.phone, b.area || null])).rows[0];
  } catch (e) { if (e.code === '23505') throw new HttpError(409, 'An account with this email already exists. Sign in instead.'); throw e; }
  await audit(u.id, 'signup', 'user', u.id, { role: b.role });
  await notify({ role: 'admin', title: `New sign-up: ${u.name} wants to join as ${u.role === 'technician' ? 'Technician' : 'Call center'}. Approve in Team.`, link: '/team' });
  res.status(201).json({ ok: true, message: 'Account created. You can sign in once the admin approves it.' });
}));

// Any signed-in user can change their own password (needs the current one)
router.post('/change-password', requireAuth, passwordLimiter, wrap(async (req, res) => {
  const { currentPassword, newPassword } = parse(z.object({ currentPassword: z.string().min(1, 'enter your current password'),
    newPassword: z.string().min(8, 'new password must be at least 8 characters').max(100) }), req.body);
  const u = (await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id])).rows[0];
  if (!(await bcrypt.compare(currentPassword, u.password_hash))) throw new HttpError(400, 'Current password is incorrect');
  if (currentPassword === newPassword) throw new HttpError(400, 'Choose a different password from the current one');
  await query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(newPassword, 10), req.user.id]);
  await audit(req.user.id, 'change_password');
  res.json({ ok: true });
}));
module.exports = router;
