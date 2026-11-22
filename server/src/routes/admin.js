// Admin tools: import the company's Excel records, remove sample data.
const router = require('express').Router();
const multer = require('multer');
const { query, tx } = require('../db');
const { allow } = require('../auth');
const { wrap, HttpError } = require('../errors');
const { audit } = require('../audit');
const { emit } = require('../realtime');
const importer = require('../importer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
const isXlsx = buf => buf && buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; // .xlsx files are zip archives ("PK")

router.use(allow('admin'));

// POST /api/admin/import?commit=0  -> preview only (nothing saved)
// POST /api/admin/import?commit=1&removeSample=1 -> import (one transaction)
router.post('/import', (req, res, next) => upload.single('file')(req, res, err => {
  if (err) return next(new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 20 MB' : 'Upload failed'));
  next();
}), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose an Excel file (.xlsx)');
  if (!isXlsx(req.file.buffer)) throw new HttpError(400, 'This is not an .xlsx Excel file. In Excel, use File > Save As > Excel Workbook (.xlsx) and try again.');
  let parsed;
  try { parsed = await importer.readWorkbook(req.file.buffer); }
  catch { throw new HttpError(400, 'Could not read this Excel file. Open it in Excel, save it again as .xlsx, and retry.'); }
  if (!parsed.sheets.length) throw new HttpError(400, 'No sheet with a "Name" or "Customer name" column was found.');
  const preview = await importer.plan({ query }, parsed);
  if (req.query.commit !== '1') return res.json({ preview });

  const services = Object.fromEntries((await query('SELECT code, prices FROM services')).rows.map(s => [s.code, s]));
  const result = await tx(async db => {
    const removed = req.query.removeSample === '1' ? await importer.removeSampleData(db) : null;
    const done = await importer.commit(db, parsed, { userId: req.user.id, services });
    return { ...done, removed };
  });
  await audit(req.user.id, 'import_excel', null, null, { file: req.file.originalname, ...result, jobsSkipped: result.jobsSkipped.length });
  emit(['role:admin', 'role:callcenter'], 'job:updated', {});
  emit(['role:admin', 'role:technician'], 'inventory:changed', {});
  res.json({ preview, result });
}));

router.post('/remove-sample', wrap(async (req, res) => {
  const removed = await tx(db => importer.removeSampleData(db));
  await audit(req.user.id, 'remove_sample_data', null, null, removed);
  emit(['role:admin', 'role:callcenter'], 'job:updated', {});
  emit(['role:admin', 'role:technician'], 'inventory:changed', {});
  res.json({ removed });
}));

module.exports = router;
