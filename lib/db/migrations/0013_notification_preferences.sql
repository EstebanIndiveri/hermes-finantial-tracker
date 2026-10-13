-- User-owned, opt-in consent for proactive Telegram notices. No backfill:
-- absence of a row means every notice is disabled.
CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_summary INTEGER NOT NULL DEFAULT 0,
  recurring INTEGER NOT NULL DEFAULT 0,
  reimbursements INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  CONSTRAINT notification_preferences_daily_summary_check CHECK (daily_summary IN (0, 1)),
  CONSTRAINT notification_preferences_recurring_check CHECK (recurring IN (0, 1)),
  CONSTRAINT notification_preferences_reimbursements_check CHECK (reimbursements IN (0, 1))
);
