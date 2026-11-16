// Seeds services, demo staff accounts and (optionally) SAMPLE customers, inventory and jobs.
//   npm run seed                -> services + staff + sample data (only if the database has no customers yet)
//   npm run seed -- --no-sample -> services + staff only (use this before importing your real data)
// Password for every demo staff account: SEED_PASSWORD from .env / hosting settings, or demo1234 if not set.
// It only applies when an account is first created; re-running the seed never changes passwords.
require('../src/config');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

const SERVICES = [
  ['gpc', 'General Pest Control', '3 months', [999, 1299, 1599, 2499, 3499]],
  ['ter', 'Termite Treatment', '5 years', [2999, 3999, 4999, 8999, 12999]],
  ['bed', 'Bed Bug Treatment', '1 month', [1499, 1999, 2499, 3999, 4999]],
  ['mos', 'Mosquito Control', '1 month', [799, 999, 1199, 1999, 2999]],
  ['rod', 'Rodent Control', '3 months', [899, 1099, 1299, 1999, 2999]],
  ['san', 'Disinfection', 'No warranty', [699, 899, 1099, 1799, 2999]]
];
const PROPS = ['1 BHK', '2 BHK', '3 BHK', 'Bungalow', 'Commercial'];
const STAFF = [
  ['Priya Mehta', 'admin@pestguard.local', 'admin', '+919800000001', null, []],
  ['Neha Desai', 'neha@pestguard.local', 'callcenter', '+919800000002', null, []],
  ['Arjun Trivedi', 'arjun@pestguard.local', 'callcenter', '+919800000003', null, []],
  ['Rakesh Patel', 'rakesh@pestguard.local', 'technician', '+919800000011', 'Navrangpura', ['gpc', 'ter', 'bed', 'san']],
  ['Imran Shaikh', 'imran@pestguard.local', 'technician', '+919800000012', 'Maninagar', ['gpc', 'mos', 'rod', 'san']],
  ['Hardik Joshi', 'hardik@pestguard.local', 'technician', '+919800000013', 'Bopal', ['ter', 'gpc', 'bed']],
  ['Sunil Rathod', 'sunil@pestguard.local', 'technician', '+919800000014', 'Satellite', ['mos', 'rod', 'gpc']]
];
const ITEMS = [
  ['CHM-GEL', 'Gel bait (Fipronil 0.05%)', 'chemical', 'g', 1200, 300, 2.2],
  ['CHM-IMI', 'Imidacloprid 30.5% SC', 'chemical', 'ml', 5000, 1000, 1.6],
  ['CHM-CYP', 'Cypermethrin 10% EC', 'chemical', 'ml', 4000, 1000, 0.9],
  ['CHM-CHL', 'Chlorpyrifos 20% EC', 'chemical', 'ml', 3000, 800, 0.7],
  ['CHM-DEL', 'Deltamethrin 2.5% WP', 'chemical', 'g', 900, 250, 1.4],
  ['CHM-BIF', 'Bifenthrin 2.5% EC', 'chemical', 'ml', 2500, 600, 1.1],
  ['CHM-TEM', 'Temephos 50% EC', 'chemical', 'ml', 600, 200, 1.8],
  ['CHM-BRO', 'Bromadiolone bait 0.005%', 'chemical', 'blocks', 180, 60, 6],
  ['CON-GLU', 'Glue traps', 'consumable', 'pcs', 40, 30, 35],
  ['SAF-MSK', 'Respirator masks', 'safety', 'pcs', 25, 10, 120],
  ['EQP-SPR', 'Knapsack sprayer 16 L', 'equipment', 'pcs', 6, 2, 2400]
];

(async () => {
  const sample = !process.argv.includes('--no-sample');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const [code, name, warranty, prices] of SERVICES) {
      const p = Object.fromEntries(PROPS.map((k, i) => [k, prices[i]]));
      await c.query(`INSERT INTO services (code,name,warranty,prices) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING`, [code, name, warranty, JSON.stringify(p)]);
    }
    const password = process.env.SEED_PASSWORD || 'demo1234';
    const hash = await bcrypt.hash(password, 10);
    const ids = {};
    for (const [name, email, role, phone, area, skills] of STAFF) {
      const r = await c.query(`INSERT INTO users (name,email,password_hash,role,phone,area,skills) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [name, email, hash, role, phone, area, skills]);
      ids[email.split('@')[0]] = r.rows[0].id;
    }
    await c.query(`UPDATE users SET available=false WHERE email='sunil@pestguard.local'`);

    const hasCustomers = (await c.query('SELECT count(*)::int n FROM customers')).rows[0].n > 0;
    if (sample && !hasCustomers) {
      for (const [sku, name, cat, unit, qty, reorder, cost] of ITEMS) {
        const it = await c.query(`INSERT INTO inventory_items (sku,name,category,unit,quantity,reorder_level,cost_per_unit) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (sku) DO NOTHING RETURNING id`,
          [sku, name, cat, unit, qty, reorder, cost]);
        if (it.rows[0]) await c.query(`INSERT INTO inventory_movements (item_id, change, reason, balance_after, user_id, note) VALUES ($1,$2,'stock_in',$2,$3,'Opening stock (sample)')`, [it.rows[0].id, qty, ids.admin]);
      }
      // SAMPLE customers (made up). Replace with your real customer data later.
      const CUS = [
        ['SAMPLE-001', 'Kavita Pandya', '+919811100001', 'B-404 Sun Residency, Navrangpura, Ahmedabad', 'Navrangpura', '2 BHK'],
        ['SAMPLE-002', 'Amit Shah', '+919811100002', '12 Shanti Kunj Society, Navrangpura, Ahmedabad', 'Navrangpura', 'Bungalow'],
        ['SAMPLE-003', 'Sneha Iyer', '+919811100003', 'C-21 Shivalik Apartments, Vastrapur, Ahmedabad', 'Vastrapur', '3 BHK'],
        ['SAMPLE-004', 'Hotel Sapphire Inn', '+919811100004', 'Opp. Law Garden, Ellisbridge, Ahmedabad', 'Ellisbridge', 'Commercial'],
        ['SAMPLE-005', 'Rohan Mehta', '+919811100005', '7 Gulmohar Park, Satellite, Ahmedabad', 'Satellite', '3 BHK'],
        ['SAMPLE-006', 'Pooja Vyas', '+919811100006', 'A-9 Swastik Bungalows, Bopal, Ahmedabad', 'Bopal', 'Bungalow'],
        ['SAMPLE-007', 'Vikram Chauhan', '+919811100007', '33 Sardar Patel Colony, Maninagar, Ahmedabad', 'Maninagar', '2 BHK'],
        ['SAMPLE-008', 'Green Valley Society', '+919811100008', 'Near SG Highway, Gota, Ahmedabad', 'Gota', 'Commercial']
      ];
      const cid = [];
      for (const row of CUS) cid.push((await c.query(`INSERT INTO customers (ref,name,mobile,address,area,property_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, row)).rows[0].id);
      await c.query(`INSERT INTO service_history (customer_id, service_code, service_date, price, technician_name, ref) VALUES
        ($1,'gpc',current_date-62,1299,'Rakesh Patel','OLD-1001'), ($1,'gpc',current_date-150,1199,'Rakesh Patel','OLD-0950'),
        ($2,'ter',current_date-400,8999,'Hardik Joshi','OLD-0700'), ($3,'bed',current_date-90,2499,'Rakesh Patel','OLD-0990')`, [cid[0], cid[1], cid[2]]);
      const amc = (await c.query(`INSERT INTO amc_contracts (customer_id, service_code, visits_total, visits_done, start_date, end_date, price)
        VALUES ($1,'gpc',3,2,current_date-245,current_date+120,3120) RETURNING id`, [cid[0]])).rows[0].id;
      await c.query(`INSERT INTO amc_contracts (customer_id, service_code, visits_total, visits_done, start_date, end_date, price) VALUES ($1,'gpc',3,3,current_date-353,current_date+12,3840)`, [cid[4]]);
      const J = [
        [cid[0], 'gpc', '2 BHK', 1299, 'High', 'Accepted', ids.rakesh, `date_trunc('day', now()) + interval '11 hours 30 minutes'`, 'Heavy cockroach activity under the sink. Customer prefers gel.', amc],
        [cid[1], 'ter', 'Bungalow', 8999, 'High', 'Assigned', ids.rakesh, `date_trunc('day', now()) + interval '14 hours'`, 'Mud tubes near main door frame.', null],
        [cid[2], 'bed', '3 BHK', 2499, 'Normal', 'Assigned', ids.rakesh, `date_trunc('day', now()) + interval '1 day 10 hours'`, null, null],
        [cid[3], 'gpc', 'Commercial', 3499, 'High', 'In Progress', ids.imran, `date_trunc('day', now()) + interval '10 hours'`, 'Kitchen and store room.', null],
        [cid[4], 'gpc', '3 BHK', 1599, 'High', 'Pending', null, `date_trunc('day', now()) + interval '16 hours'`, 'AMC renewal visit.', null],
        [cid[6], 'mos', '2 BHK', 999, 'Normal', 'Pending', null, `date_trunc('day', now()) + interval '1 day 9 hours'`, null, null],
        [cid[7], 'mos', 'Commercial', 2999, 'Normal', 'Assigned', ids.sunil, `date_trunc('day', now()) - interval '1 day' + interval '11 hours'`, 'Society common areas.', null]
      ];
      for (const [cu, s, prop, price, pr, st, tech, when, notes, amcId] of J) {
        const j = (await c.query(`INSERT INTO jobs (customer_id, service_code, property_type, price, priority, status, technician_id, scheduled_at, notes, amc_id, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7, ${when}, $8,$9,$10) RETURNING id`, [cu, s, prop, price, pr, st, tech, notes, amcId, ids.neha])).rows[0].id;
        await c.query(`INSERT INTO job_events (job_id,user_id,text) VALUES ($1,$2,'Booked by Neha Desai')`, [j, ids.neha]);
        if (tech) await c.query(`INSERT INTO job_events (job_id,user_id,text) VALUES ($1,$2,'Assigned by Priya Mehta')`, [j, ids.admin]);
      }
      await c.query(`INSERT INTO followups (customer_id, due_at, type, note, created_by) VALUES
        ($1, now() + interval '2 hours', 'Renewal', 'AMC ends in 12 days. Offer renewal.', $3),
        ($2, now() + interval '1 day', 'Callback', 'Customer asked to call back after work', $3)`, [cid[4], cid[6], ids.neha]);
      console.log('Sample customers, inventory and jobs added (marked SAMPLE).');
    } else if (sample) console.log('Customers already exist, so no sample data was added.');
    await c.query('COMMIT');
    console.log(`Seed complete. Staff password: ${process.env.SEED_PASSWORD ? '(the SEED_PASSWORD you set)' : 'demo1234'}`);
  } catch (e) { await c.query('ROLLBACK'); console.error(e); process.exit(1); }
  finally { c.release(); await pool.end(); }
})();
