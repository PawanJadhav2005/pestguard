-- Support for importing the company's existing records (Excel) and its own inventory.

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Customers: property category as the company writes it (Hotel, Office, 2 BHK ...),
-- how they found the company (Justdial, Visit, Google ...), and a key so re-importing never duplicates.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS import_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS customers_import_key_idx ON customers (import_key) WHERE import_key IS NOT NULL;
ALTER TABLE customers ALTER COLUMN address DROP NOT NULL;

-- Past services: original description, when payment was collected, lead source, import key.
ALTER TABLE service_history ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE service_history ADD COLUMN IF NOT EXISTS collected_on DATE;
ALTER TABLE service_history ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE service_history ADD COLUMN IF NOT EXISTS import_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS service_history_import_key_idx ON service_history (import_key) WHERE import_key IS NOT NULL;

-- Upcoming bookings found in the import become jobs; the key stops duplicates.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS import_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_import_key_idx ON jobs (import_key) WHERE import_key IS NOT NULL;

-- The company's own stock items (quantities start at 0: enter opening stock in Admin > Inventory)
INSERT INTO inventory_items (sku, name, category, unit, quantity, reorder_level, cost_per_unit) VALUES
  ('FIP-GEL',  'Fipronil gel (35 g cartridge)',          'chemical',   'g',   0, 0, 0),
  ('TRN-EC20', 'Transportex EC 20% (1000 ml bottle)',    'chemical',   'ml',  0, 0, 0),
  ('IMI-1L',   'Imidacloprid (1000 ml bottle)',           'chemical',   'ml',  0, 0, 0),
  ('ZNP',      'Zinc phosphate',                          'chemical',   'pcs', 0, 0, 0),
  ('CELPHOS',  'Celphos',                                 'chemical',   'pcs', 0, 0, 0),
  ('GLUE-PAD', 'Glue pad',                                'consumable', 'pcs', 0, 0, 0),
  ('TAPE',     'Tape',                                    'consumable', 'pcs', 0, 0, 0),
  ('DRONE',    'Drone',                                   'equipment',  'pcs', 0, 0, 0)
ON CONFLICT (sku) DO NOTHING;
