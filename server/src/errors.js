class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new HttpError(400, `${first.path.join('.') || 'input'}: ${first.message}`);
  }
  return r.data;
}
module.exports = { HttpError, wrap, parse };
