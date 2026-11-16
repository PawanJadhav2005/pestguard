-- Store uploaded photos and signatures in the database, so they survive server
-- restarts on hosts with temporary disks (such as Render's free plan).
CREATE TABLE IF NOT EXISTS files (
  name        TEXT PRIMARY KEY,           -- random 32-hex name + .jpg/.png
  mime        TEXT NOT NULL,
  data        BYTEA NOT NULL,
  uploaded_by INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
