const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { query } = require('../db');
const { sign, requireAuth } = require('../auth');
const { wrap, parse, HttpError } = require('../errors');
const { audit } = require('../audit');

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' } });

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
  const { rows } = await query('SELECT * FROM users WHERE lower(email)=lower($1)', [email]);
  const u = rows[0];
  if (!u || !u.active || !(await bcrypt.compare(password, u.password_hash))) throw new HttpError(401, 'Email or password is incorrect');
  await audit(u.id, 'login');
  res.json({ token: sign(u), user: { id: u.id, name: u.name, email: u.email, role: u.role, area: u.area } });
}));
router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
module.exports = router;
