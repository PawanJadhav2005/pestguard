// One-time setup. Run by double-clicking SETUP.bat (or: node setup.js)
// Creates the database and its user, writes server/.env, installs everything,
// creates the tables and sample data, builds the admin portal, and opens the firewall port.
const { execFileSync, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = __dirname;
const WIN = process.platform === 'win32';
const ok = m => console.log(`  \u2714 ${m}`);
const step = m => console.log(`\n\u25B6 ${m}`);
function fail(m) { console.error(`\n\u2716 ${m}\n`); process.exitCode = 1; throw new Error('stop'); }

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(question, a => { rl.close(); res(a); }));
}

function findPsql() {
  if (process.env.PSQL) return process.env.PSQL;
  if (WIN) {
    for (const base of ['C:\\Program Files\\PostgreSQL', 'C:\\Program Files (x86)\\PostgreSQL']) {
      if (!fs.existsSync(base)) continue;
      const versions = fs.readdirSync(base).filter(v => fs.existsSync(path.join(base, v, 'bin', 'psql.exe'))).sort((a, b) => Number(b) - Number(a));
      if (versions.length) return path.join(base, versions[0], 'bin', 'psql.exe');
    }
  }
  const r = spawnSync(WIN ? 'where' : 'which', ['psql'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

function npm(args, cwd) {
  const r = spawnSync(WIN ? 'npm.cmd' : 'npm', args, { cwd, stdio: 'inherit', shell: WIN });
  if (r.status !== 0) fail(`"npm ${args.join(' ')}" failed in ${path.relative(ROOT, cwd) || '.'}. Check your internet connection and run SETUP again.`);
}

(async () => {
  console.log('\n=== PestGuard setup ===');

  step('Checking Node.js');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) fail(`Node.js ${process.versions.node} is too old. Install the LTS version from https://nodejs.org and run SETUP again.`);
  ok(`Node.js ${process.versions.node}`);

  step('Checking PostgreSQL');
  const psql = findPsql();
  if (!psql) fail('PostgreSQL is not installed. Install it from https://www.postgresql.org/download/windows/ (remember the password you set), then run SETUP again.');
  ok(`Found ${psql}`);
  const host = process.env.PGHOST || 'localhost';
  const port = process.env.PGPORT || '5432';
  const admin = process.env.PGADMINUSER || 'postgres';
  let pgPassword = process.env.PGPASSWORD;
  const sql = (q, db = 'postgres') => execFileSync(psql, ['-h', host, '-p', port, '-U', admin, '-d', db, '-v', 'ON_ERROR_STOP=1', '-tAc', q],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: pgPassword || '' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  for (let tries = 0; ; tries++) {
    if (pgPassword === undefined) pgPassword = await ask(`  Enter the password you set for the "${admin}" user when installing PostgreSQL: `);
    try { sql('SELECT 1'); break; }
    catch (e) {
      const msg = String(e.stderr || e.message);
      if (/password authentication failed/i.test(msg) && tries < 2) { console.log('  That password is wrong. Try again.'); pgPassword = undefined; continue; }
      if (/could not connect|Connection refused|No such file/i.test(msg)) fail('PostgreSQL is installed but not running. Open "Services" in Windows, start "postgresql-x64-…", then run SETUP again.');
      fail(`Could not sign in to PostgreSQL: ${msg.split('\n')[0]}`);
    }
  }
  ok('Signed in to PostgreSQL');

  step('Creating the database');
  const appPassword = crypto.randomBytes(12).toString('hex');
  sql(`DO $$BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='pestguard_app') THEN CREATE ROLE pestguard_app LOGIN PASSWORD '${appPassword}';
    ELSE ALTER ROLE pestguard_app LOGIN PASSWORD '${appPassword}'; END IF; END$$;`);
  if (!sql(`SELECT 1 FROM pg_database WHERE datname='pestguard'`)) { sql('CREATE DATABASE pestguard OWNER pestguard_app'); ok('Database "pestguard" created'); }
  else ok('Database "pestguard" already exists (your data is kept)');
  sql('GRANT CONNECT ON DATABASE pestguard TO pestguard_app');
  sql('GRANT USAGE, CREATE ON SCHEMA public TO pestguard_app', 'pestguard');
  // if tables were created earlier by another user, let the app use them
  sql(`DO $$DECLARE r record; BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE format('ALTER TABLE public.%I OWNER TO pestguard_app', r.tablename); END LOOP;
    FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname='public' LOOP EXECUTE format('ALTER SEQUENCE public.%I OWNER TO pestguard_app', r.sequencename); END LOOP; END$$;`, 'pestguard');
  ok('App user "pestguard_app" ready (limited permissions)');

  step('Writing server settings (server/.env)');
  const envPath = path.join(ROOT, 'server', '.env');
  const old = fs.existsSync(envPath) ? Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) : {};
  const env = {
    PORT: old.PORT || '4000',
    APP_TIMEZONE: old.APP_TIMEZONE || 'Asia/Kolkata',
    DATABASE_URL: `postgres://pestguard_app:${appPassword}@${host}:${port}/pestguard`,
    JWT_SECRET: old.JWT_SECRET && old.JWT_SECRET !== 'replace-with-a-long-random-string' ? old.JWT_SECRET : crypto.randomBytes(32).toString('hex'),
    CORS_ORIGINS: old.CORS_ORIGINS || 'http://localhost:5173',
    UPLOAD_DIR: old.UPLOAD_DIR || './uploads',
    EXOTEL_SID: old.EXOTEL_SID || '', EXOTEL_API_KEY: old.EXOTEL_API_KEY || '', EXOTEL_API_TOKEN: old.EXOTEL_API_TOKEN || '',
    EXOTEL_SUBDOMAIN: old.EXOTEL_SUBDOMAIN || 'api.exotel.com', EXOTEL_CALLER_ID: old.EXOTEL_CALLER_ID || ''
  };
  fs.writeFileSync(envPath, '# Written by SETUP. Keep this file private.\n' + Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  ok('Saved');

  step('Installing the server (takes a minute the first time)');
  npm(['install', '--no-audit', '--no-fund'], path.join(ROOT, 'server'));
  step('Creating tables and sample data');
  npm(['run', 'migrate'], path.join(ROOT, 'server'));
  npm(['run', 'seed'], path.join(ROOT, 'server'));

  step('Installing and building the admin portal');
  npm(['install', '--no-audit', '--no-fund'], path.join(ROOT, 'admin-web'));
  npm(['run', 'build'], path.join(ROOT, 'admin-web'));

  if (WIN) {
    step('Allowing phones on your Wi-Fi to reach the server (Windows will ask for permission)');
    const exists = spawnSync('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=PestGuard API'], { encoding: 'utf8' });
    if (exists.status === 0 && /PestGuard API/.test(exists.stdout)) ok('Firewall rule already there');
    else {
      spawnSync('powershell', ['-NoProfile', '-Command',
        "Start-Process netsh -Verb RunAs -Wait -ArgumentList 'advfirewall firewall add rule name=\"PestGuard API\" dir=in action=allow protocol=TCP localport=4000'"], { stdio: 'inherit' });
      ok('Firewall rule added (if you clicked Yes)');
    }
  }

  console.log('\n=== Setup finished ===');
  console.log('Next: double-click START.bat to run PestGuard.');
  console.log('Demo sign-ins (password demo1234): admin@pestguard.local, neha@pestguard.local, rakesh@pestguard.local\n');
})().catch(e => { if (e.message !== 'stop') { console.error(e); process.exitCode = 1; } });
