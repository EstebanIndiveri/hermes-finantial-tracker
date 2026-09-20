-- H04c reconciliation for schema changes that historically had no versioned
-- SQL migration. This file is only part of the fresh-install canonical chain.

ALTER TABLE transactions
  ADD COLUMN requires_reimbursement INTEGER DEFAULT 0;

CREATE TABLE user_payment_info (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  payment_method TEXT NOT NULL,
  value          TEXT,
  is_default     INTEGER DEFAULT 0,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE reimbursement_requests (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  requester_id   TEXT NOT NULL REFERENCES users(id),
  payer_id       TEXT REFERENCES users(id),
  amount         REAL NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  paid_at        TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE push_subscriptions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  endpoint   TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key   TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
