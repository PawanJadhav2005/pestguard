// End-to-end API tests. They RESET the database named in .env, so point .env at a
// test database (never production) before running:  npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const path = require('path');
const http = require('http');
require('../src/config');
const { pool } = require('../src/db');

const root = path.join(__dirname, '..');
let app, request, server, base, ioClient;
const tok = {};
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  execSync('node scripts/migrate.js && node scripts/seed.js', { cwd: root, stdio: 'ignore' });
  app = require('../src/app');
  request = require('supertest');
  server = http.createServer(app);
  require('../src/realtime').init(server, ['*']);
  await new Promise(r => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
  ioClient = require('socket.io-client').io;
  for (const [k, email] of [['admin', 'admin'], ['cc', 'neha'], ['rakesh', 'rakesh'], ['imran', 'imran']]) {
    const r = await request(app).post('/api/auth/login').send({ email: `${email}@pestguard.local`, password: 'demo1234' });
    assert.equal(r.status, 200, `login ${email}`);
    tok[k] = r.body.token;
  }
});
after(async () => { server.close(); await pool.end(); });

const api = (who) => ({
  get: (u) => request(app).get(u).set('Authorization', `Bearer ${tok[who]}`),
  post: (u, b) => request(app).post(u).set('Authorization', `Bearer ${tok[who]}`).send(b),
  upload: (buf, name) => request(app).post('/api/uploads').set('Authorization', `Bearer ${tok[who]}`).attach('file', buf, name)
});
const MOBILE = /\+?91\s?98111\d{5}|98111\d{5}/;
const stock = async (sku) => Number((await pool.query('SELECT quantity FROM inventory_items WHERE sku=$1', [sku])).rows[0].quantity);
const itemId = async (sku) => (await pool.query('SELECT id FROM inventory_items WHERE sku=$1', [sku])).rows[0].id;

test('wrong password is rejected', async () => {
  const r = await request(app).post('/api/auth/login').send({ email: 'admin@pestguard.local', password: 'nope' });
  assert.equal(r.status, 401);
});

test('requests without a token are rejected', async () => {
  assert.equal((await request(app).get('/api/customers')).status, 401);
});

test('call center NEVER receives customer mobile numbers', async () => {
  const cc = api('cc');
  const list = await cc.get('/api/customers?pageSize=100');
  assert.equal(list.status, 200);
  assert.ok(list.body.items.length >= 8);
  assert.doesNotMatch(JSON.stringify(list.body), MOBILE);
  assert.ok(list.body.items.every(c => !('mobile' in c)));
  // search by digits must not leak either
  const s = await cc.get('/api/customers?q=98111');
  assert.doesNotMatch(JSON.stringify(s.body), MOBILE);
  const id = list.body.items[0].id;
  const detail = await cc.get(`/api/customers/${id}`);
  assert.equal(detail.status, 200);
  assert.doesNotMatch(JSON.stringify(detail.body), MOBILE);
  const jobs = await cc.get('/api/jobs');
  assert.doesNotMatch(JSON.stringify(jobs.body), MOBILE);
  const one = await cc.get(`/api/jobs/${jobs.body.items[0].id}`);
  assert.doesNotMatch(JSON.stringify(one.body), MOBILE);
});

test('admin can see mobile numbers', async () => {
  const r = await api('admin').get('/api/customers?pageSize=5');
  assert.match(JSON.stringify(r.body), MOBILE);
});

test('technicians only see their own jobs and no mobile numbers', async () => {
  const r = await api('rakesh').get('/api/jobs');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.length > 0);
  const me = (await pool.query(`SELECT id FROM users WHERE email='rakesh@pestguard.local'`)).rows[0].id;
  assert.ok(r.body.items.every(j => j.technicianId === me));
  assert.doesNotMatch(JSON.stringify(r.body), MOBILE);
  const other = (await pool.query(`SELECT j.id FROM jobs j JOIN users u ON u.id=j.technician_id WHERE u.email='imran@pestguard.local' LIMIT 1`)).rows[0].id;
  assert.equal((await api('rakesh').get(`/api/jobs/${other}`)).status, 403);
  assert.equal((await api('rakesh').post(`/api/jobs/${other}/status`, { status: 'Accepted' })).status, 403);
  assert.equal((await api('rakesh').get('/api/customers')).status, 403);
  assert.equal((await api('rakesh').get('/api/staff')).status, 403);
  assert.equal((await api('rakesh').post('/api/jobs/1/assign', { technicianId: me })).status, 403);
  assert.equal((await api('rakesh').post('/api/inventory', { sku: 'X1', name: 'X', category: 'chemical', unit: 'ml' })).status, 403);
});

test('call center cannot change inventory or approve reports', async () => {
  assert.equal((await api('cc').get('/api/inventory')).status, 403);
  assert.equal((await api('cc').post('/api/reports/1/approve', {})).status, 403);
});

test('invalid status jumps are refused', async () => {
  const j = (await api('rakesh').get('/api/jobs?status=Assigned')).body.items[0];
  const r = await api('rakesh').post(`/api/jobs/${j.id}/status`, { status: 'Completed' });
  assert.equal(r.status, 409);
});

test('uploads accept only real JPG/PNG', async () => {
  const bad = await api('rakesh').upload(Buffer.from('not an image'), 'evil.png');
  assert.equal(bad.status, 400);
  const ok = await api('rakesh').upload(PNG, 'a.png');
  assert.equal(ok.status, 201);
  assert.match(ok.body.file, /^[a-f0-9]{32}\.png$/);
});

test('report submit deducts stock automatically and reaches Admin live', async () => {
  const t = api('rakesh');
  const job = (await t.get('/api/jobs?status=Accepted')).body.items[0];
  for (const s of ['On the way', 'In Progress']) assert.equal((await t.post(`/api/jobs/${job.id}/status`, { status: s })).status, 200);
  const after = (await t.upload(PNG, 'after.png')).body.file;
  const sig = (await t.upload(PNG, 'sig.png')).body.file;
  const gelBefore = await stock('CHM-GEL'), cypBefore = await stock('CHM-CYP');

  // Admin listens on the live connection
  const sock = ioClient(base, { auth: { token: tok.admin }, transports: ['websocket'] });
  await new Promise((res, rej) => { sock.on('connect', res); sock.on('connect_error', rej); });
  const gotReport = new Promise(r => sock.on('report:submitted', r));
  const gotInv = new Promise(r => sock.on('inventory:changed', r));

  const r = await t.post(`/api/jobs/${job.id}/report`, {
    areas: ['Kitchen', 'Bathrooms'], safetyConfirmed: true, afterPhoto: after, signature: sig, notes: 'Gel applied',
    items: [{ itemId: await itemId('CHM-GEL'), quantity: 20 }, { itemId: await itemId('CHM-CYP'), quantity: 50 }, { itemId: await itemId('CHM-GEL'), quantity: 5 }]
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.job.status, 'Awaiting Approval');
  assert.equal(await stock('CHM-GEL'), gelBefore - 25);
  assert.equal(await stock('CHM-CYP'), cypBefore - 50);
  const mv = await pool.query(`SELECT * FROM inventory_movements WHERE job_id=$1 AND reason='job_usage'`, [job.id]);
  assert.equal(mv.rowCount, 2);

  const ev = await Promise.race([gotReport, new Promise((_, rej) => setTimeout(() => rej(new Error('no live report event')), 2000))]);
  assert.equal(ev.jobId, job.id);
  await Promise.race([gotInv, new Promise((_, rej) => setTimeout(() => rej(new Error('no live inventory event')), 2000))]);
  sock.close();

  const pending = await api('admin').get('/api/reports');
  assert.ok(pending.body.items.some(x => x.job_id === job.id && x.items.length === 2));
  const n = await api('admin').get('/api/notifications');
  assert.ok(n.body.items.some(x => x.title.includes(`JB-${job.id}`)));
  // Admin can open the photo; another technician cannot
  assert.equal((await api('admin').get(`/api/files/${after}`)).status, 200);
  assert.equal((await api('imran').get(`/api/files/${after}`)).status, 403);
});

test('return and resubmit puts old stock back before deducting again', async () => {
  const rep = (await api('admin').get('/api/reports')).body.items[0];
  assert.equal((await api('admin').post(`/api/reports/${rep.id}/return`, { comment: 'Add before photo' })).status, 200);
  const gel = await stock('CHM-GEL'), cyp = await stock('CHM-CYP');
  const t = api('rakesh');
  const after = (await t.upload(PNG, 'a.png')).body.file, sig = (await t.upload(PNG, 's.png')).body.file;
  const r = await t.post(`/api/jobs/${rep.job_id}/report`, { areas: ['Kitchen'], safetyConfirmed: true, afterPhoto: after, signature: sig,
    items: [{ itemId: await itemId('CHM-GEL'), quantity: 10 }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await stock('CHM-GEL'), gel + 25 - 10);
  assert.equal(await stock('CHM-CYP'), cyp + 50);
});

test('admin can open a single report; others cannot', async () => {
  const rep = (await api('admin').get('/api/reports')).body.items[0];
  const one = await api('admin').get(`/api/reports/${rep.id}`);
  assert.equal(one.status, 200);
  assert.ok(Array.isArray(one.body.report.items));
  assert.equal((await api('rakesh').get(`/api/reports/${rep.id}`)).status, 403);
  assert.equal((await api('cc').get(`/api/reports/${rep.id}`)).status, 403);
});

test('approval completes the job and counts the AMC visit', async () => {
  const rep = (await api('admin').get('/api/reports')).body.items[0];
  assert.equal((await api('admin').post(`/api/reports/${rep.id}/approve`, {})).status, 200);
  const j = (await pool.query('SELECT j.status, a.visits_done FROM jobs j LEFT JOIN amc_contracts a ON a.id=j.amc_id WHERE j.id=$1', [rep.job_id])).rows[0];
  assert.equal(j.status, 'Completed');
  assert.equal(j.visits_done, 3);
  assert.equal((await api('admin').post(`/api/reports/${rep.id}/approve`, {})).status, 409);
});

test('not enough stock blocks the report and changes nothing', async () => {
  const a = api('admin'), t = api('imran');
  const job = (await t.get('/api/jobs?status=In Progress')).body.items[0];
  const before = await stock('CHM-TEM');
  const after = (await t.upload(PNG, 'a.png')).body.file, sig = (await t.upload(PNG, 's.png')).body.file;
  const r = await t.post(`/api/jobs/${job.id}/report`, { areas: ['Kitchen'], safetyConfirmed: true, afterPhoto: after, signature: sig,
    items: [{ itemId: await itemId('CHM-CYP'), quantity: 10 }, { itemId: await itemId('CHM-TEM'), quantity: before + 1 }] });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Not enough Temephos/);
  assert.equal(await stock('CHM-TEM'), before);
  assert.equal((await pool.query('SELECT count(*)::int n FROM reports WHERE job_id=$1', [job.id])).rows[0].n, 0);
  assert.equal((await a.get(`/api/jobs/${job.id}`)).body.job.status, 'In Progress');
});

test('admin adds and removes stock; quantity updates and history is kept', async () => {
  const a = api('admin');
  const id = await itemId('CON-GLU');
  const start = await stock('CON-GLU');
  assert.equal((await a.post(`/api/inventory/${id}/adjust`, { reason: 'stock_in', quantity: 50, note: 'Purchase' })).body.item.quantity, start + 50);
  assert.equal((await a.post(`/api/inventory/${id}/adjust`, { reason: 'stock_out', quantity: 5, note: 'Damaged' })).body.item.quantity, start + 45);
  assert.equal((await a.post(`/api/inventory/${id}/adjust`, { reason: 'adjustment', countedQuantity: 80 })).body.item.quantity, 80);
  assert.equal((await a.post(`/api/inventory/${id}/adjust`, { reason: 'stock_out', quantity: 1000 })).status, 409);
  const mv = await a.get(`/api/inventory/movements?itemId=${id}`);
  assert.ok(mv.body.items.length >= 4);
  const created = await a.post('/api/inventory', { sku: 'chm-new', name: 'New chemical', category: 'chemical', unit: 'ml', quantity: 500, reorderLevel: 100 });
  assert.equal(created.status, 201);
  assert.equal(created.body.item.quantity, 500);
  assert.equal((await a.post('/api/inventory', { sku: 'CHM-NEW', name: 'Dup', category: 'chemical', unit: 'ml' })).status, 409);
});

test('low stock creates one admin alert', async () => {
  const a = api('admin'), id = await itemId('CHM-TEM');
  await a.post(`/api/inventory/${id}/adjust`, { reason: 'adjustment', countedQuantity: 50 });
  await a.post(`/api/inventory/${id}/adjust`, { reason: 'stock_out', quantity: 1 });
  const n = (await a.get('/api/notifications')).body.items.filter(x => x.title.startsWith('Low stock: Temephos'));
  assert.equal(n.length, 1);
});

test('duplicate booking for the same customer and service is refused', async () => {
  const cc = api('cc');
  const open = (await cc.get('/api/jobs?view=open')).body.items[0];
  const r = await cc.post('/api/jobs', { customerId: open.customer.id, serviceCode: open.serviceCode, scheduledAt: new Date(Date.now() + 864e5).toISOString() });
  assert.equal(r.status, 409);
});

test('booking an AMC creates the contract and alerts admin', async () => {
  const cc = api('cc');
  const cust = (await cc.get('/api/customers?q=Sneha')).body.items[0];
  const r = await cc.post('/api/jobs', { customerId: cust.id, serviceCode: 'gpc', plan: 'amc', scheduledAt: new Date(Date.now() + 2 * 864e5).toISOString() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.job.status, 'Pending');
  assert.deepEqual(r.body.job.amc, { visitsDone: 0, visitsTotal: 3 });
  assert.equal((await cc.post('/api/jobs', { customerId: cust.id, serviceCode: 'gpc', technicianId: 1, scheduledAt: new Date().toISOString() })).status, 403);
});

test('calling without provider setup fails clearly and never returns the number', async () => {
  const cc = api('cc');
  const cust = (await cc.get('/api/customers')).body.items[0];
  const r = await cc.post('/api/calls', { customerId: cust.id });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /not set up/);
  assert.doesNotMatch(JSON.stringify(r.body), MOBILE);
  const logs = await cc.get('/api/calls');
  assert.equal(logs.body.items[0].status, 'failed');
  assert.doesNotMatch(JSON.stringify(logs.body), MOBILE);
});

test('a technician cannot call customers outside their jobs', async () => {
  const notMine = (await pool.query(`SELECT id FROM customers WHERE ref='SAMPLE-008'`)).rows[0].id;
  assert.equal((await api('rakesh').post('/api/calls', { customerId: notMine })).status, 403);
});

test('admin can preview and import a company Excel file (safe to repeat)', async () => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const old = wb.addWorksheet('Jan 2019');
  old.addRow(['Service done and Collection Jan 2019']);
  old.addRow(['Customer Name', 'service date', 'Collection date', 'Amount']);
  old.addRow(['Hotel Test Bed bug', '13-1-2019', '13-1-2019', 1000]);
  old.addRow(['Mr Test', '26.10..2019', null, 800]);
  old.addRow(['No Date Person', null, null, 500]);
  const recent = wb.addWorksheet('October 2026');
  recent.addRow([new Date(Date.UTC(2026, 9, 1))]);
  recent.addRow(['Name ', 'Job Date', 'Collection date', 'Amount', 'Time', 'Service', 'Mobile No', 'Area', 'Refrance', 'Address']);
  recent.addRow(['Test Spice Hotel', '1.10.2026', null, 1700, '12.30 AM', 'Cockorach', 9811100099, 'Hotel', 'JDR', 'Pune Nagar road']);
  recent.addRow(['Test Ranade', '3.10.2026', '3.10.2026', 3000, '9.00 AM', 'Bedbugs', '98111 00098', '2 BHK', 'Facebook', 'Sadashiv peth']);
  const copy = wb.addWorksheet('Feb 2027'); // a copied sheet: must not create duplicates
  copy.addRow(['Name ', 'Job Date', 'Collection date', 'Amount', 'Time', 'Service', 'Mobile No', 'Area', 'Refrance', 'Address']);
  copy.addRow(['Test Spice Hotel', '1.10.2026', '2.10.2026', 1700, '12.30 AM', 'Cockorach', 9811100099, 'Hotel', 'JDR', 'Pune Nagar road']);
  const soon = new Date(Date.now() + 3 * 864e5);
  copy.addRow(['Upcoming Test Office', `${soon.getDate()}.${soon.getMonth() + 1}.${soon.getFullYear()}`, null, 2200, '11.00 AM', 'Rat', 9811100097, 'Office', 'Visit', 'Hinjewadi']);
  wb.addWorksheet('expenses').addRow(['Date', 'Chemical', 'Amount']);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());

  const up = (q, who = 'admin') => request(app).post(`/api/admin/import${q}`).set('Authorization', `Bearer ${tok[who]}`).attach('file', buf, 'company.xlsx');
  assert.equal((await up('?commit=0', 'cc')).status, 403);
  assert.equal((await request(app).post('/api/admin/import').set('Authorization', `Bearer ${tok.admin}`).attach('file', Buffer.from('hello'), 'x.xlsx')).status, 400);

  const pre = await up('?commit=0');
  assert.equal(pre.status, 200, JSON.stringify(pre.body));
  const p = pre.body.preview;
  assert.equal(p.duplicatesRemoved, 1);
  assert.equal(p.history.total, 4);
  assert.equal(p.upcoming.length, 1);
  assert.equal(p.skippedTotal, 1);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM service_history WHERE import_key IS NOT NULL`)).rows[0].n, 0, 'preview saves nothing');

  const r1 = await up('?commit=1&removeSample=1');
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.result.historyAdded, 4);
  assert.equal(r1.body.result.jobsAdded, 1);
  assert.ok(r1.body.result.removed.customers >= 8);
  const hotel = (await pool.query(`SELECT * FROM customers WHERE name='Test Spice Hotel'`)).rows[0];
  assert.equal(hotel.mobile, '+919811100099');
  assert.equal(hotel.property_type, 'Commercial');
  const bed = (await pool.query(`SELECT service_code FROM service_history WHERE description='Bedbugs'`)).rows[0];
  assert.equal(bed.service_code, 'bed');
  assert.equal((await pool.query(`SELECT collected_on::text d FROM service_history h JOIN customers c ON c.id=h.customer_id WHERE c.name='Test Spice Hotel'`)).rows[0].d, '2026-10-02');
  assert.equal((await pool.query(`SELECT count(*)::int n FROM customers WHERE ref LIKE 'SAMPLE-%'`)).rows[0].n, 0);

  const r2 = await up('?commit=1');
  assert.equal(r2.body.result.historyAdded, 0);
  assert.equal(r2.body.result.jobsAdded, 0);
  assert.equal(r2.body.preview.customers.new, 0);

  // call center still never sees the imported numbers
  const cc = await api('cc').get('/api/customers?q=Test');
  assert.ok(cc.body.items.length >= 3);
  assert.doesNotMatch(JSON.stringify(cc.body), /98111000\d\d/);
});
