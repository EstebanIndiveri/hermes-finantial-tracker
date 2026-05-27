# Hermes Finance — Design Spec
**Date:** 2026-05-27  
**Status:** Approved  
**Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · shadcn/ui · Turso · Drizzle ORM · Telegram Bot Webhook · Groq API (optional) · Vercel

---

## 1. Product Overview

Hermes Finance is a personal financial assistant MVP for tracking monthly expenses, monitoring category budgets, and receiving alerts via Telegram and a responsive web dashboard.

**Core principle:** AI interprets messages → backend validates → DB records → financial rules calculate state, limits, and alerts.

**Single user:** Personal tool. One seeded user. Auth via middleware token (no multi-tenancy in MVP).

---

## 2. Architecture

### 2.1 Folder Structure

```
app/
  (auth)/
    login/
      page.tsx                  ← password form (WEB_ACCESS_TOKEN)
  (app)/
    dashboard/
      page.tsx                  ← main monthly dashboard
    transactions/
      page.tsx                  ← full transaction list + filters
    settings/
      page.tsx                  ← monthly config: income, thresholds, budgets, exchange rate
  api/
    telegram/
      webhook/
        route.ts                ← POST handler, validates secret token
    transactions/
      route.ts                  ← GET (list) / POST (create)
    exchange-rate/
      route.ts                  ← POST: fetch from Ripio, save to monthly_settings
    cron/
      update-exchange-rate/
        route.ts                ← GET: called by Vercel Cron at start of each month
  middleware.ts                 ← session cookie check for (app)/* routes

lib/
  db/
    client.ts                   ← Turso/Drizzle client singleton
    schema.ts                   ← all table definitions
    seed.ts                     ← initial user + categories + May 2026 example data
    migrations/                 ← drizzle-kit generated
  finance/
    rules.ts                    ← calculateMonthStatus, calculateCategoryStatus
    summaries.ts                ← getMonthSummary, getCategoryBreakdown
    formatters.ts               ← formatARS, formatUSD, formatPercent
  telegram/
    send-message.ts             ← sendTelegramMessage(chatId, text)
    handlers.ts                 ← command router: /start, /gasto, /resumen, /disponible, /ultimo, /borrar_ultimo
    formatters.ts               ← formatSummaryMessage, formatGastoResponse
  ai/
    groq.ts                     ← Groq client, guarded by GROQ_API_KEY presence check
    parse-message.ts            ← parseFinancialMessage(text): FinancialIntent | null
  exchange/
    ripio.ts                    ← fetchRipioRate(): Promise<number> — extracts sell_rate from USDT_ARS

components/
  dashboard/
    StatusBanner.tsx
    CategoryList.tsx
    DonutChart.tsx
    BarChart.tsx
    MonthNav.tsx
    ClosedCategoryModal.tsx     ← modal shown when user tries to add to a CLOSED category
  forms/
    ExpenseForm.tsx
    BudgetForm.tsx              ← inline budget editor in /settings
    ThresholdForm.tsx           ← semáforo threshold editor in /settings
  ui/                           ← shadcn/ui components (Button, Input, Select, Dialog, etc.)
```

### 2.2 Auth Flow

- `middleware.ts` protects all routes under `(app)/*`
- Reads cookie `hermes_session`; redirects to `/login` if absent or invalid
- `/login` POST: compares password against `WEB_ACCESS_TOKEN` env var → sets `hermes_session` cookie (httpOnly, sameSite=strict) → redirects to `/dashboard`
- Telegram webhook route is **excluded** from middleware (uses `TELEGRAM_SECRET_TOKEN` header validation instead)

---

## 3. Database Schema

```typescript
// users
id: text (uuid, pk)
name: text
telegram_user_id: text (unique, nullable)  ← for Telegram auth
created_at: integer (timestamp)

// monthly_settings
id: text (uuid, pk)
user_id: text (fk → users.id)
month: text  ← format: "YYYY-MM", unique per user
income_usd: real
exchange_rate: real                         ← sell_rate from Ripio USDT_ARS, auto-updated monthly
exchange_rate_source: text                  ← "ripio" | "manual"
exchange_rate_updated_at: integer
saving_goal_usd: real                       ← green threshold (configurable via UI)
saving_goal_yellow: real                    ← yellow threshold (configurable via UI)
created_at: integer

// categories
id: text (uuid, pk)
slug: text (unique)                         ← "supermercado", "verduleria", etc.
name: text                                  ← "Supermercado"
emoji: text                                 ← "🛒"
is_active: integer (boolean)
sort_order: integer

// budgets
id: text (uuid, pk)
user_id: text (fk → users.id)
month: text                                 ← "YYYY-MM"
category_id: text (fk → categories.id)
budget_ars: real                            ← 0 = no budget limit (unlimited)
created_at: integer
UNIQUE(user_id, month, category_id)

// transactions
id: text (uuid, pk)
user_id: text (fk → users.id)
category_id: text (fk → categories.id)
amount_ars: real                            ← stored as entered
amount_usd: real                            ← computed at insert: amount_ars / exchange_rate
merchant: text (nullable, max 100)
description: text (nullable, max 200)
date: text                                  ← "YYYY-MM-DD"
month: text                                 ← "YYYY-MM", denormalized for query performance
created_at: integer

// bot_messages
id: text (uuid, pk)
user_id: text (fk → users.id)
raw_text: text
parsed_intent: text (nullable)              ← JSON string of FinancialIntent
response_text: text
created_at: integer
```

**Key constraints:**
- `amount_usd` is calculated and persisted at insert time using the month's `exchange_rate`. It does not change if the rate is updated later.
- `month` is denormalized in `transactions` for efficient monthly queries.
- `budget_ars = 0` means no spending limit for that category that month.

---

## 4. Financial Rules

All rules live in `lib/finance/rules.ts`. **Nothing is hardcoded** — values come from `monthly_settings` and `budgets`.

### 4.1 Month Status (Semáforo)

```
ahorro_proyectado_usd = income_usd - total_gastado_usd

GREEN  if ahorro_proyectado_usd >= saving_goal_usd
YELLOW if ahorro_proyectado_usd >= saving_goal_yellow AND < saving_goal_usd
RED    if ahorro_proyectado_usd < saving_goal_yellow
```

### 4.2 Category Status

```
porcentaje = gastado_ars / budget_ars * 100

OK      if porcentaje < 80
WARNING if porcentaje >= 80 AND < 100
CLOSED  if porcentaje >= 100

Special case: if budget_ars = 0 → always OK (unlimited)
```

### 4.3 CLOSED Category Enforcement

- **Backend:** `POST /api/transactions` checks category status before insert. If CLOSED → returns `HTTP 400 { error: "CATEGORY_CLOSED", category: { name, spent, budget } }`
- **Frontend:** `ExpenseForm` fetches category statuses on mount and when category changes. If user selects a CLOSED category → the `<ClosedCategoryModal>` is shown immediately, the submit button is disabled. User cannot submit.
- **Telegram:** Handlers check category status before inserting. If CLOSED → sends formatted error message explaining the situation.

### 4.4 Amount Validation

- `amount_ars` must be > 0
- `amount_ars` must not exceed the remaining budget for that category that month
  - `max = budget_ars - gastado_ars_actual`
  - If `budget_ars = 0` (unlimited), no upper cap
  - Returns `HTTP 400 { error: "EXCEEDS_BUDGET", remaining: number }` if violated

### 4.5 Active Month Definition

- The **active month** for inserts is always the current calendar month (UTC-3 / Argentina time)
- The dashboard month navigator allows viewing any past month in **read-only mode** — no inserts allowed for past months
- `date` in a transaction must fall within the active month (e.g., May 1–31 for month "2026-05")
- Attempting to insert with a date outside the active month returns `HTTP 400 { error: "DATE_OUT_OF_MONTH" }`

---

## 5. Exchange Rate

### 5.1 Primary Source: Ripio API (automated)

Endpoint: `GET https://app.ripio.com/api/v3/public/rates/?country=AR`

Target ticker: `USDT_ARS` → field `sell_rate` (e.g., `"1462.42"`)

Logic in `lib/exchange/ripio.ts`:
```typescript
async function fetchRipioRate(): Promise<number>
// Finds ticker === "USDT_ARS", returns parseFloat(sell_rate)
// Throws if ticker not found or request fails
```

### 5.2 Auto-update: Vercel Cron

- Route: `GET /api/cron/update-exchange-rate`
- Protected by `Authorization: Bearer CRON_SECRET` header
- Vercel cron schedule: `0 0 1 * *` (first day of each month, midnight UTC)
- Behavior:
  1. Fetches rate from Ripio
  2. Finds `monthly_settings` for current month — if not found, **copies** `income_usd`, `saving_goal_usd`, `saving_goal_yellow` from the previous month (or uses hardcoded defaults if no previous month exists)
  3. Copies budgets from previous month as starting defaults for the new month
  4. Updates `exchange_rate`, sets `exchange_rate_source = "ripio"`, updates `exchange_rate_updated_at`
  5. Returns `{ rate, month, initialized: boolean }` — `initialized: true` if a new month was created

### 5.3 Manual Override (complement)

- Settings page has a "Tipo de cambio" section showing current rate, source, and last updated timestamp
- Button **"Actualizar desde Ripio"** triggers `POST /api/exchange-rate` (authenticated, no cron secret needed)
- Manual input field + **"Guardar manual"** button → sets `exchange_rate_source = "manual"`
- UI clearly shows `source` badge ("Ripio automático" vs "Ingreso manual") so the user knows which value is active

---

## 6. Settings Page (`/settings`)

Single page with three configurable sections. All changes persist to DB immediately on save.

### 6.1 Configuración del mes

- Month selector (read-only, shows current active month)
- Ingreso mensual (USD)
- Exchange rate display + manual override + "Actualizar desde Ripio" button

### 6.2 Umbrales del semáforo

Form with two fields:
- **Meta de ahorro (verde):** USD amount → `saving_goal_usd`
- **Umbral amarillo:** USD amount → `saving_goal_yellow`
- Real-time preview: shows what the thresholds mean in ARS at current exchange rate
- Save button → `PATCH /api/settings/thresholds`

### 6.3 Presupuestos por categoría

Table showing all active categories with an editable `budget_ars` field per row.
- Inline editing: click a value to edit, press Enter or click away to save
- `0` = sin límite (shown as "Sin límite" label)
- Changes hit `PATCH /api/settings/budgets`

---

## 7. Telegram Bot

### 7.1 Webhook Setup

- `POST /api/telegram/webhook`
- Validates `X-Telegram-Bot-Api-Secret-Token` header === `TELEGRAM_SECRET_TOKEN`
- Validates `from.id` === `TELEGRAM_ALLOWED_USER_ID` (only one authorized user)
- Routes to command handlers in `lib/telegram/handlers.ts`

### 7.2 Commands

| Command | Description |
|---|---|
| `/start` | Welcome message with available commands |
| `/gasto <monto> <categoria> <descripcion>` | Register expense. Example: `/gasto 47000 supermercado Cordiez` |
| `/resumen` | Monthly financial status: income, spent, savings, semáforo |
| `/disponible <categoria>` | Budget, spent, available, status for a category |
| `/ultimo` | Shows last registered transaction |
| `/borrar_ultimo` | Deletes the last transaction of the current month by `created_at` desc. Replies with confirmation showing what was deleted. If no transactions exist this month, replies with an informative error message. |

### 7.3 Response Format for `/gasto`

```
Registrado: $47.000 en Supermercado.

Supermercado mayo:
Presupuesto: $146.300
Gastado: $119.000
Disponible: $27.300
Estado: ⚠️ ATENCIÓN

💰 Ahorro proyectado: USD 3.950
```

If category is CLOSED:
```
❌ Supermercado está cerrado este mes.
Presupuesto: $146.300
Gastado: $146.300
Disponible: $0
Usá /disponible supermercado para ver el detalle.
```

### 7.4 Natural Language (Phase 3)

- If message does not start with `/` AND `GROQ_API_KEY` is not set:
  `"Por ahora usá el formato: /gasto monto categoria descripción"`
- If `GROQ_API_KEY` is set: routes to `lib/ai/parse-message.ts`

---

## 8. Groq Integration (Phase 3 — isolated, not activated by default)

`lib/ai/parse-message.ts` exposes:

```typescript
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

- Returns early with `intent: "unknown"` if `GROQ_API_KEY` is not set
- Model: `llama3-8b-8192` (fast, free tier)
- Low confidence (< 0.7) or `needs_confirmation = true` → bot replies asking for confirmation before inserting

---

## 9. Validations (Zod)

All API routes validate with Zod before touching the DB.

### POST /api/transactions

```typescript
z.object({
  category_id: z.string().uuid(),
  amount_ars: z.number().positive().max(999_999_999),
  merchant: z.string().max(100).optional(),
  description: z.string().max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
```

Additional runtime checks (not Zod):
- `date` must be within current active month
- Category must be active and exist
- Category must not be CLOSED
- `amount_ars` must not exceed remaining budget (if budget > 0)

---

## 10. Environment Variables

```
TURSO_DATABASE_URL          ← libsql://... from Turso dashboard
TURSO_AUTH_TOKEN            ← auth token from Turso dashboard
TELEGRAM_BOT_TOKEN          ← from @BotFather
TELEGRAM_ALLOWED_USER_ID    ← your Telegram user ID (numeric string)
TELEGRAM_SECRET_TOKEN       ← random secret for webhook header validation
GROQ_API_KEY                ← optional; enables natural language processing
CRON_SECRET                 ← random secret to protect cron endpoint
WEB_ACCESS_TOKEN            ← password for web dashboard access
```

---

## 11. Seed Data

Seed creates:
- 1 user (personal)
- 10 categories with slugs, names, emojis
- `monthly_settings` for May 2026: income_usd=4814, exchange_rate=1463, saving_goal_usd=4000, saving_goal_yellow=3800
- Budgets for May 2026:
  - supermercado: 146,300 ARS
  - salidas_pareja: 73,150 ARS
  - compras_personales: 73,150 ARS
  - imprevistos: 73,150 ARS
  - All others: 0 (unlimited)

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

### Phase 1 (compile + ordered)
1. Scaffold Next.js project with TypeScript, Tailwind, shadcn/ui
2. Configure Drizzle + Turso connection
3. Create schema and run initial migration
4. Seed database
5. Implement `lib/finance/rules.ts` and `lib/finance/summaries.ts`
6. Implement `lib/exchange/ripio.ts`
7. Build `/dashboard` page with StatusBanner, CategoryList, DonutChart, BarChart
8. Build `ExpenseForm` with CLOSED modal + Zod validation
9. Implement `POST /api/transactions` with full validation chain
10. Build `/settings` page: thresholds form, budget table, exchange rate section
11. Implement `POST /api/exchange-rate` + `/api/cron/update-exchange-rate`
12. Auth middleware + `/login` page

### Phase 2 (after Phase 1 compiles clean)
13. Implement Telegram webhook route
14. Implement all 6 command handlers
15. Write Telegram formatters
16. Test end-to-end: `/gasto`, `/resumen`, `/disponible`, `/ultimo`, `/borrar_ultimo`

### Phase 3 (isolated, additive)
17. Implement `lib/ai/groq.ts` and `lib/ai/parse-message.ts`
18. Wire Groq into Telegram handler for non-command messages
19. Add `bot_messages` logging

---

## 14. Acceptance Criteria

- [ ] Project runs locally with `npm run dev`
- [ ] `npm run db:seed` populates DB with example data
- [ ] Dashboard shows monthly totals, savings projection, semáforo
- [ ] Expense form: validates input, shows CLOSED modal if category is at limit, blocks submit
- [ ] `POST /api/transactions` rejects CLOSED categories and over-budget amounts with correct error codes
- [ ] Semáforo thresholds and budgets are editable via `/settings` UI
- [ ] Exchange rate auto-updates via cron; manual override available in UI
- [ ] `/gasto` Telegram command registers a transaction and replies with formatted summary
- [ ] `/resumen` returns month financial status
- [ ] `/disponible <category>` returns category breakdown
- [ ] Codebase is ready to add Groq without architectural changes
- [ ] Dark mode works on all pages
- [ ] UI is accessible (ARIA labels, keyboard navigation, color contrast WCAG AA)
