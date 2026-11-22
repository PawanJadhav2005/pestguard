// Imports the company's existing Excel records (one sheet per month of jobs and collections).
// Reads every sheet that has a "Name"/"Customer name" header, cleans and de-duplicates the rows,
// groups them into customers, and stores past jobs as service history. Jobs dated in the next
// 60 days become upcoming (Pending) jobs. Safe to run again: nothing is imported twice.
const crypto = require('crypto');
const ExcelJS = require('exceljs');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAY = 864e5;

// ---------- cell helpers ----------
function plain(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return plain(v.result);
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if ('text' in v) return plain(v.text);
    if ('error' in v) return null;
  }
  return v;
}
const str = v => { v = plain(v); if (v === null) return null; if (v instanceof Date) return null; const s = String(v).replace(/\s+/g, ' ').trim(); return s || null; };

function sheetMonth(title) {
  const t = title.toLowerCase();
  const m = MONTHS.findIndex(n => t.includes(n.slice(0, 3)));
  const y = (t.match(/20\d\d/) || [])[0];
  return m >= 0 && y ? { month: m + 1, year: Number(y) } : null;
}

// Returns {y, m, d} or null. Fixes Excel's day/month swap when the swapped date matches the sheet's month.
function parseDate(v, sheetM) {
  v = plain(v);
  let y, m, d;
  if (v instanceof Date) { y = v.getUTCFullYear(); m = v.getUTCMonth() + 1; d = v.getUTCDate();
    if (sheetM && m !== sheetM.month && d === sheetM.month && m <= 12 && y === sheetM.year) [m, d] = [d, m];
  } else if (typeof v === 'number' && v > 30000 && v < 60000) { // Excel date serial number
    return parseDate(new Date(Math.round((v - 25569) * DAY)), null);
  } else if (typeof v === 'string' || typeof v === 'number') {
    v = String(v); // e.g. 22.52026 typed as a number
    // tolerant of typing slips: "26.10..2024", "10.-12-2022", "18 2.2025", "22.52026"
    const x = v.match(/(\d{1,2})[\s.\-/]+(\d{1,2})[\s.\-/]+(\d{4}|\d{2}(?!\d))/) || v.match(/(\d{1,2})[\s.\-/]+(\d{1,2})(20\d\d)/);
    if (!x) return null;
    d = Number(x[1]); m = Number(x[2]); y = Number(x[3]); if (y < 100) y += 2000;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return { y, m, d, iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, ts: dt.getTime() };
}

function parseTime(v) {
  v = plain(v);
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`;
  if (typeof v === 'number' && v > 0 && v < 1) { const mins = Math.round(v * 1440); return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`; }
  const s = str(v); if (!s) return null;
  const x = s.match(/(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?/i);
  if (!x) return null;
  let h = Number(x[1]); const min = Number(x[2] || 0); const ap = (x[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function parsePhone(v) {
  v = plain(v);
  if (v === null) return null;
  const s = typeof v === 'number' ? String(Math.round(v)) : String(v);
  const groups = s.split(/[\/,;]| or |\n/i).map(p => p.replace(/\D/g, '')).filter(Boolean);
  for (const g of groups) {
    let d = g;
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0') && /^[6-9]/.test(d.slice(1))) d = d.slice(1);
    if (d.length === 10 && /^[6-9]/.test(d)) return `+91${d}`;
  }
  const any = groups.find(g => g.length >= 8);
  return any || null; // landline etc. kept as digits
}

function parseAmount(v) {
  v = plain(v);
  if (typeof v === 'number' && isFinite(v)) return Math.round(v * 100) / 100;
  const s = str(v); if (!s) return null;
  const n = Number(s.replace(/[₹,\s]/g, '').replace(/\/-$/, ''));
  return isFinite(n) && n >= 0 ? n : null;
}

// ---------- mapping to app values ----------
function serviceCode(text) {
  const t = (text || '').toLowerCase();
  if (/b[eo]?[dbs]\s*-?\s*bug|bedbug|bebdug|besbug|bebbug|bed bug/.test(t)) return 'bed';
  if (/termite|white ant/.test(t)) return 'ter';
  if (/mosquito|fogging|dengue/.test(t)) return 'mos';
  if (/sanit|disinf/.test(t)) return 'san';
  const rodent = /\brat\b|rats|rodent|mouse|mice/.test(t);
  const other = /cock|cox|roach|ant|fl(y|ies)|lizard|general|spray|sprey|bee|honey|snake/.test(t);
  if (rodent && !other) return 'rod';
  return 'gpc';
}
const BUSINESS = /hotel|restaurant|resto|\bbar\b|cafe|caf\u00e9|dhaba|bakery|sweets?\b|company|compny|technolog|solution|software|\binfo|pvt|ltd|llp|industr|factory|enterprise|corporat|services|school|college|hospital|clinic|society|mall|office|bank|game|banquet|hall|lawn|godown|warehouse|shop|store|mart|plaza|showroom|studio|gym|salon|hostel|\bpg\b|lodge|kitchen|canteen|mess\b|foods?\b|spice|hub\b|centre|center|academy|institute/;
// Property type from the "Area" column; when that's empty, guess Commercial from a business-like name.
function propertyTypeFor(area, name) {
  if (area) return propertyType(area);
  return BUSINESS.test((name || '').toLowerCase()) ? 'Commercial' : '2 BHK';
}
function propertyType(text) {
  const t = (text || '').toLowerCase();
  const bhk = t.match(/(\d)\s*bhk/);
  if (bhk) { const n = Number(bhk[1]); if (/bung|row ?house|villa/.test(t) || n >= 4) return 'Bungalow'; return n <= 1 ? '1 BHK' : n === 2 ? '2 BHK' : '3 BHK'; }
  if (/bung|villa|row ?house/.test(t)) return 'Bungalow';
  if (/\b1\s*rk\b|1rk|single room|1 room|hostel room|staff room/.test(t)) return '1 BHK';
  if (/^\s*[2-3]\s*rooms?\b/.test(t)) return '2 BHK';
  if (/flat|house|home|apartment/.test(t)) return '2 BHK';
  if (t.trim()) return 'Commercial';
  return '2 BHK';
}
const nameKey = n => n.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim();
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 24);

// ---------- read workbook ----------
async function readWorkbook(buffer, today = new Date()) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const todayTs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const out = { sheets: [], rows: 0, records: [], skipped: [] };
  wb.eachSheet(ws => {
    // find the header row (first 8 rows) with a Name / Customer name cell
    let hRow = null, hCol = null;
    for (let r = 1; r <= Math.min(8, ws.rowCount) && !hRow; r++) {
      ws.getRow(r).eachCell((c, col) => { const s = (str(c.value) || '').toLowerCase(); if (!hRow && (s === 'name' || s === 'customer name')) { hRow = r; hCol = col; } });
    }
    if (!hRow) return; // not a jobs sheet (e.g. expenses)
    const cols = {};
    ws.getRow(hRow).eachCell((c, col) => {
      const s = (str(c.value) || '').toLowerCase();
      if (col === hCol) cols.name = col;
      else if (/^(job|service)\s*date/.test(s)) cols.date = col;
      else if (s.startsWith('collection')) cols.collected = col;
      else if (s.startsWith('amount')) cols.amount = col;
      else if (s === 'time') cols.time = col;
      else if (s.startsWith('service')) cols.service = col;
      else if (s.includes('mobile') || s.includes('phone') || s.includes('contact')) cols.mobile = col;
      else if (s === 'area' || s.startsWith('property') || s.startsWith('type')) cols.area = col;
      else if (s.startsWith('ref')) cols.source = col;
      else if (s.startsWith('address')) cols.address = col;
    });
    const sm = sheetMonth(ws.name);
    let count = 0;
    for (let r = hRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const g = k => (cols[k] ? row.getCell(cols[k]).value : null);
      const name = str(g('name'));
      if (!name) continue;
      const ln = name.toLowerCase();
      if (ln === 'name' || ln === 'customer name' || /^total\b/.test(ln) || /^collection of/.test(ln)) continue;
      out.rows++; count++;
      const rawDate = g('date') ?? g('collected');
      const date = parseDate(g('date'), sm) || parseDate(g('collected'), sm); // fall back to the collection date
      const skip = reason => out.skipped.push({ sheet: ws.name, row: r, name, reason });
      if (!date) { skip(rawDate ? `Date not understood: "${str(rawDate) || plain(rawDate)}"` : 'No job date'); continue; }
      if (date.y < 2010) { skip(`Year looks wrong: ${date.iso}`); continue; }
      if (date.ts > todayTs + 60 * DAY) { skip(`Date is too far in the future: ${date.iso}`); continue; }
      const svcText = str(g('service'));
      const area = str(g('area'));
      const collected = parseDate(g('collected'), sm);
      out.records.push({
        sheet: ws.name, row: r, name, nameKey: nameKey(name),
        date: date.iso, ts: date.ts, upcoming: date.ts > todayTs,
        time: parseTime(g('time')), amount: parseAmount(g('amount')),
        description: svcText, serviceCode: serviceCode(svcText || name),
        phone: parsePhone(g('mobile')), category: area, propertyType: propertyTypeFor(area, name),
        source: str(g('source')), address: str(g('address')), collectedOn: collected ? collected.iso : null
      });
    }
    out.sheets.push({ name: ws.name, rows: count });
  });

  // De-duplicate: the same job is often copied into later months' sheets.
  const byKey = new Map();
  for (const rec of out.records) {
    const k = `${rec.nameKey}|${rec.date}|${rec.amount ?? ''}`;
    const prev = byKey.get(k);
    if (!prev) { byKey.set(k, { ...rec }); continue; }
    for (const f of ['time', 'description', 'phone', 'category', 'source', 'address', 'collectedOn']) if (!prev[f] && rec[f]) prev[f] = rec[f];
    if (rec.description) prev.serviceCode = serviceCode(prev.description);
    prev.propertyType = propertyTypeFor(prev.category, prev.name);
  }
  out.duplicates = out.records.length - byKey.size;
  out.records = [...byKey.values()].sort((a, b) => a.ts - b.ts);

  // Group into customers: by phone number when known, otherwise by name.
  const phoneOfName = new Map();
  for (const r of out.records) if (r.phone && !phoneOfName.has(r.nameKey)) phoneOfName.set(r.nameKey, r.phone);
  const customers = new Map();
  for (const r of out.records) {
    const phone = r.phone || phoneOfName.get(r.nameKey) || null;
    const key = phone ? `m:${phone}` : `n:${r.nameKey}`;
    let c = customers.get(key);
    if (!c) { c = { key, name: r.name, phone, address: null, category: null, propertyType: r.propertyType, source: null, records: [] }; customers.set(key, c); }
    c.records.push(r);
    // latest values win (records are in date order)
    c.name = r.name;
    if (r.address) c.address = r.address;
    if (r.category) { c.category = r.category; c.propertyType = r.propertyType; } else if (!c.category) c.propertyType = r.propertyType;
    if (r.source && !c.source) c.source = r.source;
    r.customerKey = key;
    r.importKey = hash(`${r.nameKey}|${r.date}|${r.amount ?? ''}|${(r.description || '').toLowerCase()}`);
  }
  out.customers = [...customers.values()];
  return out;
}

// ---------- plan + commit ----------
async function plan(db, parsed) {
  const keys = parsed.customers.map(c => c.key);
  const existingC = new Set((await db.query('SELECT import_key FROM customers WHERE import_key = ANY($1)', [keys])).rows.map(r => r.import_key));
  const hKeys = parsed.records.filter(r => !r.upcoming).map(r => r.importKey);
  const existingH = new Set((await db.query('SELECT import_key FROM service_history WHERE import_key = ANY($1)', [hKeys])).rows.map(r => r.import_key));
  const jKeys = parsed.records.filter(r => r.upcoming).map(r => r.importKey);
  const existingJ = new Set((await db.query('SELECT import_key FROM jobs WHERE import_key = ANY($1)', [jKeys])).rows.map(r => r.import_key));
  const sample = (await db.query(`SELECT count(*)::int n FROM customers WHERE ref LIKE 'SAMPLE-%'`)).rows[0].n;
  const past = parsed.records.filter(r => !r.upcoming);
  const svcCounts = {};
  for (const r of parsed.records) svcCounts[r.serviceCode] = (svcCounts[r.serviceCode] || 0) + 1;
  return {
    sheets: parsed.sheets, rowsRead: parsed.rows, duplicatesRemoved: parsed.duplicates,
    customers: { total: parsed.customers.length, new: parsed.customers.filter(c => !existingC.has(c.key)).length, alreadyImported: parsed.customers.filter(c => existingC.has(c.key)).length,
      withPhone: parsed.customers.filter(c => c.phone).length, withAddress: parsed.customers.filter(c => c.address).length },
    history: { total: past.length, new: past.filter(r => !existingH.has(r.importKey)).length, alreadyImported: past.filter(r => existingH.has(r.importKey)).length,
      revenue: Math.round(past.reduce((s, r) => s + (r.amount || 0), 0)),
      from: past[0]?.date || null, to: past[past.length - 1]?.date || null },
    upcoming: parsed.records.filter(r => r.upcoming).map(r => ({ name: r.name, date: r.date, time: r.time, service: r.description, isNew: !existingJ.has(r.importKey) })),
    byService: svcCounts,
    skipped: parsed.skipped.slice(0, 300), skippedTotal: parsed.skipped.length,
    sampleCustomers: sample
  };
}

async function commit(db, parsed, { userId, services }) {
  // next readable customer reference: PG-1001, PG-1002 ...
  const maxRef = (await db.query(`SELECT COALESCE(max((substring(ref from '^PG-(\\d+)$'))::int), 1000) n FROM customers`)).rows[0].n;
  let next = maxRef + 1;
  const existing = new Map((await db.query('SELECT id, import_key, ref FROM customers WHERE import_key = ANY($1)', [parsed.customers.map(c => c.key)])).rows.map(r => [r.import_key, r]));
  const rows = parsed.customers.map(c => ({ ...c, ref: existing.get(c.key)?.ref || `PG-${next++}` }));
  // upsert customers in batches
  const idOf = new Map();
  for (let i = 0; i < rows.length; i += 500) {
    const b = rows.slice(i, i + 500);
    const res = await db.query(`INSERT INTO customers (ref, name, mobile, address, property_type, category, source, import_key)
      SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
      ON CONFLICT (import_key) WHERE import_key IS NOT NULL DO UPDATE SET
        name = EXCLUDED.name, mobile = COALESCE(EXCLUDED.mobile, customers.mobile), address = COALESCE(EXCLUDED.address, customers.address),
        property_type = EXCLUDED.property_type, category = COALESCE(EXCLUDED.category, customers.category), source = COALESCE(customers.source, EXCLUDED.source)
      RETURNING id, import_key`,
      [b.map(c => c.ref), b.map(c => c.name), b.map(c => c.phone), b.map(c => c.address), b.map(c => c.propertyType), b.map(c => c.category), b.map(c => c.source), b.map(c => c.key)]);
    res.rows.forEach(r => idOf.set(r.import_key, r.id));
  }
  // past services -> service_history
  const past = parsed.records.filter(r => !r.upcoming);
  let historyAdded = 0;
  for (let i = 0; i < past.length; i += 1000) {
    const b = past.slice(i, i + 1000);
    const res = await db.query(`INSERT INTO service_history (customer_id, service_code, service_date, price, description, collected_on, source, ref, import_key)
      SELECT * FROM unnest($1::int[], $2::text[], $3::date[], $4::numeric[], $5::text[], $6::date[], $7::text[], $8::text[], $9::text[])
      ON CONFLICT (import_key) WHERE import_key IS NOT NULL DO NOTHING`,
      [b.map(r => idOf.get(r.customerKey)), b.map(r => r.serviceCode), b.map(r => r.date), b.map(r => r.amount), b.map(r => r.description),
       b.map(r => r.collectedOn), b.map(r => r.source), b.map(r => `${r.sheet} row ${r.row}`), b.map(r => r.importKey)]);
    historyAdded += res.rowCount;
  }
  // upcoming -> Pending jobs (skip if that customer already has an open job for the same service)
  let jobsAdded = 0; const jobsSkipped = [];
  for (const r of parsed.records.filter(x => x.upcoming)) {
    const price = r.amount || Number(services[r.serviceCode]?.prices?.[r.propertyType]) || 0;
    const when = `${r.date}T${r.time || '10:00'}:00+05:30`;
    await db.query('SAVEPOINT j');
    try {
      const j = await db.query(`INSERT INTO jobs (customer_id, service_code, property_type, price, status, scheduled_at, notes, created_by, import_key)
        VALUES ($1,$2,$3,$4,'Pending',$5,$6,$7,$8) ON CONFLICT (import_key) WHERE import_key IS NOT NULL DO NOTHING RETURNING id`,
        [idOf.get(r.customerKey), r.serviceCode, r.propertyType, price, when, [r.description, 'Imported from Excel'].filter(Boolean).join(' · '), userId, r.importKey]);
      if (j.rows[0]) { jobsAdded++; await db.query(`INSERT INTO job_events (job_id, user_id, text) VALUES ($1,$2,'Imported from the company Excel file')`, [j.rows[0].id, userId]); }
      await db.query('RELEASE SAVEPOINT j');
    } catch (e) {
      await db.query('ROLLBACK TO SAVEPOINT j');
      if (e.code === '23505') jobsSkipped.push({ name: r.name, date: r.date, reason: 'Customer already has an open job for this service' }); else throw e;
    }
  }
  return { customers: rows.length, historyAdded, jobsAdded, jobsSkipped };
}

// Deletes the made-up SAMPLE customers, their jobs, and the sample inventory items. Real data is untouched.
const SAMPLE_SKUS = ['CHM-GEL', 'CHM-IMI', 'CHM-CYP', 'CHM-CHL', 'CHM-DEL', 'CHM-BIF', 'CHM-TEM', 'CHM-BRO', 'CON-GLU', 'SAF-MSK', 'EQP-SPR'];
async function removeSampleData(db) {
  const c = (await db.query(`SELECT id FROM customers WHERE ref LIKE 'SAMPLE-%'`)).rows.map(r => r.id);
  const items = (await db.query(`SELECT id FROM inventory_items WHERE sku = ANY($1)`, [SAMPLE_SKUS])).rows.map(r => r.id);
  if (c.length) {
    const jobs = (await db.query('SELECT id FROM jobs WHERE customer_id = ANY($1)', [c])).rows.map(r => r.id);
    if (jobs.length) {
      await db.query('DELETE FROM inventory_movements WHERE job_id = ANY($1)', [jobs]);
      await db.query('DELETE FROM reports WHERE job_id = ANY($1)', [jobs]);
      await db.query('DELETE FROM jobs WHERE id = ANY($1)', [jobs]);
    }
    for (const t of ['call_logs', 'followups', 'service_history']) await db.query(`DELETE FROM ${t} WHERE customer_id = ANY($1)`, [c]);
    await db.query('DELETE FROM amc_contracts WHERE customer_id = ANY($1)', [c]);
    await db.query('DELETE FROM customers WHERE id = ANY($1)', [c]);
  }
  if (items.length) {
    await db.query('DELETE FROM report_items WHERE item_id = ANY($1)', [items]);
    await db.query('DELETE FROM inventory_movements WHERE item_id = ANY($1)', [items]);
    await db.query('DELETE FROM inventory_items WHERE id = ANY($1)', [items]);
  }
  await db.query(`INSERT INTO app_settings (key, value) VALUES ('sample_removed', 'yes') ON CONFLICT (key) DO UPDATE SET value='yes'`);
  return { customers: c.length, items: items.length };
}

module.exports = { readWorkbook, plan, commit, removeSampleData, _test: { parseDate, parsePhone, parseTime, serviceCode, propertyType, propertyTypeFor, parseAmount } };
