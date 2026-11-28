const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { corsOrigins } = require('./config');
const { requireAuth, allow } = require('./auth');
const { HttpError, wrap } = require('./errors');
const { query } = require('./db');

const app = express();
app.set('trust proxy', 1);
// Photos in the admin portal are shown from blob: URLs, so allow them in the security policy
app.use(helmet({ contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'blob:'] } } }));
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', async (req, res) => {
  try { await query('SELECT 1'); res.json({ ok: true, db: 'up' }); } catch { res.status(503).json({ ok: false, db: 'down' }); }
});
// Tiny check that does NOT touch the database: use this for free "keep awake" pingers,
// so the server stays awake while the Neon database can still sleep when nobody uses the app.
app.get('/api/ping', (req, res) => res.set('Cache-Control', 'no-store').json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));

// Everything below needs a signed-in user
app.use('/api', requireAuth);
app.use('/api/customers', require('./routes/customers'));
app.use('/api/jobs', require('./routes/jobs').router);
app.use('/api', require('./routes/reports'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/calls', require('./routes/calls'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/misc'));

// Photos and signatures: only admins, or the technician who uploaded them in a report
app.get('/api/files/:name', wrap(async (req, res) => {
  const name = req.params.name;
  if (!/^[a-f0-9]{32}\.(jpg|png)$/.test(name)) throw new HttpError(404, 'Not found');
  if (req.user.role !== 'admin') {
    const ok = await query(`SELECT 1 FROM reports WHERE technician_id=$1 AND $2 IN (before_photo, after_photo, signature)`, [req.user.id, name]);
    if (!ok.rows.length) throw new HttpError(403, 'You do not have permission to see this file');
  }
  const f = (await query('SELECT mime, data FROM files WHERE name=$1', [name])).rows[0];
  if (!f) throw new HttpError(404, 'Not found');
  res.set('Content-Type', f.mime).set('Cache-Control', 'private, max-age=86400').send(f.data);
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built admin portal (admin-web/dist) from the same address, e.g. http://localhost:4000
const adminDist = path.join(__dirname, '..', '..', 'admin-web', 'dist');
if (fs.existsSync(path.join(adminDist, 'index.html'))) {
  app.use(express.static(adminDist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => res.sendFile(path.join(adminDist, 'index.html')));
}
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});
module.exports = app;
