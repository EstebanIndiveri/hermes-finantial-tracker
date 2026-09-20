-- H04b: stable Telegram operation identities and durable Telegram delivery rows.
-- This migration is additive. Legacy rows keep a NULL operation_id and are not
-- backfilled or reinterpreted.

ALTER TABLE transactions ADD COLUMN operation_id TEXT;
ALTER TABLE splits ADD COLUMN operation_id TEXT;
ALTER TABLE split_payments ADD COLUMN operation_id TEXT;
ALTER TABLE reimbursement_requests ADD COLUMN operation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_operation_id_idx
  ON transactions(operation_id)
  WHERE operation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS splits_operation_id_idx
  ON splits(operation_id)
  WHERE operation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS split_payments_operation_id_idx
  ON split_payments(operation_id)
  WHERE operation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reimbursement_requests_operation_id_idx
  ON reimbursement_requests(operation_id)
  WHERE operation_id IS NOT NULL;

-- Must be preceded by a staging duplicate preflight. This turns recurring
-- generation from read-then-insert into a database-enforced invariant.
CREATE UNIQUE INDEX IF NOT EXISTS execution_recurring_date_idx
  ON recurring_executions(recurring_expense_id, scheduled_date);

CREATE TABLE IF NOT EXISTS telegram_operations (
  operation_id  TEXT PRIMARY KEY,
  bot_id        TEXT NOT NULL,
  update_id     TEXT NOT NULL,
  operation_kind TEXT NOT NULL,
  status        TEXT NOT NULL CHECK(status IN ('started', 'committed', 'rejected')),
  resource_type TEXT,
  resource_id   TEXT,
  result_json   TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  committed_at  INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_operations_update_kind_idx
  ON telegram_operations(bot_id, update_id, operation_kind);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_operations_namespace_idx
  ON telegram_operations(operation_id, bot_id, update_id);

CREATE TABLE IF NOT EXISTS telegram_delivery_outbox (
  id                TEXT PRIMARY KEY,
  bot_id            TEXT NOT NULL,
  update_id         TEXT NOT NULL,
  operation_id      TEXT NOT NULL,
  delivery_key      TEXT NOT NULL,
  action            TEXT NOT NULL CHECK(action IN ('send_message', 'edit_message')),
  chat_id           TEXT NOT NULL,
  message_id        INTEGER,
  parse_mode        TEXT NOT NULL DEFAULT 'HTML',
  text              TEXT NOT NULL,
  reply_markup_json  TEXT,
  status            TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'retryable', 'sent', 'dead')),
  attempt_count     INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  next_attempt_at   INTEGER NOT NULL,
  lease_token       TEXT,
  lease_expires_at  INTEGER,
  provider_message_id TEXT,
  last_error_code   TEXT,
  last_http_status  INTEGER,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  sent_at           INTEGER,
  retention_until   INTEGER,
  CONSTRAINT telegram_delivery_outbox_operation_namespace_fk
    FOREIGN KEY(operation_id, bot_id, update_id)
    REFERENCES telegram_operations(operation_id, bot_id, update_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_delivery_outbox_delivery_key_idx
  ON telegram_delivery_outbox(bot_id, delivery_key);

CREATE INDEX IF NOT EXISTS telegram_delivery_outbox_claim_idx
  ON telegram_delivery_outbox(status, next_attempt_at, lease_expires_at);

CREATE INDEX IF NOT EXISTS telegram_delivery_outbox_update_idx
  ON telegram_delivery_outbox(bot_id, update_id);

CREATE INDEX IF NOT EXISTS telegram_delivery_outbox_operation_idx
  ON telegram_delivery_outbox(operation_id);
