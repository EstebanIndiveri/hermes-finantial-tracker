-- ACT-05 foundation: persist month and transaction currency semantics.
-- Existing months and transactions retain the current USD/ARS split. Historical
-- FX rates are intentionally not reconstructed: the operation snapshot remains
-- NULL for existing rows because the original rate at write time is unknown.

ALTER TABLE monthly_settings ADD COLUMN currency_mode TEXT NOT NULL DEFAULT 'USD_ARS'
  CHECK (currency_mode IN ('USD_ARS', 'ARS_ARS'));
ALTER TABLE monthly_settings ADD COLUMN income_ars REAL;
ALTER TABLE monthly_settings ADD COLUMN saving_goal_ars REAL;
ALTER TABLE monthly_settings ADD COLUMN saving_goal_yellow_ars REAL;

-- ARS-only months must not carry invented USD configuration or an implicit FX
-- rate of 1. Preserve every existing mixed-mode value while relaxing only the
-- nullability of these legacy columns.
ALTER TABLE monthly_settings ADD COLUMN income_usd_nullable_tmp REAL;
UPDATE monthly_settings SET income_usd_nullable_tmp = income_usd;
ALTER TABLE monthly_settings DROP COLUMN income_usd;
ALTER TABLE monthly_settings RENAME COLUMN income_usd_nullable_tmp TO income_usd;
ALTER TABLE monthly_settings ADD COLUMN saving_goal_usd_nullable_tmp REAL;
UPDATE monthly_settings SET saving_goal_usd_nullable_tmp = saving_goal_usd;
ALTER TABLE monthly_settings DROP COLUMN saving_goal_usd;
ALTER TABLE monthly_settings RENAME COLUMN saving_goal_usd_nullable_tmp TO saving_goal_usd;
ALTER TABLE monthly_settings ADD COLUMN saving_goal_yellow_nullable_tmp REAL;
UPDATE monthly_settings SET saving_goal_yellow_nullable_tmp = saving_goal_yellow;
ALTER TABLE monthly_settings DROP COLUMN saving_goal_yellow;
ALTER TABLE monthly_settings RENAME COLUMN saving_goal_yellow_nullable_tmp TO saving_goal_yellow;
ALTER TABLE monthly_settings ADD COLUMN exchange_rate_nullable_tmp REAL;
UPDATE monthly_settings SET exchange_rate_nullable_tmp = exchange_rate;
ALTER TABLE monthly_settings DROP COLUMN exchange_rate;
ALTER TABLE monthly_settings RENAME COLUMN exchange_rate_nullable_tmp TO exchange_rate;

CREATE TRIGGER monthly_settings_currency_mode_insert
BEFORE INSERT ON monthly_settings
WHEN NOT (
  (NEW.currency_mode = 'USD_ARS' AND NEW.income_usd IS NOT NULL
    AND NEW.saving_goal_usd IS NOT NULL AND NEW.saving_goal_yellow IS NOT NULL
    AND NEW.exchange_rate IS NOT NULL AND NEW.exchange_rate > 0
    AND NEW.income_ars IS NULL AND NEW.saving_goal_ars IS NULL
    AND NEW.saving_goal_yellow_ars IS NULL) OR
  (NEW.currency_mode = 'ARS_ARS' AND NEW.income_ars IS NOT NULL
    AND NEW.saving_goal_ars IS NOT NULL AND NEW.saving_goal_yellow_ars IS NOT NULL
    AND NEW.income_usd IS NULL AND NEW.saving_goal_usd IS NULL
    AND NEW.saving_goal_yellow IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'monthly settings currency mode and amounts are inconsistent');
END;

CREATE TRIGGER monthly_settings_currency_mode_update
BEFORE UPDATE ON monthly_settings
WHEN NOT (
  (NEW.currency_mode = 'USD_ARS' AND NEW.income_usd IS NOT NULL
    AND NEW.saving_goal_usd IS NOT NULL AND NEW.saving_goal_yellow IS NOT NULL
    AND NEW.exchange_rate IS NOT NULL AND NEW.exchange_rate > 0
    AND NEW.income_ars IS NULL AND NEW.saving_goal_ars IS NULL
    AND NEW.saving_goal_yellow_ars IS NULL) OR
  (NEW.currency_mode = 'ARS_ARS' AND NEW.income_ars IS NOT NULL
    AND NEW.saving_goal_ars IS NOT NULL AND NEW.saving_goal_yellow_ars IS NOT NULL
    AND NEW.income_usd IS NULL AND NEW.saving_goal_usd IS NULL
    AND NEW.saving_goal_yellow IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'monthly settings currency mode and amounts are inconsistent');
END;

-- SQLite 3.35+ supports transactional DROP COLUMN. Keep the table identity,
-- incoming foreign keys, and existing indexes in place while replacing only the
-- NOT NULL amount column. Existing USD values are copied verbatim.
ALTER TABLE transactions ADD COLUMN amount_usd_nullable_tmp REAL;
UPDATE transactions SET amount_usd_nullable_tmp = amount_usd;
ALTER TABLE transactions DROP COLUMN amount_usd;
ALTER TABLE transactions RENAME COLUMN amount_usd_nullable_tmp TO amount_usd;

ALTER TABLE transactions ADD COLUMN exchange_rate_snapshot REAL;
ALTER TABLE transactions ADD COLUMN currency_mode TEXT NOT NULL DEFAULT 'USD_ARS'
  CHECK (currency_mode IN ('USD_ARS', 'ARS_ARS'));

-- SQLite CHECK constraints cannot be added to an existing table. Triggers keep
-- the currency invariant enforceable for both inserts and later updates.
CREATE TRIGGER transactions_currency_mode_insert
BEFORE INSERT ON transactions
WHEN NOT (
  (NEW.currency_mode = 'USD_ARS' AND NEW.amount_usd IS NOT NULL) OR
  (NEW.currency_mode = 'ARS_ARS' AND NEW.amount_usd IS NULL AND NEW.exchange_rate_snapshot IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'transactions currency mode and amounts are inconsistent');
END;

CREATE TRIGGER transactions_currency_mode_update
BEFORE UPDATE ON transactions
WHEN NOT (
  (NEW.currency_mode = 'USD_ARS' AND NEW.amount_usd IS NOT NULL) OR
  (NEW.currency_mode = 'ARS_ARS' AND NEW.amount_usd IS NULL AND NEW.exchange_rate_snapshot IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'transactions currency mode and amounts are inconsistent');
END;
