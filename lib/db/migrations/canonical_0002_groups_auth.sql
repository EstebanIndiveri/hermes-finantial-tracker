-- H04c canonical replacement for the overlapping historical 0001_violet and
-- 0002-0005 files. This file is for fresh installations through manifest.json;
-- it is not an adoption script for an existing database.

CREATE TABLE groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  partner_id TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE group_members (
  group_id  TEXT NOT NULL REFERENCES groups(id),
  user_id   TEXT NOT NULL REFERENCES users(id),
  role      TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
  joined_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE UNIQUE INDEX gm_group_user_idx
  ON group_members(group_id, user_id);
CREATE INDEX gm_user_id_idx ON group_members(user_id);

CREATE TABLE group_invitations (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL REFERENCES groups(id),
  token      TEXT NOT NULL,
  role       TEXT NOT NULL CHECK(role IN ('admin', 'member')),
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  used_by    TEXT REFERENCES users(id)
);

CREATE UNIQUE INDEX gi_token_idx ON group_invitations(token);
CREATE INDEX gi_group_id_idx ON group_invitations(group_id);

CREATE TABLE telegram_link_codes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE budgets ADD COLUMN group_id TEXT REFERENCES groups(id);
DROP INDEX budgets_user_month_cat_idx;
CREATE UNIQUE INDEX budgets_group_month_cat_idx
  ON budgets(group_id, month, category_id);
CREATE INDEX budgets_group_id_idx ON budgets(group_id);

ALTER TABLE categories ADD COLUMN group_id TEXT REFERENCES groups(id);
ALTER TABLE categories ADD COLUMN default_hard_limit INTEGER NOT NULL DEFAULT 1;
DROP INDEX categories_slug_unique;
CREATE UNIQUE INDEX categories_slug_group_idx ON categories(slug, group_id);

ALTER TABLE monthly_settings ADD COLUMN group_id TEXT REFERENCES groups(id);
DROP INDEX ms_user_month_idx;
CREATE UNIQUE INDEX ms_group_month_idx ON monthly_settings(group_id, month);

ALTER TABLE transactions ADD COLUMN group_id TEXT REFERENCES groups(id);
CREATE INDEX tx_group_id_idx ON transactions(group_id);

ALTER TABLE users ADD COLUMN username TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN personal_token_hash TEXT;
ALTER TABLE users ADD COLUMN active_telegram_group_id TEXT REFERENCES groups(id);
ALTER TABLE users ADD COLUMN onboarding_completed_at INTEGER;
