const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const { query } = require('../db');
const { wrap, HttpError } = require('../errors');
const { allow } = require('../auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

// Checks the real file content, not just the name or the type the phone claims
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}
router.post('/', allow('technician', 'admin'), (req, res, next) => upload.single('file')(req, res, err => {
  if (err) return next(new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 5 MB' : 'Upload failed'));
  next();
}), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file received');
  const ext = sniff(req.file.buffer);
  if (!ext) throw new HttpError(400, 'Only JPG or PNG images are allowed');
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  await query('INSERT INTO files (name, mime, data, uploaded_by) VALUES ($1,$2,$3,$4)', [name, ext === 'png' ? 'image/png' : 'image/jpeg', req.file.buffer, req.user.id]);
  res.status(201).json({ file: name });
}));
module.exports = router;
