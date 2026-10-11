-- Durable Web Push delivery intent. This table stores references and delivery
-- metadata only; the worker resolves the current subscription before sending.
CREATE TABLE push_delivery_outbox (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  delivery_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('reimbursement.requested', 'reimbursement.paid')),
  reimbursement_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'retryable', 'sent', 'dead')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_expires_at INTEGER,
  last_error_code TEXT,
  last_http_status INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  sent_at INTEGER,
  expires_at INTEGER NOT NULL,
  retention_until INTEGER NOT NULL
);

CREATE INDEX push_delivery_outbox_due_idx
  ON push_delivery_outbox(status, next_attempt_at);

CREATE INDEX push_delivery_outbox_lease_idx
  ON push_delivery_outbox(status, lease_expires_at);

CREATE INDEX push_delivery_outbox_retention_idx
  ON push_delivery_outbox(retention_until);
