const jwt = require('jsonwebtoken');
const { jwtSecret } = require('./config');
const { query } = require('./db');
const { HttpError } = require('./errors');

function sign(user) { return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '12h' }); }

async function userFromToken(token) {
  const p = jwt.verify(token, jwtSecret);
  const { rows } = await query('SELECT id, name, email, role, phone, area, skills, available, active, approved FROM users WHERE id=$1', [p.sub]);
  const u = rows[0];
  if (!u || !u.active || !u.approved) throw new Error('inactive');
  return u;
}

// Every API route except /auth/login goes through this.
async function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Please sign in'));
  try { req.user = await userFromToken(token); next(); }
  catch { next(new HttpError(401, 'Session expired. Please sign in again.')); }
}
const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have permission to do this'));

module.exports = { sign, requireAuth, allow, userFromToken };
