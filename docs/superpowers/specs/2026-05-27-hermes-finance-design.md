# Hermes Finance — Design Spec
**Date:** 2026-05-27  
**Status:** Approved (v2 — post-review amendments)  
**Stack:** Next.js (latest stable) App Router · TypeScript · Tailwind CSS · shadcn/ui · Turso · Drizzle ORM · Telegram Bot Webhook · Groq API (optional) · Vercel

---

## 1. Product Overview

Hermes Finance is a personal financial assistant MVP for tracking monthly expenses, monitoring category budgets, and receiving alerts via Telegram and a responsive web dashboard.

**Core principle:** AI interprets messages → backend validates → DB records → financial rules calculate state, limits, and alerts.

**Single user:** Personal tool. One seeded user. Auth via middleware token (no multi-tenancy in MVP).

**No month is hardcoded.** Seed data uses May 2026 as a demo/example only. All logic operates on the dynamically computed active month.

---

## 2. Architecture

### 2.1 Folder Structure

```
app/
  (auth)/
    login/
      page.tsx                    ← password form (WEB_ACCESS_TOKEN)
    logout/
      route.ts                    ← POST: clears hermes_session cookie, redirects /login
  (app)/
    dashboard/
      page.tsx                    ← main monthly dashboard
    transactions/
      page.tsx                    ← full transaction list + filters
    settings/
      page.tsx                    ← monthly config: income, thresholds, budgets, exchange rate
  api/
    telegram/
      webhook/
        route.ts                  ← POST handler, validates secret token
    transactions/
      route.ts                    ← GET (list) / POST (create)
    settings/
      thresholds/
        route.ts                  ← PATCH: saving_goal_usd, saving_goal_yellow
      budgets/
        route.ts                  ← PATCH: budget_ars per category per month
      monthly/
        route.ts                  ← PATCH: income_usd, exchange_rate (manual)
    exchange-rate/
      route.ts                    ← POST: fetch from Ripio, save to monthly_settings
    cron/
      update-exchange-rate/
        route.ts                  ← GET: called by Vercel Cron monthly
  middleware.ts                   ← signed session cookie check for (app)/* routes

lib/
  db/
    client.ts                     ← Turso/Drizzle client singleton
    schema.ts                     ← all table definitions
    seed.ts                       ← initial user + categories + demo month data
    migrations/                   ← drizzle-kit generated
  finance/
    rules.ts                      ← calculateMonthStatus, calculateCategoryStatus
    summaries.ts                  ← getMonthSummary, getCategoryBreakdown
    formatters.ts                 ← formatARS, formatUSD, formatPercent
  telegram/
    send-message.ts               ← sendTelegramMessage(chatId, text)
    handlers.ts                   ← command router
    formatters.ts                 ← formatSummaryMessage, formatGastoResponse
  ai/
    groq.ts                       ← Groq client, guarded by GROQ_API_KEY check
    parse-message.ts              ← parseFinancialMessage(text): FinancialIntent | null
  exchange/
    ripio.ts                      ← fetchRipioRate(): Promise<number>
  utils/
    dates.ts                      ← getArgentinaDate(), getActiveMonthArgentina()
    session.ts                    ← signSession(), verifySession()

components/
  dashboard/
    StatusBanner.tsx
    CategoryList.tsx
    DonutChart.tsx
    BarChart.tsx
    MonthNav.tsx
    ClosedCategoryModal.tsx       ← modal for CLOSED or hard_limit blocked category
    ExceptionConfirmModal.tsx     ← modal to confirm registering an exception expense
  forms/
    ExpenseForm.tsx
    BudgetForm.tsx
    ThresholdForm.tsx
  ui/                             ← shadcn/ui components
```

### 2.2 Auth Flow

- `middleware.ts` protects all routes under `(app)/*` and `/api/*` except `/api/telegram/webhook` and `/api/cron/*`
- On login: password compared against `WEB_ACCESS_TOKEN` env var → **never stored in cookie**
- Cookie value = **HMAC-SHA256 signed token**: `sign(userId + timestamp, SESSION_SECRET)` — opaque, not reversible
- `lib/utils/session.ts` exposes `signSession(userId)` and `verifySession(cookie)` using Node.js `crypto.createHmac`
- Cookie: `hermes_session`, httpOnly, sameSite=strict, secure=true in production, maxAge=7 days
- `POST /auth/logout` clears the cookie and redirects to `/login`
- Telegram webhook validated via `X-Telegram-Bot-Api-Secret-Token` header (independent of web auth)

### 2.3 Argentina Date Helpers (`lib/utils/dates.ts`)

```typescript
// Returns current date in Argentina timezone (UTC-3)
function getArgentinaDate(): Date

// Returns active month string "YYYY-MM" based on Argentina local time
function getActiveMonthArgentina(): string

// Returns { start: "YYYY-MM-01", end: "YYYY-MM-DD" } for a given month string
function getMonthDateRange(month: string): { start: string; end: string }
```

All date comparisons for "active month" use these helpers. No `new Date()` calls directly in business logic.

---

## 3. Database Schema

```typescript
// users
id: text (uuid, pk)
name: text
telegram_user_id: text (unique, nullable)
created_at: integer (timestamp ms)

// monthly_settings
id: text (uuid, pk)
user_id: text (fk → users.id)
month: text                               ← "YYYY-MM", unique per user
income_usd: real
exchange_rate: real                       ← sell_rate from Ripio USDT_ARS
exchange_rate_source: text                ← "ripio" | "manual"
exchange_rate_updated_at: integer (nullable)
saving_goal_usd: real                     ← green threshold
saving_goal_yellow: real                  ← yellow threshold
created_at: integer
UNIQUE(user_id, month)

// categories
id: text (uuid, pk)
slug: text (unique)
name: text
emoji: text
is_active: integer (0|1)
sort_order: integer

// budgets
id: text (uuid, pk)
user_id: text (fk → users.id)
month: text                               ← "YYYY-MM"
category_id: text (fk → categories.id)
budget_ars: real                          ← 0 = unlimited
hard_limit: integer (0|1, default 1)      ← 1=block totally, 0=allow exception with confirmation
created_at: integer
UNIQUE(user_id, month, category_id)

// transactions
id: text (uuid, pk)
user_id: text (fk → users.id)
category_id: text (fk → categories.id)
amount_ars: real
amount_usd: real                          ← computed at insert: amount_ars / exchange_rate
merchant: text (nullable, max 100)
description: text (nullable, max 200)
date: text                                ← "YYYY-MM-DD"
month: text                               ← "YYYY-MM", denormalized
source: text                              ← "web" | "telegram" | "import"
status: text (default "active")           ← "active" | "deleted"
is_exception: integer (0|1, default 0)    ← 1 if registered beyond budget with explicit confirmation
deleted_at: integer (nullable)
created_at: integer

// bot_messages
id: text (uuid, pk)
user_id: text (fk → users.id)
telegram_chat_id: text
telegram_user_id: text
telegram_update_id: text (unique, nullable) ← prevents duplicate processing
raw_text: text
parsed_intent: text (nullable)            ← JSON string of FinancialIntent
response_text: text
created_at: integer
```

**Key constraints:**
- `amount_usd` persisted at insert time — immune to later rate changes
- `month` denormalized in `transactions` for query performance
- `budget_ars = 0` means unlimited — but those expenses **do count** toward total spend and savings projection
- All summary queries filter `transactions.status = 'active'`
- `telegram_update_id` uniqueness prevents duplicate Telegram message processing

---

## 4. Financial Rules (`lib/finance/rules.ts`)

Nothing hardcoded — all values from `monthly_settings` and `budgets`.

### 4.1 Month Status (Semáforo)

```
total_gastado_usd = SUM(amount_usd) WHERE month = activeMonth AND status = 'active'
ahorro_proyectado_usd = income_usd - total_gastado_usd

GREEN  if ahorro_proyectado_usd >= saving_goal_usd
YELLOW if ahorro_proyectado_usd >= saving_goal_yellow AND < saving_goal_usd
RED    if ahorro_proyectado_usd < saving_goal_yellow
```

### 4.2 Category Status

```
gastado_ars = SUM(amount_ars) WHERE category_id = X AND month = activeMonth AND status = 'active'
porcentaje  = gastado_ars / budget_ars * 100  (only when budget_ars > 0)

OK      if budget_ars = 0 OR porcentaje < 80
WARNING if budget_ars > 0 AND porcentaje >= 80 AND < 100
CLOSED  if budget_ars > 0 AND porcentaje >= 100
```

### 4.3 Budget Enforcement with Exception Support

**Default rule:** If a category is CLOSED or the amount would exceed the remaining budget → block.

**Exception flow (when `hard_limit = false`):**
- Backend: returns `HTTP 422 { error: "BUDGET_EXCEEDED_SOFT", remaining, category }` instead of 400
- Frontend: shows `<ExceptionConfirmModal>` explaining the overage, asks for explicit confirmation
- If confirmed: re-sends request with `{ is_exception: true }` → backend accepts and inserts with `is_exception = 1`
- Telegram: bot asks "¿Confirmás registrar $X en Supermercado aunque supera el presupuesto? Respondé /confirmar o /cancelar"

**Hard block (when `hard_limit = true` or category is CLOSED regardless of hard_limit):**
- Backend: returns `HTTP 400 { error: "CATEGORY_CLOSED" | "BUDGET_EXCEEDED_HARD" }`
- Frontend: shows `<ClosedCategoryModal>`, submit remains disabled
- Telegram: sends error message, no confirmation flow

**Summary:** `hard_limit` controls whether exceptions are possible. CLOSED always hard-blocks regardless.

### 4.4 Amount Validation

- `amount_ars` > 0, must not exceed `budget_ars - gastado_ars` (when `budget_ars > 0` and `hard_limit = true`)
- Upper Zod cap: `999_999_999` (prevents catastrophic typos, not a business rule)
- If `is_exception: true` in body, backend skips budget cap check (user already confirmed)

### 4.5 Active Month Definition

- Active month = `getActiveMonthArgentina()` — always current calendar month in Argentina (UTC-3)
- Dashboard month navigator: past months are **read-only** (no inserts)
- `date` field in transactions must fall within the active month
- Out-of-range date returns `HTTP 400 { error: "DATE_OUT_OF_MONTH" }`

### 4.6 Soft Delete

- `/borrar_ultimo` (Telegram) and equivalent web action: set `status = 'deleted'`, `deleted_at = now()`
- "Último" = last transaction of the current active month by `created_at DESC` where `status = 'active'`
- Physical deletion never occurs in MVP
- All queries for summaries, category status, and totals filter `status = 'active'`

---

## 5. Exchange Rate (`lib/exchange/ripio.ts`)

### 5.1 Primary Source: Ripio API

```
GET https://app.ripio.com/api/v3/public/rates/?country=AR
Target: ticker === "USDT_ARS" → sell_rate (e.g., "1462.42")
```

```typescript
async function fetchRipioRate(): Promise<number>
// Returns parseFloat(sell_rate) from USDT_ARS ticker
// Throws RipioFetchError if: network failure, ticker not found, invalid value
```

**Failure handling:** If Ripio fetch fails:
- Keep the last stored `exchange_rate` from `monthly_settings` unchanged
- Log error server-side
- Return `{ error: "RIPIO_UNAVAILABLE", lastRate: number, lastUpdated: string }` to the caller
- UI shows a dismissible warning banner: "No se pudo actualizar el tipo de cambio. Usando último valor: $1.462,42 (actualizado hace 3 días)"

### 5.2 Auto-update: Vercel Cron

- Route: `GET /api/cron/update-exchange-rate`
- Protected by `Authorization: Bearer CRON_SECRET`
- Schedule: `0 0 1 * *` (first day of month, midnight UTC)
- Behavior:
  1. Calls `fetchRipioRate()` — on failure, logs and exits gracefully (does not crash)
  2. Finds `monthly_settings` for new month — if not found, copies `income_usd`, `saving_goal_usd`, `saving_goal_yellow` from previous month (or default fallbacks: income=0, goals=0)
  3. Copies budgets row-by-row from previous month
  4. Saves new exchange rate with `source = "ripio"`
  5. Returns `{ rate, month, initialized, rateError?: string }`

### 5.3 Manual Override (complement)

- `PATCH /api/settings/monthly` accepts `{ exchange_rate: number }` → sets `exchange_rate_source = "manual"`
- Settings UI shows source badge + "Actualizar desde Ripio" button → calls `POST /api/exchange-rate`
- Manual entry is always available as a fallback

---

## 6. Settings Page (`/settings`)

Three sections, all persisted to DB on save.

### 6.1 Configuración mensual → `PATCH /api/settings/monthly`

Fields: `income_usd`, `exchange_rate` (manual), `exchange_rate_source`  
Includes: "Actualizar desde Ripio" button + source badge + last updated timestamp

### 6.2 Umbrales del semáforo → `PATCH /api/settings/thresholds`

Fields: `saving_goal_usd` (green), `saving_goal_yellow`  
Live preview: converts both thresholds to ARS using current exchange rate

### 6.3 Presupuestos por categoría → `PATCH /api/settings/budgets`

Table with all active categories:
- `budget_ars`: inline editable (0 = "Sin límite")
- `hard_limit`: toggle (Bloqueo total / Permitir excepción)

---

## 7. Telegram Bot

### 7.1 Webhook Setup

- `POST /api/telegram/webhook` — excluded from web auth middleware
- Validates `X-Telegram-Bot-Api-Secret-Token` === `TELEGRAM_SECRET_TOKEN`
- Validates `from.id` === `TELEGRAM_ALLOWED_USER_ID`
- Checks `telegram_update_id` for duplicate prevention (idempotent processing)
- Logs all messages to `bot_messages` with full context

### 7.2 Commands

| Command | Description |
|---|---|
| `/start` | Welcome + list of available commands |
| `/gasto <monto> <categoria> <descripcion>` | Register expense. Example: `/gasto 47000 supermercado Cordiez` |
| `/resumen` | Monthly status: income, spent, savings, semáforo |
| `/disponible <categoria>` | Budget, spent, available, status |
| `/ultimo` | Last active transaction of current month |
| `/borrar_ultimo` | Soft-deletes last active transaction of current month. Confirms what was deleted, or errors if none found. |

### 7.3 Exception Flow via Telegram

When a budget is exceeded and `hard_limit = false`:
```
⚠️ Supermercado casi sin presupuesto.
Restante: $5.000 — querés registrar $20.000 (exceso: $15.000)?
Respondé /confirmar o /cancelar.
```
Bot stores a pending confirmation in memory (or short-lived DB flag) keyed by chat_id.

### 7.4 Response Format for `/gasto`

```
Registrado: $47.000 en Supermercado.

Supermercado mayo:
Presupuesto: $146.300
Gastado: $119.000
Disponible: $27.300
Estado: ⚠️ ATENCIÓN

💰 Ahorro proyectado: USD 3.950
```

### 7.5 Natural Language (Phase 3)

- No `/` prefix + no `GROQ_API_KEY` → `"Por ahora usá el formato: /gasto monto categoria descripción"`
- With `GROQ_API_KEY` → `lib/ai/parse-message.ts`

---

## 8. Groq Integration (Phase 3 — isolated)

```typescript
// lib/ai/parse-message.ts
interface FinancialIntent {
  intent: "register_expense" | "query_summary" | "query_category" | "unknown"
  amount_ars: number | null
  category: string | null
  merchant: string | null
  description: string | null
  date_text: string | null
  needs_confirmation: boolean
  confidence: number  // 0–1
}

async function parseFinancialMessage(text: string): Promise<FinancialIntent>
```

- Returns `intent: "unknown"` immediately if `GROQ_API_KEY` is not set
- Model: `process.env.GROQ_MODEL ?? "llama3-8b-8192"` — configurable via env, with safe fallback
- `confidence < 0.7` or `needs_confirmation = true` → bot asks for confirmation before inserting

---

## 9. Validations (Zod)

### POST /api/transactions

```typescript
z.object({
  category_id: z.string().uuid(),
  amount_ars: z.number().positive().max(999_999_999),
  merchant: z.string().max(100).trim().optional(),
  description: z.string().max(200).trim().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(["web", "telegram", "import"]).default("web"),
  is_exception: z.boolean().default(false),
})
```

Runtime checks after Zod (ordered):
1. `date` within active month → `DATE_OUT_OF_MONTH`
2. Category exists and is active → `INVALID_CATEGORY`
3. Category not CLOSED, or `is_exception: true` with `hard_limit = false` → `CATEGORY_CLOSED`
4. `amount_ars` ≤ remaining budget (when `budget_ars > 0`, `hard_limit = true`, `is_exception = false`) → `BUDGET_EXCEEDED_HARD`
5. If `budget_ars > 0`, `hard_limit = false`, amount > remaining, `is_exception = false` → `BUDGET_EXCEEDED_SOFT` (422)

### PATCH /api/settings/thresholds

```typescript
z.object({
  saving_goal_usd: z.number().positive(),
  saving_goal_yellow: z.number().positive(),
}).refine(d => d.saving_goal_yellow < d.saving_goal_usd, {
  message: "Yellow threshold must be less than green threshold"
})
```

### PATCH /api/settings/budgets

```typescript
z.object({
  budgets: z.array(z.object({
    category_id: z.string().uuid(),
    budget_ars: z.number().min(0),
    hard_limit: z.boolean(),
  }))
})
```

### PATCH /api/settings/monthly

```typescript
z.object({
  income_usd: z.number().positive().optional(),
  exchange_rate: z.number().positive().optional(),
})
```

---

## 10. Environment Variables

```bash
# Database
TURSO_DATABASE_URL=         # libsql://... from Turso dashboard
TURSO_AUTH_TOKEN=           # auth token from Turso dashboard

# Telegram
TELEGRAM_BOT_TOKEN=         # from @BotFather
TELEGRAM_ALLOWED_USER_ID=   # your numeric Telegram user ID
TELEGRAM_SECRET_TOKEN=      # random secret for webhook header validation

# AI (optional — enables natural language in Telegram)
GROQ_API_KEY=               # from console.groq.com
GROQ_MODEL=                 # optional; default: llama3-8b-8192

# Cron
CRON_SECRET=                # random secret to protect /api/cron/* endpoints

# Web Auth
WEB_ACCESS_TOKEN=           # password used to log into the web dashboard
SESSION_SECRET=             # random 32+ char string for HMAC cookie signing
```

---

## 11. Seed Data

Seed is for **demo/development only**. No month is hardcoded in application logic.

Creates:
- 1 user
- 10 categories: supermercado 🛒, verduleria 🥦, salidas_pareja 💑, restaurante 🍽️, servicios 💡, tarjeta 💳, viaje ✈️, compras_personales 🛍️, imprevistos ⚡, ingresos 💵
- `monthly_settings` for current demo month (May 2026): income_usd=4814, exchange_rate=1463, saving_goal_usd=4000, saving_goal_yellow=3800
- Budgets for demo month with `hard_limit=1` by default:
  - supermercado: 146,300 ARS
  - salidas_pareja: 73,150 ARS  
  - compras_personales: 73,150 ARS
  - imprevistos: 73,150 ARS
  - All others: 0 ARS (unlimited)

---

## 12. npm Scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:seed": "tsx lib/db/seed.ts"
}
```

---

## 13. Phased Implementation Plan

### Phase 1 — Foundation (must compile clean before Phase 2)
1. Scaffold Next.js (latest stable) with TypeScript, Tailwind, shadcn/ui
2. Configure Drizzle ORM + Turso client
3. Create full schema, run initial migration
4. Write seed script and verify with `db:seed`
5. Implement `lib/utils/dates.ts` (Argentina date helpers)
6. Implement `lib/utils/session.ts` (HMAC signing)
7. Implement `lib/finance/rules.ts` and `lib/finance/summaries.ts`
8. Implement `lib/exchange/ripio.ts` with failure handling
9. Auth: `middleware.ts`, `/login` page, `/logout` route
10. Dashboard page: StatusBanner, CategoryList with status, DonutChart, BarChart, MonthNav
11. ExpenseForm: Zod validation, CLOSED modal, ExceptionConfirmModal
12. `POST /api/transactions` with full validation chain including exception flow
13. Settings page + `PATCH /api/settings/thresholds`, `/budgets`, `/monthly`
14. `POST /api/exchange-rate` + `GET /api/cron/update-exchange-rate`

### Phase 2 — Telegram (after Phase 1 passes build)
15. `POST /api/telegram/webhook` with auth + duplicate prevention
16. All 6 command handlers in `lib/telegram/handlers.ts`
17. Exception confirmation flow via Telegram
18. Telegram formatters

### Phase 3 — AI Layer (isolated, additive)
19. `lib/ai/groq.ts` with `GROQ_MODEL` env config + fallback
20. `lib/ai/parse-message.ts`
21. Wire into Telegram handler for non-command messages
22. Full `bot_messages` logging

---

## 14. Acceptance Criteria

- [ ] `npm run dev` runs without errors
- [ ] `npm run db:seed` populates DB, no hardcoded months in application code
- [ ] Login/logout work; cookie is signed (not plain token)
- [ ] Dashboard shows active month totals, savings projection, semáforo
- [ ] Expense form: validates input, shows CLOSED modal on hard blocks, shows ExceptionConfirmModal on soft blocks
- [ ] `POST /api/transactions` enforces all validation rules, returns correct error codes
- [ ] Exception transactions inserted with `is_exception = 1` when confirmed
- [ ] `status = 'deleted'` on soft delete; summaries only count `status = 'active'`
- [ ] Semáforo thresholds, budgets (with hard_limit), and monthly settings editable via `/settings`
- [ ] Exchange rate auto-fetches from Ripio; Ripio failure keeps last rate + shows warning
- [ ] `GROQ_MODEL` env var works; fallback to `llama3-8b-8192` when unset
- [ ] `/gasto` registers transaction with `source = 'telegram'`
- [ ] `/borrar_ultimo` soft-deletes, confirms action
- [ ] Codebase ready to add Groq without architectural changes
- [ ] Dark mode functional on all pages
- [ ] Accessible: ARIA labels, keyboard navigation, WCAG AA contrast
