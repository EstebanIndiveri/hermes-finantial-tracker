-- ACT-05 foundation: persist month and transaction currency semantics.
-- Existing months and transactions retain the current USD/ARS split. Historical
-- FX rates are intentionally not reconstructed: the operation snapshot remains
-- NULL for existing rows because the original rate at write time is unknown.

ALTER TABLE monthly_settings ADD COLUMN currency_mode TEXT NOT NULL DEFAULT 'USD_ARS'
  CHECK (currency_mode IN ('USD_ARS', 'ARS_ARS'));
ALTER TABLE monthly_settings ADD COLUMN income_ars REAL;
ALTER TABLE monthly_settings ADD COLUMN saving_goal_ars REAL;
ALTER TABLE monthly_settings ADD COLUMN saving_goal_yellow_ars REAL;

-- amount_usd must be nullable to represent ARS-only transactions without a
-- fabricated conversion. SQLite requires a table rebuild to change nullability.
-- The runner disables FK enforcement before opening this migration's transaction
-- and reenables it after commit/rollback. Keep incoming references pointing to
-- the stable `transactions` table name throughout the replacement.
CREATE TABLE transactions_currency_modes (
  id TEXT PRIMARY KEY NOT NULL,
  operation_id TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  group_id TEXT REFERENCES groups(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  category_id TEXT NOT NULL REFERENCES categories(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  amount_ars REAL NOT NULL,
  amount_usd REAL,
  exchange_rate_snapshot REAL,
  currency_mode TEXT NOT NULL DEFAULT 'USD_ARS'
    CHECK (currency_mode IN ('USD_ARS', 'ARS_ARS')),
  merchant TEXT,
  description TEXT,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'web',
  status TEXT NOT NULL DEFAULT 'active',
  requires_reimbursement INTEGER DEFAULT 0,
  is_exception INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  CHECK (
    (currency_mode = 'USD_ARS' AND amount_usd IS NOT NULL) OR
    (currency_mode = 'ARS_ARS' AND amount_usd IS NULL AND exchange_rate_snapshot IS NULL)
  )
);

INSERT INTO transactions_currency_modes (
  id, operation_id, user_id, group_id, category_id, amount_ars, amount_usd,
  merchant, description, date, month, source, status, requires_reimbursement,
  is_exception, deleted_at, created_at
)
SELECT
  id, operation_id, user_id, group_id, category_id, amount_ars, amount_usd,
  merchant, description, date, month, source, status, requires_reimbursement,
  is_exception, deleted_at, created_at
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_currency_modes RENAME TO transactions;

CREATE INDEX tx_user_month_idx ON transactions(user_id, month);
CREATE INDEX tx_category_idx ON transactions(category_id);
CREATE INDEX tx_group_id_idx ON transactions(group_id);
CREATE UNIQUE INDEX transactions_operation_id_idx ON transactions(operation_id)
  WHERE operation_id IS NOT NULL;
