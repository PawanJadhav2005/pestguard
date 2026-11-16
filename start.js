// Starts PestGuard. Run by double-clicking START.bat (or: node start.js)
// One server serves the API, live updates and the admin portal on port 4000.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const WIN = process.platform === 'win32';
const server = path.join(ROOT, 'server');

const npm = (args, cwd) => spawnSync(WIN ? 'npm.cmd' : 'npm', args, { cwd, stdio: 'inherit', shell: WIN }).status === 0;

if (!fs.existsSync(path.join(server, '.env'))) {
  console.error('\nPestGuard is not set up yet. Double-click SETUP.bat first (or put your database settings in server\\.env).\n');
  process.exit(1);
}
// First run on this PC: install what's needed (works with an online database like Neon, no PostgreSQL install)
if (!fs.existsSync(path.join(server, 'node_modules'))) {
  console.log('Installing the server (first run, takes a minute)...');
  if (!npm(['install', '--no-audit', '--no-fund'], server)) { console.error('Install failed. Check your internet connection.'); process.exit(1); }
}
if (!fs.existsSync(path.join(ROOT, 'admin-web', 'dist', 'index.html'))) {
  console.log('Building the admin portal (first run)...');
  const admin = path.join(ROOT, 'admin-web');
  if (!fs.existsSync(path.join(admin, 'node_modules'))) npm(['install', '--no-audit', '--no-fund'], admin);
  npm(['run', 'build'], admin);
}
// Create/update tables and demo accounts (safe to repeat, never deletes data)
console.log('Checking the database...');
if (!npm(['run', 'migrate'], server) || !npm(['run', 'seed'], server)) {
  console.error('\nCould not reach the database. Check DATABASE_URL in server\\.env and your internet connection.\n');
  process.exit(1);
}

const port = (fs.readFileSync(path.join(server, '.env'), 'utf8').match(/^PORT=(\d+)/m) || [])[1] || '4000';
const lan = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);

const child = spawn(process.execPath, ['src/index.js'], { cwd: server, stdio: ['ignore', 'pipe', 'inherit'] });
let opened = false;
child.stdout.on('data', d => {
  process.stdout.write(d);
  if (!opened && /running on/.test(String(d))) {
    opened = true;
    console.log('\n==============================================');
    console.log(' PestGuard is running. Keep this window open.');
    console.log(`  Admin portal on this PC:  http://localhost:${port}`);
    for (const ip of lan) console.log(`  Server address for phones: http://${ip}:${port}`);
    console.log('  Close this window to stop.');
    console.log('==============================================\n');
    if (WIN) spawn('cmd', ['/c', 'start', '', `http://localhost:${port}`], { detached: true, stdio: 'ignore' }).unref();
  }
});
child.on('exit', code => {
  if (code) console.error('\nThe server stopped with an error (see above). If it mentions the database, run SETUP.bat again.');
  process.exit(code || 0);
});
process.on('SIGINT', () => child.kill());
