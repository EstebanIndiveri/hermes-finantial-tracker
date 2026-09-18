-- H04a: additive Telegram update receipt and processing lease.
-- Apply before enabling TELEGRAM_INBOX_ENABLED. Do not drop on code rollback.
CREATE TABLE IF NOT EXISTS telegram_update_inbox (
  id               TEXT PRIMARY KEY,
  bot_id           TEXT NOT NULL,
  update_id        TEXT NOT NULL,
  update_kind      TEXT NOT NULL,
  status           TEXT NOT NULL CHECK(status IN ('processing', 'completed', 'retryable')),
  attempt_count    INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  lease_token      TEXT,
  lease_expires_at INTEGER,
  last_error_code  TEXT,
  received_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  completed_at     INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_update_inbox_bot_update_idx
  ON telegram_update_inbox(bot_id, update_id);

CREATE INDEX IF NOT EXISTS telegram_update_inbox_claim_idx
  ON telegram_update_inbox(status, lease_expires_at);
