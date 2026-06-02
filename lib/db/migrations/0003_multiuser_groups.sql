-- Tabla de grupos
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Tabla de membresías
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
  joined_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (group_id, user_id)
);

-- Tabla de invitaciones
CREATE TABLE IF NOT EXISTS group_invitations (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by TEXT REFERENCES users(id)
);

-- Agregar group_id a tablas existentes
ALTER TABLE transactions ADD COLUMN group_id TEXT REFERENCES groups(id);
ALTER TABLE budgets ADD COLUMN group_id TEXT REFERENCES groups(id);
ALTER TABLE monthly_settings ADD COLUMN group_id TEXT REFERENCES groups(id);
ALTER TABLE categories ADD COLUMN group_id TEXT REFERENCES groups(id);

-- Actualizar índices únicos para usar group_id en lugar de user_id
-- DROP INDEX IF EXISTS budgets_user_month_cat_idx;
-- CREATE UNIQUE INDEX budgets_group_month_cat_idx ON budgets(group_id, month, category_id) WHERE group_id IS NOT NULL;
-- DROP INDEX IF EXISTS ms_user_month_idx;
-- CREATE UNIQUE INDEX ms_group_month_idx ON monthly_settings(group_id, month) WHERE group_id IS NOT NULL;
