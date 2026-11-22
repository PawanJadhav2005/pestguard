-- Self sign-up: new accounts wait for an admin to approve them before they can sign in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signed_up_at TIMESTAMPTZ;
