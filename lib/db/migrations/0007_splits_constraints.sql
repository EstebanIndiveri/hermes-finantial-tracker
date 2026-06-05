-- SQLite: recreate tables that need CHECK constraints
-- We use the "rename → create → copy → drop" pattern

-- 1. split_session_members: add uniqueness and identity check
CREATE TABLE split_session_members_new (
  session_id    TEXT NOT NULL REFERENCES split_sessions(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id),
  temp_user_id  TEXT REFERENCES temp_users(id),
  joined_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  CHECK ((user_id IS NULL) != (temp_user_id IS NULL)),
  UNIQUE (session_id, user_id),
  UNIQUE (session_id, temp_user_id)
);
INSERT INTO split_session_members_new SELECT * FROM split_session_members;
DROP TABLE split_session_members;
ALTER TABLE split_session_members_new RENAME TO split_session_members;
CREATE INDEX ssm_session_idx ON split_session_members(session_id);
CREATE INDEX ssm_user_idx ON split_session_members(user_id);
CREATE INDEX ssm_temp_user_idx ON split_session_members(temp_user_id);

-- 2. splits: add identity check for creator
CREATE TABLE splits_new (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES split_sessions(id) ON DELETE CASCADE,
  description           TEXT NOT NULL,
  total_amount          REAL NOT NULL,
  split_type            TEXT NOT NULL DEFAULT 'equal',
  status                TEXT NOT NULL DEFAULT 'active',
  created_by_user_id    TEXT REFERENCES users(id),
  created_by_temp_id    TEXT REFERENCES temp_users(id),
  created_at            INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  cancelled_at          INTEGER,
  telegram_message_id   TEXT,
  CHECK ((created_by_user_id IS NULL) != (created_by_temp_id IS NULL))
);
INSERT INTO splits_new SELECT * FROM splits;
DROP TABLE splits;
ALTER TABLE splits_new RENAME TO splits;
CREATE INDEX splits_session_idx ON splits(session_id);

-- 3. split_payers: add identity check
CREATE TABLE split_payers_new (
  id           TEXT PRIMARY KEY,
  split_id     TEXT NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES users(id),
  temp_user_id TEXT REFERENCES temp_users(id),
  amount_paid  REAL NOT NULL,
  CHECK ((user_id IS NULL) != (temp_user_id IS NULL))
);
INSERT INTO split_payers_new SELECT * FROM split_payers;
DROP TABLE split_payers;
ALTER TABLE split_payers_new RENAME TO split_payers;
CREATE INDEX sp_split_idx ON split_payers(split_id);

-- 4. split_items: add identity check
CREATE TABLE split_items_new (
  id           TEXT PRIMARY KEY,
  split_id     TEXT NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES users(id),
  temp_user_id TEXT REFERENCES temp_users(id),
  amount_owed  REAL NOT NULL,
  percentage   REAL,
  CHECK ((user_id IS NULL) != (temp_user_id IS NULL))
);
INSERT INTO split_items_new SELECT * FROM split_items;
DROP TABLE split_items;
ALTER TABLE split_items_new RENAME TO split_items;
CREATE INDEX si_split_idx ON split_items(split_id);

-- 5. split_payments: fix confirmed_at to nullable, add identity and self-payment checks
CREATE TABLE split_payments_new (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES split_sessions(id) ON DELETE CASCADE,
  payer_user_id       TEXT REFERENCES users(id),
  payer_temp_id       TEXT REFERENCES temp_users(id),
  payee_user_id       TEXT REFERENCES users(id),
  payee_temp_id       TEXT REFERENCES temp_users(id),
  amount              REAL NOT NULL,
  method              TEXT NOT NULL DEFAULT 'manual',
  receipt_image_url   TEXT,
  ocr_raw_text        TEXT,
  confirmed_at        INTEGER,
  telegram_update_id  TEXT,
  CHECK ((payer_user_id IS NULL) != (payer_temp_id IS NULL)),
  CHECK ((payee_user_id IS NULL) != (payee_temp_id IS NULL)),
  CHECK (payer_user_id IS NULL OR payee_user_id IS NULL OR payer_user_id != payee_user_id)
);
INSERT INTO split_payments_new SELECT * FROM split_payments;
DROP TABLE split_payments;
ALTER TABLE split_payments_new RENAME TO split_payments;
CREATE INDEX spm_session_idx ON split_payments(session_id);
