const http = require('http');
const { port, corsOrigins } = require('./config');
const app = require('./app');
const realtime = require('./realtime');
const { query } = require('./db');
const { notify } = require('./notify');

const server = http.createServer(app);
realtime.init(server, corsOrigins);

// Every minute: alert admins about overdue jobs (once per job) and due callbacks
async function checks() {
  try {
    const overdue = await query(`SELECT j.id, u.name FROM jobs j LEFT JOIN users u ON u.id=j.technician_id
      WHERE j.status IN ('Assigned','Accepted') AND j.scheduled_at < now() - interval '30 minutes'`);
    for (const j of overdue.rows) await notify({ role: 'admin', title: `JB-${j.id} is overdue (${j.name || 'unassigned'})`, link: `/jobs/${j.id}`, dedupeKey: `overdue:${j.id}` });
    const due = await query(`SELECT f.id, c.name FROM followups f JOIN customers c ON c.id=f.customer_id WHERE NOT f.done AND f.due_at <= now() + interval '10 minutes'`);
    for (const f of due.rows) await notify({ role: 'callcenter', title: `Callback due: ${f.name}`, link: '/followups', dedupeKey: `followup:${f.id}` });
  } catch (e) { console.error('Background check failed:', e.message); }
}
setInterval(checks, 60 * 1000);

server.listen(port, '0.0.0.0', () => { console.log(`PestGuard API running on http://localhost:${port}`); checks(); });
