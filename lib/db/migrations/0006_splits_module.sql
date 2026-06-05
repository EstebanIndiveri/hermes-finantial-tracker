-- Usuarios externos identificados solo por Telegram (sin cuenta Hermes completa)
CREATE TABLE temp_users (
  id                TEXT PRIMARY KEY,
  telegram_user_id  TEXT NOT NULL UNIQUE,
  telegram_username TEXT,
  first_name        TEXT NOT NULL,
  last_name         TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  upgraded_to       TEXT REFERENCES users(id)
);

-- Estado conversacional del bot en grupos (TTL de 5 minutos)
CREATE TABLE bot_conversation_state (
  chat_id     TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  state       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);

-- Sesión de gastos compartidos (un evento: cena, viaje, hogar mes)
CREATE TABLE split_sessions (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  owner_user_id    TEXT NOT NULL REFERENCES users(id),
  telegram_chat_id TEXT UNIQUE,
  status           TEXT NOT NULL DEFAULT 'open',
  last_alert_at    INTEGER,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  closed_at        INTEGER,
  closing_note     TEXT
);

-- Miembros de una sesión (Hermes users o temp_users)
CREATE TABLE split_session_members (
  session_id    TEXT NOT NULL REFERENCES split_sessions(id),
  user_id       TEXT REFERENCES users(id),
  temp_user_id  TEXT REFERENCES temp_users(id),
  joined_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX ssm_session_idx ON split_session_members(session_id);

-- Gasto compartido dentro de una sesión
CREATE TABLE splits (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES split_sessions(id),
  description           TEXT NOT NULL,
  total_amount          REAL NOT NULL,
  split_type            TEXT NOT NULL DEFAULT 'equal',
  status                TEXT NOT NULL DEFAULT 'active',
  created_by_user_id    TEXT REFERENCES users(id),
  created_by_temp_id    TEXT REFERENCES temp_users(id),
  created_at            INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  cancelled_at          INTEGER,
  telegram_message_id   TEXT
);
CREATE INDEX splits_session_idx ON splits(session_id);

-- Quién pagó el gasto físicamente (uno o varios con distintos montos)
CREATE TABLE split_payers (
  id           TEXT PRIMARY KEY,
  split_id     TEXT NOT NULL REFERENCES splits(id),
  user_id      TEXT REFERENCES users(id),
  temp_user_id TEXT REFERENCES temp_users(id),
  amount_paid  REAL NOT NULL
);
CREATE INDEX sp_split_idx ON split_payers(split_id);

-- Distribución del gasto: cuánto le corresponde a cada participante
CREATE TABLE split_items (
  id           TEXT PRIMARY KEY,
  split_id     TEXT NOT NULL REFERENCES splits(id),
  user_id      TEXT REFERENCES users(id),
  temp_user_id TEXT REFERENCES temp_users(id),
  amount_owed  REAL NOT NULL,
  percentage   REAL
);
CREATE INDEX si_split_idx ON split_items(split_id);

-- Registro de pagos de deuda (manual o via comprobante OCR)
CREATE TABLE split_payments (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES split_sessions(id),
  payer_user_id       TEXT REFERENCES users(id),
  payer_temp_id       TEXT REFERENCES temp_users(id),
  payee_user_id       TEXT REFERENCES users(id),
  payee_temp_id       TEXT REFERENCES temp_users(id),
  amount              REAL NOT NULL,
  method              TEXT NOT NULL DEFAULT 'manual',
  receipt_image_url   TEXT,
  ocr_raw_text        TEXT,
  confirmed_at        INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  telegram_update_id  TEXT
);
CREATE INDEX spm_session_idx ON split_payments(session_id);
