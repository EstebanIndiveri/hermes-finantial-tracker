-- Recurring Expenses Tables
-- Migration: 0008_recurring_expenses.sql

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES groups(id),
  name TEXT NOT NULL,
  amount_ars REAL NOT NULL,
  category_id TEXT REFERENCES categories(id),
  merchant TEXT,
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK(frequency IN ('monthly', 'weekly', 'yearly')),
  day_of_month INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  auto_confirm INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS recurring_user_idx ON recurring_expenses(user_id);
CREATE INDEX IF NOT EXISTS recurring_active_idx ON recurring_expenses(is_active);

CREATE TABLE IF NOT EXISTS recurring_executions (
  id TEXT PRIMARY KEY,
  recurring_expense_id TEXT NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
  transaction_id TEXT REFERENCES transactions(id),
  scheduled_date TEXT NOT NULL,
  executed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'skipped', 'auto_executed')),
  amount_ars REAL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS execution_recurring_idx ON recurring_executions(recurring_expense_id);
CREATE INDEX IF NOT EXISTS execution_date_idx ON recurring_executions(scheduled_date);
CREATE INDEX IF NOT EXISTS execution_status_idx ON recurring_executions(status);
