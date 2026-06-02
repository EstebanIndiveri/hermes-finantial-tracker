# Auth Phase 2 — Per-User Token Authentication

**Date:** 2026-06-02  
**Status:** Approved  
**Scope:** Replace shared `WEB_ACCESS_TOKEN` env var with per-user tokens; add Telegram multi-user support with active-group concept and account linking flow.

---

## Problem

The current auth model uses a single shared `WEB_ACCESS_TOKEN` env var. All web users log in with the same token and land on the same user account. With multi-user groups now deployed, invited users cannot create their own identity. The Telegram bot similarly only recognizes one user.

---

## Solution: Token per User (Approach A)

Each user has a `personal_token_hash` (bcrypt) stored in the DB. Login looks up the user whose hash matches the provided token. The existing owner gets a backward-compatible fallback during migration.

---

## 1. Database Changes

### `users` table — two new columns

```sql
ALTER TABLE users ADD COLUMN personal_token_hash TEXT;
ALTER TABLE users ADD COLUMN active_telegram_group_id TEXT REFERENCES groups(id);
```

- `personal_token_hash`: bcrypt hash of the user's chosen token. NULL means "not yet set" (owner legacy state).
- `active_telegram_group_id`: the group the Telegram bot will target for this user's commands. NULL = falls back to personal group.

### New table: `telegram_link_codes`

```sql
CREATE TABLE telegram_link_codes (
  id TEXT PRIMARY KEY,           -- 6-digit numeric code (zero-padded)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,   -- unix ms
  used INTEGER NOT NULL DEFAULT 0
);
```

One active code per user at a time. Generating a new code for the same user replaces the previous one (DELETE old, INSERT new).

### Migration script

`scripts/migrate-auth-phase2.mjs`:
- Adds `personal_token_hash` and `active_telegram_group_id` columns to `users` (idempotent via PRAGMA check).
- Creates `telegram_link_codes` table (IF NOT EXISTS).
- Does NOT modify any existing rows — owner keeps NULL `personal_token_hash` (legacy fallback active).

---

## 2. Schema Updates (`lib/db/schema.ts`)

Add columns to `users` definition:
```ts
personal_token_hash: text("personal_token_hash"),
active_telegram_group_id: text("active_telegram_group_id").references(() => groups.id),
```

Add `telegram_link_codes` table definition with relation to `users`.

---

## 3. Login API (`app/api/auth/login/route.ts`)

**New logic:**

1. Receive `{ token: string }` in body.
2. Fetch all users from DB (small table — single query).
3. For each user with `personal_token_hash`, run `bcrypt.compare(token, hash)`.
4. If a match is found → create session for that `user.id`.
5. If no match found **and** the owner user exists **and** `personal_token_hash` is NULL → compare against `WEB_ACCESS_TOKEN` env var (legacy fallback).
6. If still no match → 401.

**Why bcrypt:** Tokens are user-chosen secrets. Bcrypt protects them at rest.

**Performance note:** With ≤ 10 users, iterating hashes is fast. No optimization needed for MVP.

**Dep to add:** `bcryptjs` (pure JS, works in Edge/Node, no native binaries).

---

## 4. New User Registration During Invite Acceptance

### `app/join/[token]/JoinClient.tsx` — new step

When the GET `/api/join/[token]` returns 401 (not logged in), instead of redirecting to `/login`, show a **"Create your access"** form inline:

**Fields:**
- `name` (text) — display name, pre-filled with `invited_by.name` as hint
- `token` (password) — their personal token
- `token_confirm` (password) — confirmation

**On submit:**
1. POST `/api/auth/register` with `{ name, token, invite_token }`.
2. API creates the user, hashes the token, auto-logs them in (sets cookie).
3. Then auto-accepts the invitation (POST `/api/join/[token]`).
4. Redirect to `/dashboard`.

### `app/api/auth/register/route.ts` — new endpoint (public)

```
POST /api/auth/register
Body: { name: string, token: string, invite_token: string }
```

Steps:
1. Validate `invite_token` is valid (not expired, not used) — reuse join validation.
2. Validate `name` (1–50 chars), `token` (min 8 chars).
3. Hash token with bcrypt (rounds: 10).
4. Insert user into `users` with `id = nanoid()`, `name`, `personal_token_hash`.
5. Sign session cookie for the new user.
6. Return `{ user_id, group_id }` (the group they're joining) so client can proceed.

**Note:** The invite itself is NOT accepted in this endpoint — only the user is created. The client then calls POST `/api/join/[token]` (now with a valid session) to accept.

---

## 5. Owner Token Setup (Settings)

### `app/dashboard/settings/page.tsx` — new "Mi cuenta" section

Added at the top of the settings page:

- Shows current user's name
- If `personal_token_hash` is NULL: **yellow banner** "Configurá tu token personal para el nuevo sistema de auth"
- Form: "Token actual" (enter current env var token to verify), "Nuevo token" (password), "Confirmar nuevo token"
- Submit → PATCH `/api/auth/me/token`

### `app/api/auth/me/token/route.ts` — new endpoint (authenticated)

```
PATCH /api/auth/me/token
Body: { current_token: string, new_token: string }
```

Steps:
1. Verify session → get `user_id`.
2. Verify `current_token`:
   - If user has `personal_token_hash` → bcrypt compare.
   - If NULL → compare against `WEB_ACCESS_TOKEN` env var.
3. Hash `new_token` with bcrypt.
4. UPDATE `users SET personal_token_hash = hash WHERE id = user_id`.
5. Return `{ ok: true }`.

---

## 6. Telegram Account Linking

### Web: generate linking code

New section in `/dashboard/settings` ("Conectar Telegram"):
- Button "Generar código" → POST `/api/auth/telegram/link-code`
- Shows: `Enviá /vincular XXXXXX al bot @tu_bot`
- Code is 6 digits, valid 24h
- Generating a new code invalidates the previous one

### `app/api/auth/telegram/link-code/route.ts`

```
POST /api/auth/telegram/link-code
```

Generates a random 6-digit code, deletes any existing code for this user, inserts new row in `telegram_link_codes`. Returns `{ code, expires_at }`.

### Bot: `/vincular` command

In `app/api/telegram/webhook/route.ts` (or the NLP handler):

```
/vincular XXXXXX
```

1. Look up code in `telegram_link_codes` where `id = code AND used = 0 AND expires_at > now`.
2. If not found/expired → "Código inválido o expirado. Generá uno nuevo en [web]."
3. If found → UPDATE `users SET telegram_user_id = chat.id WHERE id = link.user_id`.
4. Mark code as used.
5. Reply "✅ Cuenta vinculada correctamente. Podés empezar a usar el bot."

---

## 7. Telegram Multi-User

### Per-command user resolution

Every Telegram command handler:
1. Extract `telegram_user_id` from incoming message.
2. `db.query.users.findFirst({ where: eq(users.telegram_user_id, telegramUserId) })`.
3. If not found → reply "Para usar el bot, vinculá tu cuenta en [web_url]/dashboard/settings"
4. Get `active_telegram_group_id` (or fallback to `getPersonalGroup(user.id)`).
5. Proceed with command using that `group_id`.

### New command: `/grupo`

- `/grupo` → shows active group name
- `/grupo Hogar` → finds a group by name among user's groups, sets `active_telegram_group_id`
- Uses existing `getUserGroups(userId)` from `lib/groups/permissions.ts`

### Changes to existing bot commands

All existing handlers that use `userId` to scope data now also need `groupId` from `active_telegram_group_id`. This means passing `group_id` to all transaction/budget queries in the webhook handler.

---

## 8. Error Handling & Edge Cases

| Case | Behavior |
|------|----------|
| Token too short (< 8 chars) | 400 "El token debe tener al menos 8 caracteres" |
| Token confirm mismatch | 400 "Los tokens no coinciden" |
| Name already taken (exact match) | Allow — names are not unique identifiers |
| User tries to re-register with same invite token | Invite token is marked used after acceptance, so 410 |
| Telegram user already linked to another account | "Ya tenés una cuenta vinculada. Desvinculá desde la web primero" |
| Owner has legacy NULL token_hash and no WEB_ACCESS_TOKEN env var | 500 (configuration error, logged server-side) |
| Link code expired | 410 response with message to regenerate |

---

## 9. Testing

- `app/api/auth/register/__tests__/route.test.ts` — happy path, duplicate user, short token, invalid invite
- `app/api/auth/me/token/__tests__/route.test.ts` — change token (legacy and normal), wrong current token
- `app/api/auth/telegram/__tests__/link-code.test.ts` — code generation, expiry, replacement
- Update `app/api/auth/login/__tests__/route.test.ts` — add per-user lookup tests
- Telegram webhook: add tests for `/vincular` and `/grupo` commands, unknown Telegram user

---

## 10. Implementation Tasks (for writing-plans)

1. **Schema + migration** — add columns to `users`, create `telegram_link_codes`, write migration script
2. **Login API update** — bcrypt lookup with legacy fallback
3. **Register API** — new `POST /api/auth/register` endpoint
4. **Join flow update** — show create-account form when unauthenticated
5. **Owner token settings** — new section + `PATCH /api/auth/me/token`
6. **Telegram link code** — `POST /api/auth/telegram/link-code` + settings UI
7. **Bot: /vincular command** — link account handler
8. **Bot: multi-user resolution** — per-command user lookup + group_id injection
9. **Bot: /grupo command** — get/set active telegram group
10. **Deploy** — run migration in prod, smoke test

---

## Dependencies to Add

- `bcryptjs` — password hashing (pure JS, Edge-compatible)
- `@types/bcryptjs` — TypeScript types
