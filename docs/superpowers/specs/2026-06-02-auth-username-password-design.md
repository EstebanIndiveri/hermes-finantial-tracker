# Auth: Username + Password Design

**Date:** 2026-06-02  
**Status:** Approved  

---

## Context

Currently users log in with a single personal token (bcrypt-hashed). This creates two problems:
1. Token collision risk: if two users pick the same token, the first one found in DB wins.
2. Poor UX: a single opaque token field is not user-friendly.

## Goal

Replace the token-only login with username + password. Add display name management in Settings and Onboarding.

---

## Schema Changes

**Table: `users`**

Add one new column:
```sql
ALTER TABLE users ADD COLUMN username TEXT;
```
After adding, backfill and apply unique constraint:
```sql
UPDATE users SET username = lower(name);
```
Schema constraint: `username TEXT NOT NULL UNIQUE`

**No other schema changes.** `personal_token_hash` remains as the password hash (bcrypt). Only the UI labels change.

---

## Migration

- File: `0005_username.sql`
- Steps:
  1. `ALTER TABLE users ADD COLUMN username TEXT;`
  2. `UPDATE users SET username = lower(name);`
  3. `CREATE UNIQUE INDEX users_username_idx ON users(username);`
- Applied via Turso CLI (`turso db shell`)

---

## API Changes

### `POST /api/auth/login`

**Before:** `{ token: string }`  
**After:** `{ username: string, password: string }`

Logic:
1. Find user by `username` (single DB lookup, no more full table scan)
2. Bcrypt compare `password` against `personal_token_hash`
3. On match: create session → 200
4. No match: 401

Remove legacy `WEB_ACCESS_TOKEN` env var fallback (owner now has proper username + password via migration).

### `POST /api/auth/register`

**Before:** `{ name, token, invite_token }`  
**After:** `{ name, username, password, invite_token }`

Validation:
- `username`: 3–30 chars, alphanumeric + underscores + hyphens only (`/^[a-z0-9_-]+$/i`)
- `username` must be unique (409 if taken)
- `password`: min 8 chars (same as before, renamed from `token`)
- `name`: 1–50 chars (unchanged)

### `PATCH /api/auth/me`

Extend existing endpoint to also accept `{ name: string }` for updating display name.

Already used for onboarding completion — add `name` update in the same call or as a separate optional field.

### `PATCH /api/auth/me/token` (password change)

No functional changes. UI labels only: "token" → "contraseña" in the frontend.

---

## UI Changes

### `/login` page

- Remove single "Token de acceso" field
- Add two fields: **"Usuario"** + **"Contraseña"**
- Input `font-size: 16px` on both (prevents iOS zoom — already fixed for token field)
- Error message: "Usuario o contraseña incorrectos" (don't specify which to avoid enumeration)

### `/join/[token]` — Register flow (JoinClient)

- Add **"Nombre de usuario"** field between "Nombre" and "Contraseña"
- Show hint: "Solo letras, números, guiones y guiones bajos"
- Auto-suggest username from name as user types (lowercase, replace spaces with `_`)

### `/settings` → Mi cuenta

- Rename "Cambiar token" → **"Cambiar contraseña"**
- Add new option: **"Cambiar nombre"** — single input, PATCH `/api/auth/me` with `{ name }`
- Inline success/error feedback on both

### `/onboarding` — Step 1 (Bienvenida)

- Add editable display name field pre-filled with current `name`
- On wizard completion, PATCH `/api/auth/me` with `{ name, onboarding_completed_at: Date.now() }`
- If user skips step, `name` stays as registered

---

## Error Handling

| Case | HTTP | Message |
|------|------|---------|
| Username not found | 401 | "Usuario o contraseña incorrectos" |
| Wrong password | 401 | "Usuario o contraseña incorrectos" |
| Username taken (register) | 409 | "Ese nombre de usuario ya está en uso" |
| Invalid username format | 400 | "El usuario solo puede contener letras, números, - y _" |
| Password too short | 400 | "La contraseña debe tener al menos 8 caracteres" |

---

## Testing

Each changed endpoint gets full TDD coverage:
- `POST /api/auth/login`: login by username+password, wrong username, wrong password, rate limit still applies
- `POST /api/auth/register`: valid registration, duplicate username (409), invalid username format, short password
- `PATCH /api/auth/me`: update name (authenticated), update name (unauthenticated → 401)

---

## Migration Path for Existing User

The single existing user gets `username = lower(name)` automatically via the migration UPDATE. No manual action needed. On next login, they use their new username (lowercase name) + existing password (unchanged).

---

## Out of Scope

- Password recovery / forgot password flow
- Email field
- OAuth / social login
- Username change after registration (not needed yet)
