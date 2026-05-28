# Hermes Finance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal financial assistant MVP with a Next.js web dashboard and Telegram bot to track monthly expenses, category budgets, and savings goals.

**Architecture:** Next.js App Router + TypeScript frontend with server actions and API routes. Drizzle ORM connects to Turso (libSQL). Financial rules are deterministic functions in `lib/finance`. Telegram webhook is independent of web auth. Groq layer is isolated and additive.

**Tech Stack:** Next.js (latest stable) · TypeScript · Tailwind CSS · shadcn/ui · Turso · Drizzle ORM · Telegram Bot Webhook · Groq API (optional) · Vercel · Zod

---

## File Map

| File | Responsibility |
|------|---------------|
| `lib/db/client.ts` | Turso/Drizzle singleton |
| `lib/db/schema.ts` | All table definitions |
| `lib/db/seed.ts` | Demo user, categories, May 2026 settings+budgets |
| `lib/utils/dates.ts` | `getArgentinaDate()`, `getActiveMonthArgentina()`, `getMonthDateRange()` |
| `lib/utils/session.ts` | `signSession()`, `verifySession()` using HMAC-SHA256 |
| `lib/finance/rules.ts` | `calculateMonthStatus()`, `calculateCategoryStatus()` |
| `lib/finance/summaries.ts` | `getMonthSummary()`, `getCategoryBreakdown()` |
| `lib/finance/formatters.ts` | `formatARS()`, `formatUSD()`, `formatPercent()` |
| `lib/exchange/ripio.ts` | `fetchRipioRate()` with error handling |
| `lib/telegram/send-message.ts` | `sendTelegramMessage(chatId, text)` |
| `lib/telegram/handlers.ts` | Command router for all 6 commands |
| `lib/telegram/formatters.ts` | `formatSummaryMessage()`, `formatGastoResponse()` |
| `lib/ai/groq.ts` | Groq client guarded by `GROQ_API_KEY` |
| `lib/ai/parse-message.ts` | `parseFinancialMessage(text): FinancialIntent` |
| `middleware.ts` | Protects `(app)/*` and `/api/*` except webhook + cron |
| `app/(auth)/login/page.tsx` | Password form |
| `app/(auth)/logout/route.ts` | POST: clear cookie, redirect /login |
| `app/api/auth/login/route.ts` | POST: validate password, set signed cookie |
| `app/(app)/dashboard/page.tsx` | Monthly dashboard |
| `app/(app)/transactions/page.tsx` | Full transaction list + filters |
| `app/(app)/settings/page.tsx` | Monthly config, thresholds, budgets |
| `app/api/transactions/route.ts` | GET list / POST create with full validation chain |
| `app/api/settings/thresholds/route.ts` | PATCH saving thresholds |
| `app/api/settings/budgets/route.ts` | PATCH budgets per category |
| `app/api/settings/monthly/route.ts` | PATCH income_usd, exchange_rate |
| `app/api/exchange-rate/route.ts` | POST: fetch from Ripio, save |
| `app/api/cron/update-exchange-rate/route.ts` | GET: Vercel Cron monthly trigger |
| `app/api/telegram/webhook/route.ts` | POST: Telegram webhook handler |
| `components/dashboard/StatusBanner.tsx` | Semáforo banner (GREEN/YELLOW/RED) |
| `components/dashboard/CategoryList.tsx` | Category rows with status badges |
| `components/dashboard/DonutChart.tsx` | Budget distribution donut chart |
| `components/dashboard/BarChart.tsx` | Monthly spending bar chart |
| `components/dashboard/MonthNav.tsx` | Month navigation (read-only past) |
| `components/dashboard/ClosedCategoryModal.tsx` | Hard block modal |
| `components/dashboard/ExceptionConfirmModal.tsx` | Soft block confirmation modal |
| `components/forms/ExpenseForm.tsx` | Manual expense entry form |
| `components/forms/ExpenseFormWrapper.tsx` | Client wrapper for server component |
| `components/forms/BudgetForm.tsx` | Inline budget editor |
| `components/forms/ThresholdForm.tsx` | Threshold editor with live ARS preview |
| `components/forms/ExchangeRateSection.tsx` | Exchange rate UI with Ripio fetch button |

---

## Phase 1A — Project Scaffold + DB

### Task 1: Initialize Next.js project

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Bootstrap project**
```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir no --import-alias "@/*" --yes
```
Expected: Next.js installed, `app/` folder created, `package.json` present.

- [ ] **Step 2: Install dependencies**
```bash
npm install @libsql/client drizzle-orm drizzle-zod zod
npm install -D drizzle-kit tsx @types/node
```

- [ ] **Step 3: Install shadcn/ui**
```bash
npx shadcn@latest init -d
npx shadcn@latest add button input label select card badge dialog toast sonner switch
```

- [ ] **Step 4: Install chart library**
```bash
npm install recharts
npm install lucide-react
```

- [ ] **Step 5: Create `.env.example`**
```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-auth-token
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
TELEGRAM_SECRET_TOKEN=
GROQ_API_KEY=
GROQ_MODEL=llama3-8b-8192
CRON_SECRET=
WEB_ACCESS_TOKEN=
SESSION_SECRET=
```

- [ ] **Step 6: Create `drizzle.config.ts`**
```typescript
import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
} satisfies Config;
```

- [ ] **Step 7: Add npm scripts to `package.json`**
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:seed": "tsx lib/db/seed.ts"
```

- [ ] **Step 8: Commit**
```bash
git add -A && git commit -m "chore: scaffold Next.js project with Tailwind, shadcn/ui, Drizzle"
```

---

### Task 2: Database schema

**Files:**
- Create: `lib/db/client.ts`
- Create: `lib/db/schema.ts`

- [ ] **Step 1: Create `lib/db/client.ts`**
```typescript
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
```

- [ ] **Step 2: Create `lib/db/schema.ts`**
```typescript
import { sql } from "drizzle-orm";
import { text, real, integer, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  telegram_user_id: text("telegram_user_id").unique(),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const monthly_settings = sqliteTable("monthly_settings", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  month: text("month").notNull(),
  income_usd: real("income_usd").notNull().default(0),
  exchange_rate: real("exchange_rate").notNull().default(1),
  exchange_rate_source: text("exchange_rate_source").notNull().default("manual"),
  exchange_rate_updated_at: integer("exchange_rate_updated_at"),
  saving_goal_usd: real("saving_goal_usd").notNull().default(0),
  saving_goal_yellow: real("saving_goal_yellow").notNull().default(0),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  uniqUserMonth: uniqueIndex("ms_user_month_idx").on(t.user_id, t.month),
}));

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("📦"),
  is_active: integer("is_active").notNull().default(1),
  sort_order: integer("sort_order").notNull().default(0),
});

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  month: text("month").notNull(),
  category_id: text("category_id").notNull().references(() => categories.id),
  budget_ars: real("budget_ars").notNull().default(0),
  hard_limit: integer("hard_limit").notNull().default(1),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  uniqUserMonthCat: uniqueIndex("budgets_user_month_cat_idx").on(t.user_id, t.month, t.category_id),
}));

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  category_id: text("category_id").notNull().references(() => categories.id),
  amount_ars: real("amount_ars").notNull(),
  amount_usd: real("amount_usd").notNull(),
  merchant: text("merchant"),
  description: text("description"),
  date: text("date").notNull(),
  month: text("month").notNull(),
  source: text("source").notNull().default("web"),
  status: text("status").notNull().default("active"),
  is_exception: integer("is_exception").notNull().default(0),
  deleted_at: integer("deleted_at"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const bot_messages = sqliteTable("bot_messages", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  telegram_chat_id: text("telegram_chat_id").notNull(),
  telegram_user_id: text("telegram_user_id").notNull(),
  telegram_update_id: text("telegram_update_id").unique(),
  raw_text: text("raw_text").notNull(),
  parsed_intent: text("parsed_intent"),
  response_text: text("response_text").notNull(),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});
```

- [ ] **Step 3: Run migration**
```bash
npm run db:generate
npm run db:migrate
```
Expected: `lib/db/migrations/` folder with SQL files; DB tables created in Turso.

- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "feat: add database schema and Drizzle client"
```

---

### Task 3: Seed script

**Files:**
- Create: `lib/db/seed.ts`

- [ ] **Step 1: Create `lib/db/seed.ts`**
```typescript
import { db } from "./client";
import { users, categories, monthly_settings, budgets } from "./schema";
import { randomUUID } from "crypto";

async function seed() {
  const userId = randomUUID();
  const demoMonth = "2026-05";

  await db.insert(users).values({
    id: userId,
    name: "Hermes User",
    telegram_user_id: null,
  }).onConflictDoNothing();

  const cats = [
    { slug: "supermercado",      name: "Supermercado",       emoji: "🛒", sort_order: 1 },
    { slug: "verduleria",        name: "Verdulería",         emoji: "🥦", sort_order: 2 },
    { slug: "salidas_pareja",    name: "Salidas pareja",     emoji: "💑", sort_order: 3 },
    { slug: "restaurante",       name: "Restaurante",        emoji: "🍽️", sort_order: 4 },
    { slug: "servicios",         name: "Servicios",          emoji: "💡", sort_order: 5 },
    { slug: "tarjeta",           name: "Tarjeta",            emoji: "💳", sort_order: 6 },
    { slug: "viaje",             name: "Viaje",              emoji: "✈️", sort_order: 7 },
    { slug: "compras_personales",name: "Compras personales", emoji: "🛍️", sort_order: 8 },
    { slug: "imprevistos",       name: "Imprevistos",        emoji: "⚡", sort_order: 9 },
    { slug: "ingresos",          name: "Ingresos",           emoji: "💵", sort_order: 10 },
  ];

  const insertedCats: Record<string, string> = {};
  for (const cat of cats) {
    const id = randomUUID();
    insertedCats[cat.slug] = id;
    await db.insert(categories).values({ id, ...cat }).onConflictDoNothing();
  }

  await db.insert(monthly_settings).values({
    id: randomUUID(),
    user_id: userId,
    month: demoMonth,
    income_usd: 4814,
    exchange_rate: 1463,
    exchange_rate_source: "manual",
    saving_goal_usd: 4000,
    saving_goal_yellow: 3800,
  }).onConflictDoNothing();

  const budgetData = [
    { slug: "supermercado",       budget_ars: 146300 },
    { slug: "salidas_pareja",     budget_ars: 73150  },
    { slug: "compras_personales", budget_ars: 73150  },
    { slug: "imprevistos",        budget_ars: 73150  },
  ];

  for (const b of budgetData) {
    await db.insert(budgets).values({
      id: randomUUID(),
      user_id: userId,
      month: demoMonth,
      category_id: insertedCats[b.slug],
      budget_ars: b.budget_ars,
      hard_limit: 1,
    }).onConflictDoNothing();
  }

  console.log("✅ Seed complete");
}

seed().catch(console.error);
```

- [ ] **Step 2: Run seed and verify**
```bash
npm run db:seed
```
Expected: `✅ Seed complete` with no errors.

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "feat: add seed script with demo user, categories, and May 2026 settings"
```

---

## Phase 1B — Core Libraries

### Task 4: Date helpers

**Files:**
- Create: `lib/utils/dates.ts`
- Create: `lib/utils/__tests__/dates.test.ts`

- [ ] **Step 1: Write failing test — `lib/utils/__tests__/dates.test.ts`**
```typescript
import { getArgentinaDate, getActiveMonthArgentina, getMonthDateRange } from "../dates";

test("getArgentinaDate returns a Date", () => {
  const d = getArgentinaDate();
  expect(d instanceof Date).toBe(true);
});

test("getActiveMonthArgentina returns YYYY-MM format", () => {
  const m = getActiveMonthArgentina();
  expect(m).toMatch(/^\d{4}-\d{2}$/);
});

test("getMonthDateRange returns correct start and end for 2026-05", () => {
  const range = getMonthDateRange("2026-05");
  expect(range.start).toBe("2026-05-01");
  expect(range.end).toBe("2026-05-31");
});

test("getMonthDateRange handles February 2024 (leap year)", () => {
  const range = getMonthDateRange("2024-02");
  expect(range.end).toBe("2024-02-29");
});
```

- [ ] **Step 2: Run to see it fail**
```bash
npx jest lib/utils/__tests__/dates.test.ts --no-coverage
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/utils/dates.ts`**
```typescript
const ARGENTINA_TZ = "America/Argentina/Buenos_Aires";

export function getArgentinaDate(): Date {
  const now = new Date();
  const arStr = now.toLocaleString("en-US", { timeZone: ARGENTINA_TZ });
  return new Date(arStr);
}

export function getActiveMonthArgentina(): string {
  const d = getArgentinaDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function getMonthDateRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
```

- [ ] **Step 4: Run tests — must pass**
```bash
npx jest lib/utils/__tests__/dates.test.ts --no-coverage
```
Expected: PASS all 4 tests.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat: add Argentina date helpers"
```

---

### Task 5: Session helpers

**Files:**
- Create: `lib/utils/session.ts`
- Create: `lib/utils/__tests__/session.test.ts`

- [ ] **Step 1: Write failing test — `lib/utils/__tests__/session.test.ts`**
```typescript
import { signSession, verifySession } from "../session";

process.env.SESSION_SECRET = "test-secret-32-chars-long-padding!!";

test("signSession returns a non-empty string", () => {
  const token = signSession("user-123");
  expect(typeof token).toBe("string");
  expect(token.length).toBeGreaterThan(10);
});

test("verifySession returns userId for valid token", () => {
  const token = signSession("user-abc");
  const result = verifySession(token);
  expect(result).toBe("user-abc");
});

test("verifySession returns null for tampered token", () => {
  const token = signSession("user-abc");
  const tampered = token.slice(0, -4) + "xxxx";
  expect(verifySession(tampered)).toBeNull();
});

test("verifySession returns null for garbage input", () => {
  expect(verifySession("not-a-token")).toBeNull();
});
```

- [ ] **Step 2: Run to see it fail**
```bash
npx jest lib/utils/__tests__/session.test.ts --no-coverage
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/utils/session.ts`**
```typescript
import { createHmac } from "crypto";

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not defined");
  return s;
}

export function signSession(userId: string): string {
  const payload = `${userId}:${Date.now()}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64");
}

export function verifySession(cookie: string): string | null {
  try {
    const decoded = Buffer.from(cookie, "base64").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length < 3) return null;
    const sig = parts.pop()!;
    const payload = parts.join(":");
    const expected = createHmac("sha256", getSecret()).update(payload).digest("hex");
    if (sig !== expected) return null;
    return parts[0];
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests — must pass**
```bash
npx jest lib/utils/__tests__/session.test.ts --no-coverage
```
Expected: PASS all 4 tests.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat: add HMAC session signing helpers"
```

---

### Task 6: Financial rules

**Files:**
- Create: `lib/finance/rules.ts`
- Create: `lib/finance/formatters.ts`
- Create: `lib/finance/__tests__/rules.test.ts`

- [ ] **Step 1: Write failing test — `lib/finance/__tests__/rules.test.ts`**
```typescript
import { calculateMonthStatus, calculateCategoryStatus } from "../rules";

test("GREEN when ahorro >= saving_goal_usd", () => {
  expect(calculateMonthStatus({ income_usd: 4814, total_spent_usd: 800, saving_goal_usd: 4000, saving_goal_yellow: 3800 })).toBe("GREEN");
});

test("YELLOW when ahorro >= saving_goal_yellow but < saving_goal_usd", () => {
  expect(calculateMonthStatus({ income_usd: 4814, total_spent_usd: 1014, saving_goal_usd: 4000, saving_goal_yellow: 3800 })).toBe("YELLOW");
});

test("RED when ahorro < saving_goal_yellow", () => {
  expect(calculateMonthStatus({ income_usd: 4814, total_spent_usd: 1200, saving_goal_usd: 4000, saving_goal_yellow: 3800 })).toBe("RED");
});

test("OK when budget_ars = 0 (unlimited)", () => {
  expect(calculateCategoryStatus({ gastado_ars: 999999, budget_ars: 0 })).toBe("OK");
});

test("OK when < 80% of budget", () => {
  expect(calculateCategoryStatus({ gastado_ars: 70000, budget_ars: 100000 })).toBe("OK");
});

test("WARNING when >= 80% and < 100%", () => {
  expect(calculateCategoryStatus({ gastado_ars: 85000, budget_ars: 100000 })).toBe("WARNING");
});

test("CLOSED when >= 100%", () => {
  expect(calculateCategoryStatus({ gastado_ars: 100000, budget_ars: 100000 })).toBe("CLOSED");
});
```

- [ ] **Step 2: Run to see it fail**
```bash
npx jest lib/finance/__tests__/rules.test.ts --no-coverage
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/finance/rules.ts`**
```typescript
export type MonthStatus = "GREEN" | "YELLOW" | "RED";
export type CategoryStatus = "OK" | "WARNING" | "CLOSED";

interface MonthStatusInput {
  income_usd: number;
  total_spent_usd: number;
  saving_goal_usd: number;
  saving_goal_yellow: number;
}

export function calculateMonthStatus(input: MonthStatusInput): MonthStatus {
  const ahorro = input.income_usd - input.total_spent_usd;
  if (ahorro >= input.saving_goal_usd) return "GREEN";
  if (ahorro >= input.saving_goal_yellow) return "YELLOW";
  return "RED";
}

interface CategoryStatusInput {
  gastado_ars: number;
  budget_ars: number;
}

export function calculateCategoryStatus(input: CategoryStatusInput): CategoryStatus {
  const { gastado_ars, budget_ars } = input;
  if (budget_ars === 0) return "OK";
  const pct = (gastado_ars / budget_ars) * 100;
  if (pct >= 100) return "CLOSED";
  if (pct >= 80) return "WARNING";
  return "OK";
}
```

- [ ] **Step 4: Create `lib/finance/formatters.ts`**
```typescript
export function formatARS(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  }).format(amount);
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}
```

- [ ] **Step 5: Run tests — must pass**
```bash
npx jest lib/finance/__tests__/rules.test.ts --no-coverage
```
Expected: PASS all 7 tests.

- [ ] **Step 6: Commit**
```bash
git add -A && git commit -m "feat: add financial rules and formatters"
```

---

### Task 7: Summaries query layer

**Files:**
- Create: `lib/finance/summaries.ts`

- [ ] **Step 1: Create `lib/finance/summaries.ts`**
```typescript
import { db } from "@/lib/db/client";
import { transactions, budgets, monthly_settings, categories } from "@/lib/db/schema";
import { eq, and, sum } from "drizzle-orm";
import { calculateMonthStatus, calculateCategoryStatus } from "./rules";

export async function getMonthSummary(userId: string, month: string) {
  const settings = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)),
  });
  if (!settings) return null;

  const rows = await db
    .select({ total: sum(transactions.amount_usd) })
    .from(transactions)
    .where(and(
      eq(transactions.user_id, userId),
      eq(transactions.month, month),
      eq(transactions.status, "active"),
    ));

  const total_spent_usd = Number(rows[0]?.total ?? 0);
  const ahorro_proyectado_usd = settings.income_usd - total_spent_usd;
  const status = calculateMonthStatus({
    income_usd: settings.income_usd,
    total_spent_usd,
    saving_goal_usd: settings.saving_goal_usd,
    saving_goal_yellow: settings.saving_goal_yellow,
  });

  return {
    income_usd: settings.income_usd,
    total_spent_usd,
    ahorro_proyectado_usd,
    exchange_rate: settings.exchange_rate,
    exchange_rate_source: settings.exchange_rate_source,
    exchange_rate_updated_at: settings.exchange_rate_updated_at,
    saving_goal_usd: settings.saving_goal_usd,
    saving_goal_yellow: settings.saving_goal_yellow,
    status,
  };
}

export async function getCategoryBreakdown(userId: string, month: string) {
  const allCats = await db.query.categories.findMany({
    where: eq(categories.is_active, 1),
    orderBy: (c, { asc }) => asc(c.sort_order),
  });

  const budgetRows = await db.query.budgets.findMany({
    where: and(eq(budgets.user_id, userId), eq(budgets.month, month)),
  });
  const budgetMap = Object.fromEntries(budgetRows.map(b => [b.category_id, b]));

  const spentRows = await db
    .select({ category_id: transactions.category_id, total: sum(transactions.amount_ars) })
    .from(transactions)
    .where(and(
      eq(transactions.user_id, userId),
      eq(transactions.month, month),
      eq(transactions.status, "active"),
    ))
    .groupBy(transactions.category_id);
  const spentMap = Object.fromEntries(spentRows.map(r => [r.category_id, Number(r.total ?? 0)]));

  return allCats.map(cat => {
    const budget = budgetMap[cat.id];
    const budget_ars = budget?.budget_ars ?? 0;
    const hard_limit = budget?.hard_limit ?? 1;
    const gastado_ars = spentMap[cat.id] ?? 0;
    const disponible_ars = budget_ars > 0 ? Math.max(0, budget_ars - gastado_ars) : null;
    const status = calculateCategoryStatus({ gastado_ars, budget_ars });
    return { id: cat.id, slug: cat.slug, name: cat.name, emoji: cat.emoji, budget_ars, hard_limit, gastado_ars, disponible_ars, status };
  });
}
```

- [ ] **Step 2: Commit**
```bash
git add -A && git commit -m "feat: add month summary and category breakdown queries"
```

---

### Task 8: Exchange rate fetcher

**Files:**
- Create: `lib/exchange/ripio.ts`

- [ ] **Step 1: Create `lib/exchange/ripio.ts`**
```typescript
export class RipioFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RipioFetchError";
  }
}

interface RipioRate { ticker: string; sell_rate: string; }

export async function fetchRipioRate(): Promise<number> {
  const res = await fetch("https://app.ripio.com/api/v3/public/rates/?country=AR", {
    headers: {
      "accept": "*/*",
      "origin": "https://www.criptodolar.com",
      "referer": "https://www.criptodolar.com/",
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new RipioFetchError(`Ripio returned HTTP ${res.status}`);

  const data: RipioRate[] = await res.json();
  const usdt = data.find((r) => r.ticker === "USDT_ARS");
  if (!usdt) throw new RipioFetchError("USDT_ARS ticker not found in Ripio response");

  const rate = parseFloat(usdt.sell_rate);
  if (isNaN(rate) || rate <= 0) throw new RipioFetchError(`Invalid sell_rate: ${usdt.sell_rate}`);

  return rate;
}
```

- [ ] **Step 2: Commit**
```bash
git add -A && git commit -m "feat: add Ripio exchange rate fetcher with error handling"
```

---

## Phase 1C — Auth + API Routes

### Task 9: Auth middleware and login/logout

**Files:**
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `middleware.ts`

- [ ] **Step 1: Create `app/api/auth/login/route.ts`**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/utils/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  if (body.token !== process.env.WEB_ACCESS_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.query.users.findFirst();
  if (!user) return NextResponse.json({ error: "No user found. Run seed first." }, { status: 500 });

  const sessionValue = signSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("hermes_session", sessionValue, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
```

- [ ] **Step 2: Create `app/api/auth/logout/route.ts`**
```typescript
import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("hermes_session", "", { maxAge: 0, path: "/" });
  return res;
}
```

- [ ] **Step 3: Create `middleware.ts`**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/utils/session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/telegram/webhook", "/api/cron"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? verifySession(cookie) : null;
  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const res = NextResponse.next();
  res.headers.set("x-user-id", userId);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: Create login page `app/login/page.tsx`**
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) { setError("Token incorrecto."); return; }
      router.push("/dashboard");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle className="text-center">Hermes Finance</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="token">Token de acceso</Label>
              <Input id="token" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat: add auth middleware, login/logout endpoints and login page"
```

---

### Task 10: Transactions API

**Files:**
- Create: `app/api/transactions/route.ts`
- Create: `app/api/transactions/[id]/route.ts`

- [ ] **Step 1: Create `app/api/transactions/route.ts`**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { transactions, budgets, monthly_settings } from "@/lib/db/schema";
import { eq, and, sum } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getActiveMonthArgentina, getArgentinaDate } from "@/lib/utils/dates";
import { calculateCategoryStatus } from "@/lib/finance/rules";

const createSchema = z.object({
  category_id: z.string().uuid(),
  amount_ars: z.number().positive().max(100_000_000),
  merchant: z.string().max(100).optional(),
  description: z.string().max(300).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  is_exception: z.boolean().optional().default(false),
});

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id")!;
  const month = req.nextUrl.searchParams.get("month") ?? getActiveMonthArgentina();

  const rows = await db.query.transactions.findMany({
    where: and(
      eq(transactions.user_id, userId),
      eq(transactions.month, month),
      eq(transactions.status, "active"),
    ),
    orderBy: (t, { desc }) => desc(t.created_at),
    with: { category: true },
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id")!;
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { category_id, amount_ars, merchant, description, is_exception } = parsed.data;
  const month = getActiveMonthArgentina();

  const settings = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)),
  });
  if (!settings) return NextResponse.json({ error: "No hay configuración para el mes activo." }, { status: 400 });

  const budget = await db.query.budgets.findFirst({
    where: and(eq(budgets.user_id, userId), eq(budgets.month, month), eq(budgets.category_id, category_id)),
  });

  if (budget && budget.budget_ars > 0) {
    const spentRows = await db
      .select({ total: sum(transactions.amount_ars) })
      .from(transactions)
      .where(and(eq(transactions.user_id, userId), eq(transactions.month, month), eq(transactions.category_id, category_id), eq(transactions.status, "active")));
    const gastado = Number(spentRows[0]?.total ?? 0);
    const status = calculateCategoryStatus({ gastado_ars: gastado, budget_ars: budget.budget_ars });

    if (status === "CLOSED" && !is_exception) {
      if (budget.hard_limit) {
        return NextResponse.json({ error: "CATEGORY_CLOSED", code: "CATEGORY_CLOSED", message: "Esta categoría superó su presupuesto y tiene límite duro. No se puede agregar el gasto." }, { status: 400 });
      }
      return NextResponse.json({ error: "BUDGET_EXCEEDED_SOFT", code: "BUDGET_EXCEEDED_SOFT", message: "La categoría está cerrada. Podés confirmar la excepción enviando is_exception: true." }, { status: 422 });
    }

    if (!is_exception && gastado + amount_ars > budget.budget_ars && budget.hard_limit) {
      return NextResponse.json({ error: "BUDGET_EXCEEDED_HARD", code: "BUDGET_EXCEEDED_HARD", message: "Este gasto excede el presupuesto y la categoría tiene límite duro." }, { status: 400 });
    }
  }

  const amount_usd = parseFloat((amount_ars / settings.exchange_rate).toFixed(2));
  const today = getArgentinaDate();
  const date = parsed.data.date ?? today.toISOString().slice(0, 10);

  const id = randomUUID();
  await db.insert(transactions).values({
    id, user_id: userId, category_id, amount_ars, amount_usd, merchant: merchant ?? null, description: description ?? null,
    date, month, source: "web", status: "active", is_exception: is_exception ? 1 : 0,
  });

  return NextResponse.json({ id, amount_ars, amount_usd, month }, { status: 201 });
}
```

- [ ] **Step 2: Create `app/api/transactions/[id]/route.ts`** (soft delete)
```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get("x-user-id")!;
  const { id } = await params;

  const tx = await db.query.transactions.findFirst({
    where: and(eq(transactions.id, id), eq(transactions.user_id, userId)),
  });
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tx.status === "deleted") return NextResponse.json({ error: "Already deleted" }, { status: 409 });

  await db.update(transactions)
    .set({ status: "deleted", deleted_at: Date.now() })
    .where(and(eq(transactions.id, id), eq(transactions.user_id, userId)));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "feat: add transactions GET/POST (with budget enforcement) and soft-delete DELETE"
```

---

### Task 11: Settings API endpoints

**Files:**
- Create: `app/api/settings/monthly/route.ts`
- Create: `app/api/settings/thresholds/route.ts`
- Create: `app/api/settings/budgets/route.ts`
- Create: `app/api/settings/exchange-rate/route.ts`
- Create: `app/api/cron/update-exchange-rate/route.ts`

- [ ] **Step 1: Create `app/api/settings/monthly/route.ts`**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { monthly_settings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getActiveMonthArgentina } from "@/lib/utils/dates";
import { randomUUID } from "crypto";

const schema = z.object({
  income_usd: z.number().positive().optional(),
  exchange_rate: z.number().positive().optional(),
  saving_goal_usd: z.number().min(0).optional(),
  saving_goal_yellow: z.number().min(0).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id")!;
  const month = req.nextUrl.searchParams.get("month") ?? getActiveMonthArgentina();
  const settings = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)),
  });
  return NextResponse.json(settings ?? null);
}

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get("x-user-id")!;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const month = parsed.data.month ?? getActiveMonthArgentina();
  const existing = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)),
  });

  if (existing) {
    await db.update(monthly_settings).set({ ...parsed.data, month: undefined }).where(and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)));
  } else {
    await db.insert(monthly_settings).values({ id: randomUUID(), user_id: userId, month, income_usd: 0, exchange_rate: 1, saving_goal_usd: 0, saving_goal_yellow: 0, ...parsed.data });
  }

  const updated = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)),
  });
  return NextResponse.json(updated);
}
```

- [ ] **Step 2: Create `app/api/settings/thresholds/route.ts`**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { monthly_settings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getActiveMonthArgentina } from "@/lib/utils/dates";

const schema = z.object({
  saving_goal_usd: z.number().min(0),
  saving_goal_yellow: z.number().min(0),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get("x-user-id")!;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const month = parsed.data.month ?? getActiveMonthArgentina();
  await db.update(monthly_settings)
    .set({ saving_goal_usd: parsed.data.saving_goal_usd, saving_goal_yellow: parsed.data.saving_goal_yellow })
    .where(and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create `app/api/settings/budgets/route.ts`**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { budgets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getActiveMonthArgentina } from "@/lib/utils/dates";
import { randomUUID } from "crypto";

const schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  items: z.array(z.object({
    category_id: z.string().uuid(),
    budget_ars: z.number().min(0),
    hard_limit: z.boolean().optional().default(true),
  })).min(1),
});

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get("x-user-id")!;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const month = parsed.data.month ?? getActiveMonthArgentina();

  for (const item of parsed.data.items) {
    const existing = await db.query.budgets.findFirst({
      where: and(eq(budgets.user_id, userId), eq(budgets.month, month), eq(budgets.category_id, item.category_id)),
    });
    if (existing) {
      await db.update(budgets).set({ budget_ars: item.budget_ars, hard_limit: item.hard_limit ? 1 : 0 })
        .where(and(eq(budgets.user_id, userId), eq(budgets.month, month), eq(budgets.category_id, item.category_id)));
    } else {
      await db.insert(budgets).values({ id: randomUUID(), user_id: userId, month, category_id: item.category_id, budget_ars: item.budget_ars, hard_limit: item.hard_limit ? 1 : 0 });
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Create `app/api/settings/exchange-rate/route.ts`** (manual override)
```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { monthly_settings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getActiveMonthArgentina } from "@/lib/utils/dates";

const schema = z.object({
  exchange_rate: z.number().positive().max(10_000_000),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get("x-user-id")!;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const month = parsed.data.month ?? getActiveMonthArgentina();
  await db.update(monthly_settings)
    .set({ exchange_rate: parsed.data.exchange_rate, exchange_rate_source: "manual", exchange_rate_updated_at: Date.now() })
    .where(and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Create `app/api/cron/update-exchange-rate/route.ts`**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { monthly_settings, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { fetchRipioRate, RipioFetchError } from "@/lib/exchange/ripio";
import { getActiveMonthArgentina } from "@/lib/utils/dates";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month = getActiveMonthArgentina();
  const user = await db.query.users.findFirst();
  if (!user) return NextResponse.json({ error: "No user" }, { status: 500 });

  let rate: number;
  try {
    rate = await fetchRipioRate();
  } catch (err) {
    const message = err instanceof RipioFetchError ? err.message : "Unknown error";
    const existing = await db.query.monthly_settings.findFirst({
      where: and(eq(monthly_settings.user_id, user.id), eq(monthly_settings.month, month)),
    });
    return NextResponse.json({ error: "RIPIO_UNAVAILABLE", message, lastRate: existing?.exchange_rate ?? null, lastUpdated: existing?.exchange_rate_updated_at ?? null });
  }

  const existing = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.user_id, user.id), eq(monthly_settings.month, month)),
  });

  if (existing) {
    await db.update(monthly_settings)
      .set({ exchange_rate: rate, exchange_rate_source: "ripio", exchange_rate_updated_at: Date.now() })
      .where(and(eq(monthly_settings.user_id, user.id), eq(monthly_settings.month, month)));
  } else {
    await db.insert(monthly_settings).values({
      id: randomUUID(), user_id: user.id, month,
      income_usd: 0, exchange_rate: rate, exchange_rate_source: "ripio",
      exchange_rate_updated_at: Date.now(), saving_goal_usd: 0, saving_goal_yellow: 0,
    });
  }

  return NextResponse.json({ ok: true, rate, month });
}
```

- [ ] **Step 6: Add Vercel cron config `vercel.json`**
```json
{
  "crons": [
    { "path": "/api/cron/update-exchange-rate", "schedule": "0 3 1 * *" }
  ]
}
```
Note: `0 3 1 * *` = midnight ARS time (UTC-3) on the 1st of each month.

- [ ] **Step 7: Commit**
```bash
git add -A && git commit -m "feat: add settings PATCH endpoints and Ripio cron"
```

---

## Phase 1D — Dashboard UI

### Task 12: Dashboard layout + components

**Files:**
- Create: `app/dashboard/layout.tsx`
- Create: `components/dashboard/MonthStatus.tsx`
- Create: `components/dashboard/CategoryCard.tsx`
- Create: `components/dashboard/SummaryBar.tsx`
- Create: `components/dashboard/CategoryDonut.tsx`
- Create: `components/dashboard/SpendingChart.tsx`

- [ ] **Step 1: Create `app/dashboard/layout.tsx`**
```tsx
import { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b px-4 py-3 flex items-center justify-between sticky top-0 bg-background z-10">
        <span className="font-bold text-lg">💰 Hermes</span>
        <nav className="flex gap-2">
          <Link href="/dashboard"><Button variant="ghost" size="sm">Dashboard</Button></Link>
          <Link href="/dashboard/settings"><Button variant="ghost" size="sm">Ajustes</Button></Link>
          <form action="/api/auth/logout" method="POST">
            <Button variant="ghost" size="sm" type="submit">Salir</Button>
          </form>
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/dashboard/MonthStatus.tsx`**
```tsx
"use client";

type Status = "GREEN" | "YELLOW" | "RED";

const labels: Record<Status, string> = {
  GREEN: "🟢 En objetivo",
  YELLOW: "🟡 En alerta",
  RED: "🔴 Fuera de objetivo",
};

const colors: Record<Status, string> = {
  GREEN: "bg-emerald-900/30 border-emerald-500 text-emerald-400",
  YELLOW: "bg-yellow-900/30 border-yellow-500 text-yellow-400",
  RED: "bg-red-900/30 border-red-500 text-red-400",
};

export function MonthStatus({ status, ahorro_usd, saving_goal_usd }: { status: Status; ahorro_usd: number; saving_goal_usd: number }) {
  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${colors[status]}`}>
      <span className="font-semibold text-sm">{labels[status]}</span>
      <span className="text-xs opacity-80">Ahorro: USD {ahorro_usd.toFixed(0)} / meta USD {saving_goal_usd.toFixed(0)}</span>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/dashboard/CategoryCard.tsx`**
```tsx
"use client";

type CatStatus = "OK" | "WARNING" | "CLOSED";

const statusColors: Record<CatStatus, string> = {
  OK: "border-l-emerald-500",
  WARNING: "border-l-yellow-500",
  CLOSED: "border-l-red-500",
};

const statusBadge: Record<CatStatus, string> = {
  OK: "bg-emerald-900/40 text-emerald-400",
  WARNING: "bg-yellow-900/40 text-yellow-400",
  CLOSED: "bg-red-900/40 text-red-400",
};

interface Props {
  name: string; emoji: string; status: CatStatus;
  gastado_ars: number; budget_ars: number; disponible_ars: number | null;
}

export function CategoryCard({ name, emoji, status, gastado_ars, budget_ars, disponible_ars }: Props) {
  const pct = budget_ars > 0 ? Math.min(100, Math.round((gastado_ars / budget_ars) * 100)) : 0;
  return (
    <div className={`rounded-xl border border-l-4 ${statusColors[status]} bg-card p-4 space-y-2`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">{emoji} {name}</span>
        <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${statusBadge[status]}`}>{status}</span>
      </div>
      {budget_ars > 0 && (
        <div className="w-full bg-muted rounded-full h-1.5">
          <div className={`h-1.5 rounded-full transition-all ${status === "CLOSED" ? "bg-red-500" : status === "WARNING" ? "bg-yellow-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Gastado: ${gastado_ars.toLocaleString("es-AR")}</span>
        {budget_ars > 0 && <span>Presupuesto: ${budget_ars.toLocaleString("es-AR")}</span>}
        {disponible_ars !== null && <span>Disp: ${disponible_ars.toLocaleString("es-AR")}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `components/dashboard/SummaryBar.tsx`**
```tsx
"use client";
interface Props { label: string; value: string; sub?: string; }
export function SummaryBar({ label, value, sub }: Props) {
  return (
    <div className="bg-card rounded-xl border p-4 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-bold">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}
```

- [ ] **Step 5: Create `components/dashboard/CategoryDonut.tsx`**
```tsx
"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#10b981","#f59e0b","#3b82f6","#8b5cf6","#f43f5e","#06b6d4","#84cc16","#fb923c","#a78bfa","#e879f9"];

interface CatData { name: string; gastado_ars: number; emoji: string; }

export function CategoryDonut({ data }: { data: CatData[] }) {
  const filtered = data.filter(d => d.gastado_ars > 0);
  if (!filtered.length) return <p className="text-muted-foreground text-sm text-center py-8">Sin gastos registrados</p>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={filtered} dataKey="gastado_ars" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
          {filtered.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => `$${v.toLocaleString("es-AR")}`} />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 6: Create `components/dashboard/SpendingChart.tsx`**
```tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Props { data: { name: string; gastado: number; budget: number; status: string }[] }

const barColor: Record<string, string> = { OK: "#10b981", WARNING: "#f59e0b", CLOSED: "#f43f5e" };

export function SpendingChart({ data }: Props) {
  const filtered = data.filter(d => d.budget > 0 || d.gastado > 0);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={filtered} margin={{ left: 8, right: 8 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
        <Tooltip formatter={(v: number) => `$${v.toLocaleString("es-AR")}`} />
        <Bar dataKey="gastado" name="Gastado" radius={[4,4,0,0]}>
          {filtered.map((d, i) => <Cell key={i} fill={barColor[d.status] ?? "#6366f1"} />)}
        </Bar>
        <Bar dataKey="budget" name="Presupuesto" fill="#334155" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 7: Commit**
```bash
git add -A && git commit -m "feat: add dashboard layout and reusable chart/card components"
```

---

### Task 13: Expense form + CLOSED modal

**Files:**
- Create: `components/forms/ExpenseForm.tsx`
- Create: `components/dashboard/ClosedCategoryModal.tsx`

- [ ] **Step 1: Create `components/dashboard/ClosedCategoryModal.tsx`**
```tsx
"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean; onClose: () => void;
  categoryName: string; isHardLimit: boolean;
  onConfirmException?: () => void;
}

export function ClosedCategoryModal({ open, onClose, categoryName, isHardLimit, onConfirmException }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🔴 Categoría cerrada: {categoryName}</DialogTitle>
          <DialogDescription>
            {isHardLimit
              ? "Esta categoría tiene límite duro y superó su presupuesto mensual. No se puede registrar el gasto."
              : "Esta categoría superó su presupuesto. Podés registrarlo como excepción si es necesario."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!isHardLimit && onConfirmException && (
            <Button variant="destructive" onClick={onConfirmException}>Registrar como excepción</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `components/forms/ExpenseForm.tsx`**
```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClosedCategoryModal } from "@/components/dashboard/ClosedCategoryModal";
import { toast } from "sonner";

interface Category { id: string; slug: string; name: string; emoji: string; status: string; hard_limit: number; }

export function ExpenseForm({ categories, onSuccess }: { categories: Category[]; onSuccess: () => void }) {
  const [amount, setAmount] = useState("");
  const [catId, setCatId] = useState("");
  const [merchant, setMerchant] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [closedModal, setClosedModal] = useState<{ open: boolean; isHard: boolean; name: string } | null>(null);
  const [pendingException, setPendingException] = useState(false);

  async function submit(isException = false) {
    if (!amount || !catId) return toast.error("Monto y categoría requeridos");
    const num = parseFloat(amount.replace(",", "."));
    if (isNaN(num) || num <= 0) return toast.error("Monto inválido");

    setLoading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_ars: num, category_id: catId, merchant, description: desc, is_exception: isException }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "CATEGORY_CLOSED") {
          const cat = categories.find(c => c.id === catId);
          setClosedModal({ open: true, isHard: true, name: cat?.name ?? "" });
          return;
        }
        if (data.code === "BUDGET_EXCEEDED_SOFT") {
          const cat = categories.find(c => c.id === catId);
          setClosedModal({ open: true, isHard: false, name: cat?.name ?? "" });
          setPendingException(true);
          return;
        }
        toast.error(data.message ?? "Error al registrar");
        return;
      }

      toast.success(`$${num.toLocaleString("es-AR")} registrado ✅`);
      setAmount(""); setCatId(""); setMerchant(""); setDesc("");
      setPendingException(false);
      onSuccess();
    } finally { setLoading(false); }
  }

  return (
    <>
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Monto (ARS)</Label>
            <Input type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="47000" />
          </div>
          <div>
            <Label>Categoría</Label>
            <Select value={catId} onValueChange={setCatId}>
              <SelectTrigger><SelectValue placeholder="Seleccioná..." /></SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id} disabled={c.status === "CLOSED" && c.hard_limit === 1}>
                    {c.emoji} {c.name} {c.status === "CLOSED" ? "🔴" : c.status === "WARNING" ? "🟡" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Comercio (opcional)</Label>
          <Input value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="Ej: Carrefour" maxLength={100} />
        </div>
        <div>
          <Label>Descripción (opcional)</Label>
          <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ej: compra semanal" maxLength={300} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : "Registrar gasto"}</Button>
      </form>

      {closedModal && (
        <ClosedCategoryModal
          open={closedModal.open}
          onClose={() => { setClosedModal(null); setPendingException(false); }}
          categoryName={closedModal.name}
          isHardLimit={closedModal.isHard}
          onConfirmException={pendingException ? () => { setClosedModal(null); submit(true); } : undefined}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "feat: add ExpenseForm with budget enforcement modal"
```

---

### Task 14: Dashboard page + settings page

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `app/dashboard/settings/page.tsx`

- [ ] **Step 1: Create `app/dashboard/page.tsx`**
```tsx
import { headers } from "next/headers";
import { getMonthSummary, getCategoryBreakdown } from "@/lib/finance/summaries";
import { db } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getActiveMonthArgentina } from "@/lib/utils/dates";
import { MonthStatus } from "@/components/dashboard/MonthStatus";
import { SummaryBar } from "@/components/dashboard/SummaryBar";
import { CategoryCard } from "@/components/dashboard/CategoryCard";
import { CategoryDonut } from "@/components/dashboard/CategoryDonut";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { ExpenseForm } from "@/components/forms/ExpenseForm";

export default async function DashboardPage() {
  const hdrs = await headers();
  const userId = hdrs.get("x-user-id")!;
  const month = getActiveMonthArgentina();

  const [summary, categories] = await Promise.all([
    getMonthSummary(userId, month),
    getCategoryBreakdown(userId, month),
  ]);

  const recentTx = await db.query.transactions.findMany({
    where: and(eq(transactions.user_id, userId), eq(transactions.month, month), eq(transactions.status, "active")),
    orderBy: (t, { desc }) => desc(t.created_at),
    limit: 10,
    with: { category: true },
  });

  const spentARS = categories.reduce((acc, c) => acc + c.gastado_ars, 0);
  const incomeARS = (summary?.income_usd ?? 0) * (summary?.exchange_rate ?? 1);
  const ahorroARS = incomeARS - spentARS;
  const pctAhorro = incomeARS > 0 ? Math.round((ahorroARS / incomeARS) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard <span className="text-muted-foreground text-base font-normal">{month}</span></h1>
      </div>

      {summary && <MonthStatus status={summary.status} ahorro_usd={summary.ahorro_proyectado_usd} saving_goal_usd={summary.saving_goal_usd} />}

      {summary?.exchange_rate_source !== "ripio" && (
        <div className="text-xs text-yellow-500 bg-yellow-900/20 border border-yellow-700 rounded px-3 py-2">
          ⚠️ Tipo de cambio ingresado manualmente. Actualizar desde Ajustes para usar la cotización Ripio.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryBar label="Ingreso mensual" value={`$${incomeARS.toLocaleString("es-AR")}`} sub={`USD ${summary?.income_usd?.toFixed(0) ?? "—"}`} />
        <SummaryBar label="Gasto total" value={`$${spentARS.toLocaleString("es-AR")}`} />
        <SummaryBar label="Ahorro proyectado" value={`$${ahorroARS.toLocaleString("es-AR")}`} sub={`USD ${summary?.ahorro_proyectado_usd?.toFixed(0) ?? "—"}`} />
        <SummaryBar label="% Ahorro" value={`${pctAhorro}%`} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold mb-3">Gastos por categoría</h2>
          <CategoryDonut data={categories.map(c => ({ name: c.name, gastado_ars: c.gastado_ars, emoji: c.emoji }))} />
        </div>
        <div>
          <h2 className="font-semibold mb-3">Presupuesto vs Gastado</h2>
          <SpendingChart data={categories.map(c => ({ name: c.emoji, gastado: c.gastado_ars, budget: c.budget_ars, status: c.status }))} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold mb-3">Registrar gasto</h2>
          <ExpenseForm categories={categories} onSuccess={() => {}} />
        </div>
        <div>
          <h2 className="font-semibold mb-3">Categorías</h2>
          <div className="space-y-2">
            {categories.map(cat => (
              <CategoryCard key={cat.id} name={cat.name} emoji={cat.emoji} status={cat.status as "OK"|"WARNING"|"CLOSED"} gastado_ars={cat.gastado_ars} budget_ars={cat.budget_ars} disponible_ars={cat.disponible_ars} />
            ))}
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-semibold mb-3">Últimos movimientos</h2>
        <div className="space-y-2">
          {recentTx.length === 0 && <p className="text-muted-foreground text-sm">Sin movimientos este mes.</p>}
          {recentTx.map(tx => (
            <div key={tx.id} className="flex items-center justify-between bg-card border rounded-xl px-4 py-3 text-sm">
              <div>
                <span className="font-medium">{(tx as any).category?.emoji} {(tx as any).category?.name}</span>
                {tx.merchant && <span className="text-muted-foreground ml-2">{tx.merchant}</span>}
              </div>
              <span className="font-semibold">${tx.amount_ars.toLocaleString("es-AR")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/dashboard/settings/page.tsx`**

This page must allow editing: income, exchange rate (manual), saving thresholds, and budgets per category.

```tsx
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<Record<string, { budget_ars: number; hard_limit: boolean }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/monthly").then(r => r.json()),
      fetch("/api/transactions?month=" + new Date().toISOString().slice(0, 7)).then(r => r.json()),
    ]).then(([s]) => setSettings(s));

    fetch("/api/categories").then(r => r.json()).then(setCats);
  }, []);

  async function saveThresholds() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saving_goal_usd: settings.saving_goal_usd, saving_goal_yellow: settings.saving_goal_yellow }),
      });
      if (res.ok) toast.success("Umbrales guardados"); else toast.error("Error al guardar");
    } finally { setSaving(false); }
  }

  async function saveMonthly() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/monthly", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ income_usd: settings.income_usd, exchange_rate: settings.exchange_rate }),
      });
      if (res.ok) toast.success("Configuración mensual guardada"); else toast.error("Error");
    } finally { setSaving(false); }
  }

  async function saveBudgets() {
    setSaving(true);
    try {
      const items = Object.entries(budgets).map(([category_id, b]) => ({ category_id, budget_ars: b.budget_ars, hard_limit: b.hard_limit }));
      const res = await fetch("/api/settings/budgets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (res.ok) toast.success("Presupuestos guardados"); else toast.error("Error");
    } finally { setSaving(false); }
  }

  if (!settings) return <p className="text-muted-foreground text-sm">Cargando...</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      <Card>
        <CardHeader><CardTitle>Configuración mensual</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Ingreso mensual (USD)</Label>
            <Input type="number" value={settings.income_usd} onChange={e => setSettings({ ...settings, income_usd: +e.target.value })} />
          </div>
          <div>
            <Label>Tipo de cambio (ARS por USD)</Label>
            <Input type="number" value={settings.exchange_rate} onChange={e => setSettings({ ...settings, exchange_rate: +e.target.value })} />
          </div>
          <Button onClick={saveMonthly} disabled={saving}>Guardar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Semáforo de ahorro</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Meta verde (USD) — Ahorro objetivo</Label>
            <Input type="number" value={settings.saving_goal_usd} onChange={e => setSettings({ ...settings, saving_goal_usd: +e.target.value })} />
          </div>
          <div>
            <Label>Umbral amarillo (USD) — Alerta de ahorro</Label>
            <Input type="number" value={settings.saving_goal_yellow} onChange={e => setSettings({ ...settings, saving_goal_yellow: +e.target.value })} />
          </div>
          <Button onClick={saveThresholds} disabled={saving}>Guardar umbrales</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Presupuestos por categoría</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {cats.map(cat => (
            <div key={cat.id} className="flex items-center gap-3">
              <span className="w-32 text-sm">{cat.emoji} {cat.name}</span>
              <Input
                type="number" min="0" placeholder="0 = sin límite"
                className="flex-1"
                value={budgets[cat.id]?.budget_ars ?? ""}
                onChange={e => setBudgets(b => ({ ...b, [cat.id]: { ...b[cat.id], budget_ars: +e.target.value, hard_limit: b[cat.id]?.hard_limit ?? true } }))}
              />
              <div className="flex items-center gap-1">
                <Switch
                  checked={budgets[cat.id]?.hard_limit ?? true}
                  onCheckedChange={v => setBudgets(b => ({ ...b, [cat.id]: { ...b[cat.id], hard_limit: v, budget_ars: b[cat.id]?.budget_ars ?? 0 } }))}
                />
                <span className="text-xs text-muted-foreground">Límite duro</span>
              </div>
            </div>
          ))}
          <Button onClick={saveBudgets} disabled={saving}>Guardar presupuestos</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Add categories API `app/api/categories/route.ts`**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const cats = await db.query.categories.findMany({
    where: eq(categories.is_active, 1),
    orderBy: (c, { asc }) => asc(c.sort_order),
  });
  return NextResponse.json(cats);
}
```

- [ ] **Step 4: Add dark mode class to `app/layout.tsx`**

Set `<html className="dark">` (forced dark) or configure `next-themes` for toggle. Minimal approach:
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = { title: "Hermes Finance", description: "Asistente financiero personal" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className={inter.className}>{children}<Toaster richColors /></body>
    </html>
  );
}
```

- [ ] **Step 5: Verify app compiles**
```bash
npm run build
```
Expected: no TypeScript errors, build succeeds.

- [ ] **Step 6: Write README.md**

Create `README.md` at repo root with:
- Installation steps
- `.env.example` setup
- `db:generate`, `db:migrate`, `db:seed` usage
- Local dev: `npm run dev`
- Deploy on Vercel instructions
- Telegram bot webhook setup
- Example commands section

- [ ] **Step 7: Commit**
```bash
git add -A && git commit -m "feat: add dashboard page, settings page, and app layout with dark mode"
```

---

## Phase 2 — Telegram Bot

### Task 15: Telegram send-message + formatters

**Files:**
- Create: `lib/telegram/send-message.ts`
- Create: `lib/telegram/formatters.ts`

- [ ] **Step 1: Create `lib/telegram/send-message.ts`**
```typescript
export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }
}
```

- [ ] **Step 2: Create `lib/telegram/formatters.ts`**
```typescript
import { formatARS, formatUSD } from "@/lib/finance/formatters";

export function formatTransactionConfirm(params: {
  amount_ars: number; category: string; emoji: string;
  gastado_ars: number; budget_ars: number; disponible_ars: number | null;
  status: string; ahorro_proyectado_usd: number;
}): string {
  const lines = [
    `✅ Registrado: ${formatARS(params.amount_ars)} en ${params.emoji} ${params.category}.`,
    ``,
    `<b>${params.emoji} ${params.category} — este mes:</b>`,
    `Presupuesto: ${params.budget_ars > 0 ? formatARS(params.budget_ars) : "Sin límite"}`,
    `Gastado: ${formatARS(params.gastado_ars)}`,
    params.disponible_ars !== null ? `Disponible: ${formatARS(params.disponible_ars)}` : "",
    `Estado: ${params.status === "OK" ? "🟢 OK" : params.status === "WARNING" ? "🟡 WARNING" : "🔴 CLOSED"}`,
    ``,
    `💰 Ahorro proyectado: ${formatUSD(params.ahorro_proyectado_usd)}`,
  ];
  return lines.filter(l => l !== null && l !== undefined).join("\n");
}

export function formatResumen(params: {
  month: string; income_usd: number; total_spent_usd: number;
  ahorro_proyectado_usd: number; status: string; exchange_rate: number;
}): string {
  const icon = params.status === "GREEN" ? "��" : params.status === "YELLOW" ? "🟡" : "🔴";
  return [
    `<b>📊 Resumen ${params.month}</b>`,
    ``,
    `Ingreso: ${formatUSD(params.income_usd)}`,
    `Gastado: ${formatUSD(params.total_spent_usd)}`,
    `Ahorro proyectado: ${formatUSD(params.ahorro_proyectado_usd)}`,
    `Tipo de cambio: $${params.exchange_rate.toLocaleString("es-AR")}`,
    ``,
    `Estado: ${icon} ${params.status}`,
  ].join("\n");
}

export function formatDisponible(params: {
  category: string; emoji: string;
  budget_ars: number; gastado_ars: number; disponible_ars: number | null; status: string;
}): string {
  return [
    `<b>${params.emoji} ${params.category}</b>`,
    `Presupuesto: ${params.budget_ars > 0 ? formatARS(params.budget_ars) : "Sin límite"}`,
    `Gastado: ${formatARS(params.gastado_ars)}`,
    params.disponible_ars !== null ? `Disponible: ${formatARS(params.disponible_ars)}` : "Sin límite definido",
    `Estado: ${params.status === "OK" ? "🟢 OK" : params.status === "WARNING" ? "🟡 WARNING" : "🔴 CLOSED"}`,
  ].join("\n");
}
```

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "feat: add Telegram send-message and response formatters"
```

---

### Task 16: Telegram command handlers

**Files:**
- Create: `lib/telegram/handlers.ts`

- [ ] **Step 1: Create `lib/telegram/handlers.ts`**
```typescript
import { db } from "@/lib/db/client";
import { transactions, categories, bot_messages } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getActiveMonthArgentina, getArgentinaDate } from "@/lib/utils/dates";
import { getMonthSummary, getCategoryBreakdown } from "@/lib/finance/summaries";
import { calculateCategoryStatus } from "@/lib/finance/rules";
import { formatTransactionConfirm, formatResumen, formatDisponible } from "./formatters";
import { randomUUID } from "crypto";
import { sum } from "drizzle-orm";

const pendingExceptions = new Map<string, { category_id: string; amount_ars: number; merchant?: string }>();

export async function handleTelegramMessage(update: any, userId: string): Promise<string> {
  const msg = update.message;
  const text = (msg?.text ?? "").trim();
  const chatId = String(msg.chat.id);
  const telegramUserId = String(msg.from.id);
  const updateId = String(update.update_id);
  const month = getActiveMonthArgentina();

  if (text === "/start") {
    return "👋 Hola! Soy Hermes Finance.\n\nComandos:\n/gasto monto categoria descripcion\n/resumen\n/disponible categoria\n/ultimo\n/borrar_ultimo";
  }

  if (text === "/resumen") {
    const summary = await getMonthSummary(userId, month);
    if (!summary) return "No hay configuración para este mes. Configurá desde la web.";
    return formatResumen({ month, ...summary });
  }

  if (text.startsWith("/disponible")) {
    const slug = text.split(" ")[1]?.toLowerCase();
    if (!slug) return "Uso: /disponible categoria\nEjemplo: /disponible supermercado";

    const cat = await db.query.categories.findFirst({ where: eq(categories.slug, slug) });
    if (!cat) return `No encontré la categoría "${slug}".`;

    const breakdown = await getCategoryBreakdown(userId, month);
    const catData = breakdown.find(c => c.id === cat.id);
    if (!catData) return `Sin datos para ${cat.name} este mes.`;

    return formatDisponible({ category: catData.name, emoji: catData.emoji, budget_ars: catData.budget_ars, gastado_ars: catData.gastado_ars, disponible_ars: catData.disponible_ars, status: catData.status });
  }

  if (text === "/ultimo") {
    const last = await db.query.transactions.findFirst({
      where: and(eq(transactions.user_id, userId), eq(transactions.month, month), eq(transactions.status, "active")),
      orderBy: (t, { desc }) => desc(t.created_at),
      with: { category: true },
    });
    if (!last) return "No hay transacciones activas este mes.";
    return `Último: ${(last as any).category?.emoji} ${(last as any).category?.name} — $${last.amount_ars.toLocaleString("es-AR")}${last.merchant ? ` (${last.merchant})` : ""} — ${last.date}`;
  }

  if (text === "/borrar_ultimo") {
    const last = await db.query.transactions.findFirst({
      where: and(eq(transactions.user_id, userId), eq(transactions.month, month), eq(transactions.status, "active")),
      orderBy: (t, { desc }) => desc(t.created_at),
    });
    if (!last) return "No hay transacciones activas para borrar.";
    await db.update(transactions).set({ status: "deleted", deleted_at: Date.now() }).where(eq(transactions.id, last.id));
    return `✅ Eliminado: $${last.amount_ars.toLocaleString("es-AR")} del ${last.date}`;
  }

  if (text === "/confirmar" && pendingExceptions.has(chatId)) {
    const pending = pendingExceptions.get(chatId)!;
    pendingExceptions.delete(chatId);
    return await registerTransaction(userId, pending.category_id, pending.amount_ars, pending.merchant, month, true);
  }

  if (text === "/cancelar") {
    pendingExceptions.delete(chatId);
    return "Cancelado.";
  }

  if (text.startsWith("/gasto")) {
    const parts = text.split(" ");
    if (parts.length < 3) return "Uso: /gasto monto categoria descripcion\nEjemplo: /gasto 47000 supermercado Cordiez";

    const amount_ars = parseFloat(parts[1].replace(",", "."));
    if (isNaN(amount_ars) || amount_ars <= 0) return "Monto inválido. Usá un número positivo, ej: /gasto 47000 supermercado";

    const slug = parts[2].toLowerCase();
    const merchant = parts.slice(3).join(" ") || undefined;

    const cat = await db.query.categories.findFirst({ where: eq(categories.slug, slug) });
    if (!cat) return `Categoría "${slug}" no encontrada.\nCategorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, viaje, compras_personales, imprevistos`;

    const settings = await db.query.monthly_settings.findFirst({ where: and(eq((await import("@/lib/db/schema")).monthly_settings.user_id, userId), eq((await import("@/lib/db/schema")).monthly_settings.month, month)) });
    if (!settings) return "Sin configuración mensual. Configurá desde la web.";

    const budget = await db.query.budgets.findFirst({ where: and(eq((await import("@/lib/db/schema")).budgets.user_id, userId), eq((await import("@/lib/db/schema")).budgets.month, month), eq((await import("@/lib/db/schema")).budgets.category_id, cat.id)) });

    if (budget && budget.budget_ars > 0) {
      const spentRows = await db.select({ total: sum(transactions.amount_ars) }).from(transactions)
        .where(and(eq(transactions.user_id, userId), eq(transactions.month, month), eq(transactions.category_id, cat.id), eq(transactions.status, "active")));
      const gastado = Number(spentRows[0]?.total ?? 0);
      const status = calculateCategoryStatus({ gastado_ars: gastado, budget_ars: budget.budget_ars });

      if (status === "CLOSED") {
        if (budget.hard_limit) return `🔴 ${cat.name} está CERRADA con límite duro. No se puede registrar.`;
        pendingExceptions.set(chatId, { category_id: cat.id, amount_ars, merchant });
        return `⚠️ ${cat.name} está CERRADA (sin límite duro).\nGastado: $${gastado.toLocaleString("es-AR")} / $${budget.budget_ars.toLocaleString("es-AR")}\nRespode /confirmar para registrar como excepción o /cancelar para cancelar.`;
      }
    }

    return await registerTransaction(userId, cat.id, amount_ars, merchant, month, false);
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return "Por ahora usá el formato: /gasto monto categoria descripción";
  }

  const { parseFinancialMessage } = await import("@/lib/ai/parse-message");
  const parsed = await parseFinancialMessage(text);
  if (parsed.intent === "unknown" || parsed.confidence < 0.7) {
    return "No entendí el mensaje. Usá: /gasto monto categoria descripción";
  }
  return "Entendí tu mensaje. Confirmación de AI pendiente de implementación completa.";
}

async function registerTransaction(userId: string, category_id: string, amount_ars: number, merchant: string | undefined, month: string, is_exception: boolean): Promise<string> {
  const { monthly_settings: ms } = await import("@/lib/db/schema");
  const settings = await db.query.monthly_settings.findFirst({
    where: and(eq(ms.user_id, userId), eq(ms.month, month)),
  });
  if (!settings) return "Sin configuración mensual.";

  const amount_usd = parseFloat((amount_ars / settings.exchange_rate).toFixed(2));
  const date = getArgentinaDate().toISOString().slice(0, 10);

  await db.insert(transactions).values({
    id: randomUUID(), user_id: userId, category_id, amount_ars, amount_usd,
    merchant: merchant ?? null, description: null, date, month,
    source: "telegram", status: "active", is_exception: is_exception ? 1 : 0,
  });

  const { budgets } = await import("@/lib/db/schema");
  const budget = await db.query.budgets.findFirst({
    where: and(eq(budgets.user_id, userId), eq(budgets.month, month), eq(budgets.category_id, category_id)),
  });

  const spentRows = await db.select({ total: sum(transactions.amount_ars) }).from(transactions)
    .where(and(eq(transactions.user_id, userId), eq(transactions.month, month), eq(transactions.category_id, category_id), eq(transactions.status, "active")));
  const gastado_ars = Number(spentRows[0]?.total ?? 0);
  const budget_ars = budget?.budget_ars ?? 0;
  const disponible_ars = budget_ars > 0 ? Math.max(0, budget_ars - gastado_ars) : null;
  const status = calculateCategoryStatus({ gastado_ars, budget_ars });

  const cat = await db.query.categories.findFirst({ where: eq((await import("@/lib/db/schema")).categories.id, category_id) });

  const summary = await getMonthSummary(userId, month);

  return formatTransactionConfirm({
    amount_ars, category: cat?.name ?? "—", emoji: cat?.emoji ?? "📦",
    gastado_ars, budget_ars, disponible_ars, status,
    ahorro_proyectado_usd: summary?.ahorro_proyectado_usd ?? 0,
  });
}
```

- [ ] **Step 2: Commit**
```bash
git add -A && git commit -m "feat: add Telegram command handlers (gasto, resumen, disponible, ultimo, borrar_ultimo)"
```

---

### Task 17: Telegram webhook route

**Files:**
- Create: `app/api/telegram/webhook/route.ts`

- [ ] **Step 1: Create `app/api/telegram/webhook/route.ts`**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users, bot_messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendTelegramMessage } from "@/lib/telegram/send-message";
import { handleTelegramMessage } from "@/lib/telegram/handlers";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_SECRET_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  if (!update?.message) return NextResponse.json({ ok: true });

  const telegramUserId = String(update.message.from?.id);
  const allowedId = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (telegramUserId !== allowedId) {
    return NextResponse.json({ ok: true });
  }

  const updateId = String(update.update_id);
  const existing = await db.query.bot_messages.findFirst({
    where: eq(bot_messages.telegram_update_id, updateId),
  });
  if (existing) return NextResponse.json({ ok: true });

  const user = await db.query.users.findFirst();
  if (!user) return NextResponse.json({ error: "No user" }, { status: 500 });

  let response_text = "Error interno.";
  try {
    response_text = await handleTelegramMessage(update, user.id);
  } catch (err) {
    console.error("Telegram handler error:", err);
    response_text = "Error procesando el mensaje.";
  }

  await db.insert(bot_messages).values({
    id: randomUUID(),
    user_id: user.id,
    telegram_chat_id: String(update.message.chat.id),
    telegram_user_id: telegramUserId,
    telegram_update_id: updateId,
    raw_text: update.message.text ?? "",
    parsed_intent: null,
    response_text,
  }).onConflictDoNothing();

  await sendTelegramMessage(String(update.message.chat.id), response_text).catch(console.error);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**
```bash
git add -A && git commit -m "feat: add Telegram webhook route with secret validation and dedup"
```

---

## Phase 3 — AI Layer (Groq)

### Task 18: Groq client + message parser

**Files:**
- Create: `lib/ai/groq.ts`
- Create: `lib/ai/parse-message.ts`

- [ ] **Step 1: Create `lib/ai/groq.ts`**
```typescript
export function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GROQ_MODEL ?? "llama3-8b-8192";

  return {
    async complete(systemPrompt: string, userPrompt: string): Promise<string> {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0,
          max_tokens: 300,
        }),
      });

      if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    },
  };
}
```

- [ ] **Step 2: Create `lib/ai/parse-message.ts`**
```typescript
import { getGroqClient } from "./groq";
import { z } from "zod";

const ParsedMessageSchema = z.object({
  intent: z.enum(["register_expense", "query_summary", "query_available", "delete_last", "unknown"]),
  amount_ars: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  merchant: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  date_text: z.string().nullable().optional(),
  needs_confirmation: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
});

export type ParsedMessage = z.infer<typeof ParsedMessageSchema>;

const SYSTEM_PROMPT = `Sos un asistente financiero. Analiza el mensaje del usuario y devolvé SOLO JSON válido con:
- intent: "register_expense" | "query_summary" | "query_available" | "delete_last" | "unknown"
- amount_ars: número en pesos o null
- category: slug de categoría o null (opciones: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, viaje, compras_personales, imprevistos)
- merchant: nombre del comercio o null
- description: descripción breve o null
- date_text: referencia a fecha en texto o null
- needs_confirmation: true si necesita confirmación
- confidence: 0.0 a 1.0

Responde SOLO con el JSON, sin markdown ni explicaciones.`;

export async function parseFinancialMessage(text: string): Promise<ParsedMessage> {
  const client = getGroqClient();
  if (!client) {
    return { intent: "unknown", confidence: 0, needs_confirmation: false };
  }

  try {
    const raw = await client.complete(SYSTEM_PROMPT, text);
    const json = JSON.parse(raw.trim());
    return ParsedMessageSchema.parse(json);
  } catch {
    return { intent: "unknown", confidence: 0, needs_confirmation: false };
  }
}
```

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "feat: add Groq client and parseFinancialMessage with schema validation"
```

---

## Acceptance Criteria

Run these checks after completing all phases to confirm the MVP is functional:

- [ ] `npm run build` completes with 0 TypeScript errors
- [ ] `npm run db:migrate` runs without error
- [ ] `npm run db:seed` outputs `✅ Seed complete`
- [ ] `npm run dev` starts on port 3000
- [ ] GET `/login` → shows login form
- [ ] POST `/api/auth/login` with correct `WEB_ACCESS_TOKEN` → sets `hermes_session` httpOnly cookie
- [ ] GET `/dashboard` without cookie → redirects to `/login`
- [ ] GET `/dashboard` with valid cookie → renders dashboard with month summary
- [ ] POST `/api/transactions` with valid body → creates transaction, returns 201
- [ ] POST `/api/transactions` for CLOSED hard-limit category → returns 400 `CATEGORY_CLOSED`
- [ ] POST `/api/transactions` for CLOSED soft-limit category → returns 422 `BUDGET_EXCEEDED_SOFT`; retry with `is_exception: true` → 201
- [ ] DELETE `/api/transactions/:id` → soft deletes (status = "deleted"), transaction no longer appears in summaries
- [ ] GET `/api/settings/monthly` → returns current month settings
- [ ] PATCH `/api/settings/thresholds` → updates saving thresholds, semáforo reflects changes on next load
- [ ] PATCH `/api/settings/budgets` → updates category budgets
- [ ] GET `/api/cron/update-exchange-rate` with `Authorization: Bearer CRON_SECRET` → fetches Ripio rate, updates DB
- [ ] Ripio unavailable → cron returns `RIPIO_UNAVAILABLE` with `lastRate`; dashboard shows warning banner if source ≠ "ripio"
- [ ] POST `/api/telegram/webhook` without secret → 401
- [ ] POST `/api/telegram/webhook` from unauthorized user → ignored (200)
- [ ] `/gasto 47000 supermercado Cordiez` → transaction inserted, response includes category status and ahorro proyectado
- [ ] `/resumen` → returns formatted monthly summary
- [ ] `/disponible supermercado` → returns budget, spent, and available for category
- [ ] `/ultimo` → returns last active transaction
- [ ] `/borrar_ultimo` → soft deletes last transaction, confirms deletion
- [ ] Duplicate `update_id` → idempotent, no duplicate transaction inserted
- [ ] `GROQ_API_KEY` not set → `parseFinancialMessage` returns `intent: "unknown"` without making HTTP call
- [ ] `GROQ_API_KEY` set → `parseFinancialMessage` returns parsed JSON with intent and confidence

---

*Plan complete. Saved to `docs/superpowers/plans/2026-05-27-hermes-finance-implementation.md`*
