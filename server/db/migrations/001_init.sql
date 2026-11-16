-- PestGuard initial schema
-- Safe to run on an empty database. Later imports (your customer and inventory
-- data) go into the same tables; see README "Importing your data".

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','callcenter','technician')),
  phone         TEXT,                       -- staff phone, used to bridge masked calls
  area          TEXT,
  skills        TEXT[] NOT NULL DEFAULT '{}',
  available     BOOLEAN NOT NULL DEFAULT TRUE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
  code            TEXT PRIMARY KEY,          -- gpc, ter, bed, mos, rod, san
  name            TEXT NOT NULL,
  warranty        TEXT NOT NULL,
  prices          JSONB NOT NULL,            -- {"1 BHK":999,"2 BHK":1299,...}
  active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS customers (
  id            SERIAL PRIMARY KEY,
  ref           TEXT NOT NULL UNIQUE,        -- keep your existing customer IDs here
  name          TEXT NOT NULL,
  mobile        TEXT,                        -- never sent to call center or technicians
  address       TEXT NOT NULL,
  area          TEXT,
  property_type TEXT NOT NULL DEFAULT '2 BHK',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_name_idx ON customers (lower(name));
CREATE INDEX IF NOT EXISTS customers_area_idx ON customers (area);

-- Past services imported from your old records (before this app existed)
CREATE TABLE IF NOT EXISTS service_history (
  id              SERIAL PRIMARY KEY,
  customer_id     INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_code    TEXT REFERENCES services(code),
  service_date    DATE NOT NULL,
  price           NUMERIC(10,2),
  technician_name TEXT,
  ref             TEXT
);
CREATE INDEX IF NOT EXISTS service_history_customer_idx ON service_history (customer_id, service_date DESC);

CREATE TABLE IF NOT EXISTS amc_contracts (
  id            SERIAL PRIMARY KEY,
  customer_id   INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_code  TEXT NOT NULL REFERENCES services(code),
  visits_total  INT NOT NULL CHECK (visits_total > 0),
  visits_done   INT NOT NULL DEFAULT 0 CHECK (visits_done >= 0),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  price         NUMERIC(10,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id             SERIAL PRIMARY KEY,
  customer_id    INT NOT NULL REFERENCES customers(id),
  service_code   TEXT NOT NULL REFERENCES services(code),
  property_type  TEXT NOT NULL,
  price          NUMERIC(10,2) NOT NULL,     -- price at booking time; never rewritten
  priority       TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low','Normal','High','Urgent')),
  infestation    TEXT NOT NULL DEFAULT 'Medium' CHECK (infestation IN ('Low','Medium','High')),
  status         TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN
                 ('Pending','Assigned','Accepted','On the way','In Progress','On Hold',
                  'Awaiting Approval','Completed','Unable to Complete','Cancelled')),
  technician_id  INT REFERENCES users(id),
  scheduled_at   TIMESTAMPTZ NOT NULL,
  notes          TEXT,
  amc_id         INT REFERENCES amc_contracts(id),
  created_by     INT REFERENCES users(id),
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_tech_idx ON jobs (technician_id, scheduled_at);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);
-- Duplicate prevention: one open job per customer and service
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_open_per_service
  ON jobs (customer_id, service_code)
  WHERE status IN ('Pending','Assigned','Accepted','On the way','In Progress','On Hold','Awaiting Approval');

CREATE TABLE IF NOT EXISTS job_events (
  id         SERIAL PRIMARY KEY,
  job_id     INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id    INT REFERENCES users(id),
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_events_job_idx ON job_events (job_id, created_at);

CREATE TABLE IF NOT EXISTS inventory_items (
  id             SERIAL PRIMARY KEY,
  sku            TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'chemical' CHECK (category IN ('chemical','equipment','consumable','safety')),
  unit           TEXT NOT NULL,              -- ml, g, pcs, blocks, L, kg
  quantity       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reorder_level  NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_per_unit  NUMERIC(10,2) NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id            SERIAL PRIMARY KEY,
  item_id       INT NOT NULL REFERENCES inventory_items(id),
  change        NUMERIC(12,2) NOT NULL,      -- + added, - removed
  reason        TEXT NOT NULL CHECK (reason IN ('stock_in','stock_out','adjustment','job_usage','job_usage_reversed')),
  balance_after NUMERIC(12,2) NOT NULL,
  job_id        INT REFERENCES jobs(id),
  user_id       INT REFERENCES users(id),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_movements_item_idx ON inventory_movements (item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id               SERIAL PRIMARY KEY,
  job_id           INT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  technician_id    INT NOT NULL REFERENCES users(id),
  areas            TEXT[] NOT NULL,
  notes            TEXT,
  safety_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  before_photo     TEXT,
  after_photo      TEXT,
  signature        TEXT,                     -- uploaded file name
  status           TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','returned')),
  admin_comment    TEXT,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      INT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS report_items (
  id         SERIAL PRIMARY KEY,
  report_id  INT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  item_id    INT NOT NULL REFERENCES inventory_items(id),
  quantity   NUMERIC(12,2) NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS call_logs (
  id               SERIAL PRIMARY KEY,
  customer_id      INT NOT NULL REFERENCES customers(id),
  user_id          INT NOT NULL REFERENCES users(id),
  status           TEXT NOT NULL DEFAULT 'initiated',  -- initiated, failed, logged
  outcome          TEXT,
  duration_sec     INT,
  notes            TEXT,
  provider_call_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS followups (
  id          SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  due_at      TIMESTAMPTZ NOT NULL,
  type        TEXT NOT NULL DEFAULT 'Callback' CHECK (type IN ('Callback','Renewal','Feedback')),
  note        TEXT,
  created_by  INT REFERENCES users(id),
  done        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id),      -- for one person
  role        TEXT,                          -- or for everyone in a role
  title       TEXT NOT NULL,
  link        TEXT,
  dedupe_key  TEXT UNIQUE,                   -- stops the same alert being sent twice
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id         INT NOT NULL REFERENCES users(id),
  PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id),
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INT,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
