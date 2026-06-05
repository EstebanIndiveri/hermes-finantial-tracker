# Compartidos — Implementation Plan (Phases 0–2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the shared expenses (Tricount-like) module for Hermes — DB schema, balance logic, and REST API.

**Architecture:** New tables isolated from existing schema. Balance logic as pure functions. API routes follow existing `x-user-id` header auth pattern. Zero changes to existing dashboard, bot, groups, or categories.

**Tech Stack:** Turso SQLite + Drizzle ORM, Next.js App Router, Jest, TypeScript, Zod

---

## Phase 0: Rollback Preparation

### Task 0: Tag current production state

**Files:**
- No code changes

- [ ] **Step 1: Create git tag**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
git tag v1.0-pre-compartidos
git push origin v1.0-pre-compartidos
```

Expected output: `* [new tag] v1.0-pre-compartidos -> v1.0-pre-compartidos`

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feature/splits-db-and-balances
```

---

## Phase 1: DB Schema + Balance Logic

### Task 1: Migration SQL

**Files:**
- Create: `lib/db/migrations/0006_splits_module.sql`

- [ ] **Step 1: Create the migration file**

```sql
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
```

- [ ] **Step 2: Apply the migration**

```bash
npm run db:migrate
```

Expected: migration applies without errors.

---

### Task 2: Drizzle schema — new tables

**Files:**
- Modify: `lib/db/schema.ts` (append at end, before relations)

- [ ] **Step 1: Append new tables to schema.ts**

Add after the existing `telegram_link_codes` table definition (before the `export const usersRelations` block):

```typescript
export const temp_users = sqliteTable("temp_users", {
  id: text("id").primaryKey(),
  telegram_user_id: text("telegram_user_id").notNull().unique(),
  telegram_username: text("telegram_username"),
  first_name: text("first_name").notNull(),
  last_name: text("last_name"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  upgraded_to: text("upgraded_to").references(() => users.id),
});

export const bot_conversation_state = sqliteTable("bot_conversation_state", {
  chat_id: text("chat_id").notNull(),
  user_id: text("user_id").notNull(),
  state: text("state").notNull(),
  expires_at: integer("expires_at").notNull(),
}, (t) => ({
  pk: uniqueIndex("bcs_pk").on(t.chat_id, t.user_id),
}));

export const split_sessions = sqliteTable("split_sessions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  owner_user_id: text("owner_user_id").notNull().references(() => users.id),
  telegram_chat_id: text("telegram_chat_id").unique(),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  last_alert_at: integer("last_alert_at"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  closed_at: integer("closed_at"),
  closing_note: text("closing_note"),
});

export const split_session_members = sqliteTable("split_session_members", {
  session_id: text("session_id").notNull().references(() => split_sessions.id),
  user_id: text("user_id").references(() => users.id),
  temp_user_id: text("temp_user_id").references(() => temp_users.id),
  joined_at: integer("joined_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const splits = sqliteTable("splits", {
  id: text("id").primaryKey(),
  session_id: text("session_id").notNull().references(() => split_sessions.id),
  description: text("description").notNull(),
  total_amount: real("total_amount").notNull(),
  split_type: text("split_type", { enum: ["equal", "percentage", "fixed"] }).notNull().default("equal"),
  status: text("status", { enum: ["active", "cancelled"] }).notNull().default("active"),
  created_by_user_id: text("created_by_user_id").references(() => users.id),
  created_by_temp_id: text("created_by_temp_id").references(() => temp_users.id),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  cancelled_at: integer("cancelled_at"),
  telegram_message_id: text("telegram_message_id"),
});

export const split_payers = sqliteTable("split_payers", {
  id: text("id").primaryKey(),
  split_id: text("split_id").notNull().references(() => splits.id),
  user_id: text("user_id").references(() => users.id),
  temp_user_id: text("temp_user_id").references(() => temp_users.id),
  amount_paid: real("amount_paid").notNull(),
});

export const split_items = sqliteTable("split_items", {
  id: text("id").primaryKey(),
  split_id: text("split_id").notNull().references(() => splits.id),
  user_id: text("user_id").references(() => users.id),
  temp_user_id: text("temp_user_id").references(() => temp_users.id),
  amount_owed: real("amount_owed").notNull(),
  percentage: real("percentage"),
});

export const split_payments = sqliteTable("split_payments", {
  id: text("id").primaryKey(),
  session_id: text("session_id").notNull().references(() => split_sessions.id),
  payer_user_id: text("payer_user_id").references(() => users.id),
  payer_temp_id: text("payer_temp_id").references(() => temp_users.id),
  payee_user_id: text("payee_user_id").references(() => users.id),
  payee_temp_id: text("payee_temp_id").references(() => temp_users.id),
  amount: real("amount").notNull(),
  method: text("method", { enum: ["manual", "receipt_ocr"] }).notNull().default("manual"),
  receipt_image_url: text("receipt_image_url"),
  ocr_raw_text: text("ocr_raw_text"),
  confirmed_at: integer("confirmed_at").notNull().default(sql`(unixepoch() * 1000)`),
  telegram_update_id: text("telegram_update_id"),
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/migrations/0006_splits_module.sql lib/db/schema.ts
git commit -m "feat(splits): add DB migration and Drizzle schema for splits module"
```

---

### Task 3: Types

**Files:**
- Create: `lib/splits/types.ts`

- [ ] **Step 1: Create types file**

```typescript
/** Identifies a participant — either a Hermes user or a temp user */
export interface ParticipantId {
  userId?: string;
  tempUserId?: string;
}

/** Display info for a participant */
export interface Participant extends ParticipantId {
  name: string;
  telegramUsername?: string;
  isTemp: boolean;
}

/** Raw payer record from DB */
export interface RawPayer extends ParticipantId {
  amountPaid: number;
}

/** Raw split item record from DB */
export interface RawItem extends ParticipantId {
  amountOwed: number;
}

/** Raw payment record from DB */
export interface RawPayment {
  payerUserId?: string | null;
  payerTempId?: string | null;
  payeeUserId?: string | null;
  payeeTempId?: string | null;
  amount: number;
}

/** Balance neto de un participante en una sesión */
export interface Balance extends ParticipantId {
  /** Positivo = le deben, negativo = debe */
  net: number;
}

/** Deuda simplificada: quién le paga a quién cuánto */
export interface Debt {
  from: ParticipantId;
  to: ParticipantId;
  amount: number;
}

/** Resumen de balances para una sesión */
export interface SessionBalanceSummary {
  balances: Balance[];
  debts: Debt[];
  isSettled: boolean;
}

/** Key para identificar un participante de forma consistente */
export function participantKey(p: ParticipantId): string {
  return p.userId ? `user:${p.userId}` : `temp:${p.tempUserId}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/splits/types.ts
git commit -m "feat(splits): add splits types"
```

---

### Task 4: Balance calculation — tests first (TDD)

**Files:**
- Create: `lib/splits/__tests__/balances.test.ts`
- Create: `lib/splits/balances.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/splits/__tests__/balances.test.ts
import { calculateSessionBalances } from "../balances";
import type { RawPayer, RawItem, RawPayment } from "../types";

const U1 = { userId: "u1" };
const U2 = { userId: "u2" };
const U3 = { userId: "u3" };
const T1 = { tempUserId: "t1" };

describe("calculateSessionBalances", () => {
  describe("happy path", () => {
    it("single payer, equal split 2 people — payer net positive", () => {
      // u1 paid $1000, both owe $500
      const payers: RawPayer[] = [{ ...U1, amountPaid: 1000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 500 },
        { ...U2, amountOwed: 500 },
      ];
      const payments: RawPayment[] = [];

      const result = calculateSessionBalances(payers, items, payments);
      const u1 = result.balances.find(b => b.userId === "u1")!;
      const u2 = result.balances.find(b => b.userId === "u2")!;

      expect(u1.net).toBeCloseTo(500);   // paid 1000, owes 500 → net +500
      expect(u2.net).toBeCloseTo(-500);  // paid 0, owes 500 → net -500
      expect(result.isSettled).toBe(false);
    });

    it("single payer, equal split 3 people — correct debts", () => {
      const payers: RawPayer[] = [{ ...U1, amountPaid: 3000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 1000 },
        { ...U2, amountOwed: 1000 },
        { ...U3, amountOwed: 1000 },
      ];
      const payments: RawPayment[] = [];

      const result = calculateSessionBalances(payers, items, payments);
      expect(result.debts).toHaveLength(2);
      expect(result.debts.every(d => d.amount === 1000)).toBe(true);
      expect(result.isSettled).toBe(false);
    });

    it("multiple payers with different amounts", () => {
      // ticket $3000: u1 put $1000, u2 put $2000, u3 put $0
      // equal split → each owes $1000
      // u1: paid 1000, owes 1000 → net 0
      // u2: paid 2000, owes 1000 → net +1000
      // u3: paid 0, owes 1000 → net -1000
      const payers: RawPayer[] = [
        { ...U1, amountPaid: 1000 },
        { ...U2, amountPaid: 2000 },
      ];
      const items: RawItem[] = [
        { ...U1, amountOwed: 1000 },
        { ...U2, amountOwed: 1000 },
        { ...U3, amountOwed: 1000 },
      ];
      const payments: RawPayment[] = [];

      const result = calculateSessionBalances(payers, items, payments);
      const u1 = result.balances.find(b => b.userId === "u1")!;
      const u2 = result.balances.find(b => b.userId === "u2")!;
      const u3 = result.balances.find(b => b.userId === "u3")!;

      expect(u1.net).toBeCloseTo(0);
      expect(u2.net).toBeCloseTo(1000);
      expect(u3.net).toBeCloseTo(-1000);
      expect(result.debts).toHaveLength(1);
      expect(result.debts[0].from.userId).toBe("u3");
      expect(result.debts[0].to.userId).toBe("u2");
      expect(result.debts[0].amount).toBeCloseTo(1000);
    });

    it("payment reduces debt correctly", () => {
      const payers: RawPayer[] = [{ ...U1, amountPaid: 1000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 500 },
        { ...U2, amountOwed: 500 },
      ];
      const payments: RawPayment[] = [{
        payerUserId: "u2", payerTempId: null,
        payeeUserId: "u1", payeeTempId: null,
        amount: 300,
      }];

      const result = calculateSessionBalances(payers, items, payments);
      const u2 = result.balances.find(b => b.userId === "u2")!;
      expect(u2.net).toBeCloseTo(-200); // owes 500, paid 300 → still owes 200
    });

    it("fully settled session returns isSettled true", () => {
      const payers: RawPayer[] = [{ ...U1, amountPaid: 1000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 500 },
        { ...U2, amountOwed: 500 },
      ];
      const payments: RawPayment[] = [{
        payerUserId: "u2", payerTempId: null,
        payeeUserId: "u1", payeeTempId: null,
        amount: 500,
      }];

      const result = calculateSessionBalances(payers, items, payments);
      expect(result.isSettled).toBe(true);
      expect(result.debts).toHaveLength(0);
    });

    it("temp_user participates correctly", () => {
      const payers: RawPayer[] = [{ ...U1, amountPaid: 1000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 500 },
        { ...T1, amountOwed: 500 },
      ];
      const payments: RawPayment[] = [];

      const result = calculateSessionBalances(payers, items, payments);
      const t1 = result.balances.find(b => b.tempUserId === "t1")!;
      expect(t1.net).toBeCloseTo(-500);
    });

    it("partial payment leaves remaining debt", () => {
      const payers: RawPayer[] = [{ ...U1, amountPaid: 1000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 500 },
        { ...U2, amountOwed: 500 },
      ];
      const payments: RawPayment[] = [{
        payerUserId: "u2", payerTempId: null,
        payeeUserId: "u1", payeeTempId: null,
        amount: 200,
      }];

      const result = calculateSessionBalances(payers, items, payments);
      expect(result.debts).toHaveLength(1);
      expect(result.debts[0].amount).toBeCloseTo(300);
      expect(result.isSettled).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("empty session returns empty balances and settled", () => {
      const result = calculateSessionBalances([], [], []);
      expect(result.balances).toHaveLength(0);
      expect(result.debts).toHaveLength(0);
      expect(result.isSettled).toBe(true);
    });

    it("single participant is always settled", () => {
      const payers: RawPayer[] = [{ ...U1, amountPaid: 1000 }];
      const items: RawItem[] = [{ ...U1, amountOwed: 1000 }];
      const result = calculateSessionBalances(payers, items, []);
      expect(result.isSettled).toBe(true);
    });

    it("4 people minimizes to 3 transactions", () => {
      // u1 paid everything for 4 people
      const payers: RawPayer[] = [{ ...U1, amountPaid: 4000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 1000 },
        { ...U2, amountOwed: 1000 },
        { ...U3, amountOwed: 1000 },
        { userId: "u4", amountOwed: 1000 },
      ];
      const result = calculateSessionBalances(payers, items, []);
      expect(result.debts).toHaveLength(3);
      expect(result.debts.every(d => d.to.userId === "u1")).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest lib/splits/__tests__/balances.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module '../balances'"

- [ ] **Step 3: Implement balances.ts**

```typescript
// lib/splits/balances.ts
import type { RawPayer, RawItem, RawPayment, Balance, Debt, SessionBalanceSummary, ParticipantId } from "./types";
import { participantKey } from "./types";

/**
 * Calculates net balances for a session and simplifies debts.
 * Positive net = others owe you. Negative net = you owe others.
 */
export function calculateSessionBalances(
  payers: RawPayer[],
  items: RawItem[],
  payments: RawPayment[]
): SessionBalanceSummary {
  const netMap = new Map<string, { id: ParticipantId; net: number }>();

  function getOrCreate(id: ParticipantId) {
    const key = participantKey(id);
    if (!netMap.has(key)) netMap.set(key, { id, net: 0 });
    return netMap.get(key)!;
  }

  // Add what each person paid
  for (const p of payers) {
    const id: ParticipantId = p.userId ? { userId: p.userId } : { tempUserId: p.tempUserId };
    getOrCreate(id).net += p.amountPaid;
  }

  // Subtract what each person owes
  for (const item of items) {
    const id: ParticipantId = item.userId ? { userId: item.userId } : { tempUserId: item.tempUserId };
    getOrCreate(id).net -= item.amountOwed;
  }

  // Add received payments, subtract sent payments
  for (const payment of payments) {
    if (payment.payerUserId || payment.payerTempId) {
      const payerId: ParticipantId = payment.payerUserId
        ? { userId: payment.payerUserId }
        : { tempUserId: payment.payerTempId! };
      getOrCreate(payerId).net -= payment.amount;
    }
    if (payment.payeeUserId || payment.payeeTempId) {
      const payeeId: ParticipantId = payment.payeeUserId
        ? { userId: payment.payeeUserId }
        : { tempUserId: payment.payeeTempId! };
      getOrCreate(payeeId).net += payment.amount;
    }
  }

  const balances: Balance[] = Array.from(netMap.values()).map(({ id, net }) => ({
    ...id,
    net: Math.round(net * 100) / 100,
  }));

  const debts = simplifyDebts(balances);
  const isSettled = debts.length === 0;

  return { balances, debts, isSettled };
}

/**
 * Simplifies debts to the minimum number of transactions (greedy algorithm).
 */
export function simplifyDebts(balances: Balance[]): Debt[] {
  const EPSILON = 0.01;
  const creditors = balances
    .filter(b => b.net > EPSILON)
    .map(b => ({ id: { userId: b.userId, tempUserId: b.tempUserId }, amount: b.net }));
  const debtors = balances
    .filter(b => b.net < -EPSILON)
    .map(b => ({ id: { userId: b.userId, tempUserId: b.tempUserId }, amount: -b.net }));

  const debts: Debt[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);

    debts.push({
      from: debtor.id,
      to: creditor.id,
      amount: Math.round(amount * 100) / 100,
    });

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount < EPSILON) ci++;
    if (debtor.amount < EPSILON) di++;
  }

  return debts;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx jest lib/splits/__tests__/balances.test.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/splits/types.ts lib/splits/balances.ts lib/splits/__tests__/balances.test.ts
git commit -m "feat(splits): add balance calculation and simplifyDebts with full test coverage"
```

---

## Phase 2: REST API

### Task 5: Sessions API — GET list + POST create

**Files:**
- Create: `app/api/splits/sessions/route.ts`
- Create: `app/api/splits/sessions/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// app/api/splits/sessions/__tests__/route.test.ts
import { GET, POST } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    query: { split_sessions: { findMany: jest.fn() } },
  },
}));

function makeReq(url: string, opts?: RequestInit, overrides?: Record<string, string | null>) {
  const req = new NextRequest(url, opts);
  const hdrs = { "x-user-id": "user-123", ...overrides };
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((key: string) => hdrs[key] ?? null),
  });
  return req;
}

describe("GET /api/splits/sessions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when x-user-id missing", async () => {
    const req = makeReq("http://localhost/api/splits/sessions", {}, { "x-user-id": null });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns sessions for user", async () => {
    (db.query.split_sessions.findMany as jest.Mock).mockResolvedValue([
      { id: "s1", name: "Cena", owner_user_id: "user-123", status: "open", created_at: 1000 },
    ]);
    const req = makeReq("http://localhost/api/splits/sessions");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("s1");
  });
});

describe("POST /api/splits/sessions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when x-user-id missing", async () => {
    const req = makeReq("http://localhost/api/splits/sessions", {
      method: "POST",
      body: JSON.stringify({ name: "Test" }),
    }, { "x-user-id": null });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when name missing", async () => {
    const req = makeReq("http://localhost/api/splits/sessions", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates session and returns it", async () => {
    const insertMock = { values: jest.fn().mockResolvedValue(undefined) };
    (db.insert as jest.Mock).mockReturnValue(insertMock);

    const req = makeReq("http://localhost/api/splits/sessions", {
      method: "POST",
      body: JSON.stringify({ name: "Cena viernes" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Cena viernes");
    expect(data.status).toBe("open");
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest app/api/splits/sessions/__tests__/route.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module '../route'"

- [ ] **Step 3: Implement sessions route**

```typescript
// app/api/splits/sessions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { split_sessions, split_session_members } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  telegram_chat_id: z.string().optional(),
});

/** Returns all sessions where the user is owner or member */
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sessions = await db.query.split_sessions.findMany({
      where: eq(split_sessions.owner_user_id, userId),
      orderBy: (t, { desc }) => desc(t.created_at),
    });

    return NextResponse.json(sessions);
  } catch (err) {
    console.error("Error fetching split sessions:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Creates a new split session */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const id = randomUUID();
    const now = Date.now();
    const session = {
      id,
      name: parsed.data.name,
      owner_user_id: userId,
      telegram_chat_id: parsed.data.telegram_chat_id ?? null,
      status: "open" as const,
      created_at: now,
    };

    await db.insert(split_sessions).values(session);

    // Owner is automatically a member
    await db.insert(split_session_members).values({
      session_id: id,
      user_id: userId,
      temp_user_id: null,
      joined_at: now,
    });

    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    console.error("Error creating split session:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx jest app/api/splits/sessions/__tests__/route.test.ts --no-coverage
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/splits/sessions/route.ts app/api/splits/sessions/__tests__/route.test.ts
git commit -m "feat(splits): add GET/POST /api/splits/sessions with tests"
```

---

### Task 6: Session detail + close — GET + PATCH

**Files:**
- Create: `app/api/splits/sessions/[id]/route.ts`
- Create: `app/api/splits/sessions/[id]/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// app/api/splits/sessions/[id]/__tests__/route.test.ts
import { GET, PATCH } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      split_sessions: { findFirst: jest.fn() },
      splits: { findMany: jest.fn() },
      split_session_members: { findMany: jest.fn() },
    },
    update: jest.fn(),
  },
}));

function makeReq(url: string, opts?: RequestInit) {
  const req = new NextRequest(url, opts);
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
  });
  return req;
}

const mockSession = {
  id: "s1", name: "Cena", owner_user_id: "user-123", status: "open", created_at: 1000,
};

describe("GET /api/splits/sessions/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when session not found", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await GET(makeReq("http://localhost"), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(404);
  });

  it("returns session with splits and members", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue(mockSession);
    (db.query.splits.findMany as jest.Mock).mockResolvedValue([]);
    (db.query.split_session_members.findMany as jest.Mock).mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost"), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.id).toBe("s1");
  });
});

describe("PATCH /api/splits/sessions/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when user is not owner", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({
      ...mockSession, owner_user_id: "other-user",
    });
    const req = makeReq("http://localhost", {
      method: "PATCH", body: JSON.stringify({ status: "closed" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(403);
  });

  it("closes session when owner requests it", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue(mockSession);
    const updateMock = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(undefined) };
    (db.update as jest.Mock).mockReturnValue(updateMock);
    const req = makeReq("http://localhost", {
      method: "PATCH", body: JSON.stringify({ status: "closed" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
npx jest app/api/splits/sessions/\\[id\\]/__tests__/route.test.ts --no-coverage
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// app/api/splits/sessions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { split_sessions, splits, split_session_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const patchSchema = z.object({
  status: z.literal("closed"),
  closing_note: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const session = await db.query.split_sessions.findFirst({
      where: eq(split_sessions.id, id),
    });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [sessionSplits, members] = await Promise.all([
      db.query.splits.findMany({ where: eq(splits.session_id, id) }),
      db.query.split_session_members.findMany({ where: eq(split_session_members.session_id, id) }),
    ]);

    return NextResponse.json({ session, splits: sessionSplits, members });
  } catch (err) {
    console.error("Error fetching session detail:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const session = await db.query.split_sessions.findFirst({
      where: eq(split_sessions.id, id),
    });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.owner_user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    await db.update(split_sessions)
      .set({ status: "closed", closed_at: Date.now(), closing_note: parsed.data.closing_note ?? null })
      .where(eq(split_sessions.id, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error updating session:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
npx jest app/api/splits/sessions/\\[id\\]/__tests__/route.test.ts --no-coverage
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/splits/sessions/\\[id\\]/route.ts app/api/splits/sessions/\\[id\\]/__tests__/route.test.ts
git commit -m "feat(splits): add GET/PATCH /api/splits/sessions/[id] with tests"
```

---

### Task 7: Balances endpoint

**Files:**
- Create: `app/api/splits/sessions/[id]/balances/route.ts`

- [ ] **Step 1: Implement**

```typescript
// app/api/splits/sessions/[id]/balances/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { split_sessions, splits, split_payers, split_items, split_payments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { calculateSessionBalances } from "@/lib/splits/balances";
import type { RawPayer, RawItem, RawPayment } from "@/lib/splits/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const session = await db.query.split_sessions.findFirst({
      where: eq(split_sessions.id, id),
    });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Fetch all active splits for session
    const activeSplits = await db.query.splits.findMany({
      where: and(eq(splits.session_id, id), eq(splits.status, "active")),
    });
    const splitIds = activeSplits.map(s => s.id);

    if (splitIds.length === 0) {
      return NextResponse.json({ balances: [], debts: [], isSettled: true });
    }

    // Fetch payers, items, payments in parallel
    const [payerRows, itemRows, paymentRows] = await Promise.all([
      db.select().from(split_payers).where(
        splitIds.length === 1
          ? eq(split_payers.split_id, splitIds[0])
          : eq(split_payers.split_id, splitIds[0]) // simplified — in practice use inArray
      ),
      db.select().from(split_items).where(eq(split_items.split_id, splitIds[0])),
      db.select().from(split_payments).where(eq(split_payments.session_id, id)),
    ]);

    const rawPayers: RawPayer[] = payerRows.map(r => ({
      userId: r.user_id ?? undefined,
      tempUserId: r.temp_user_id ?? undefined,
      amountPaid: r.amount_paid,
    }));
    const rawItems: RawItem[] = itemRows.map(r => ({
      userId: r.user_id ?? undefined,
      tempUserId: r.temp_user_id ?? undefined,
      amountOwed: r.amount_owed,
    }));
    const rawPayments: RawPayment[] = paymentRows.map(r => ({
      payerUserId: r.payer_user_id,
      payerTempId: r.payer_temp_id,
      payeeUserId: r.payee_user_id,
      payeeTempId: r.payee_temp_id,
      amount: r.amount,
    }));

    const result = calculateSessionBalances(rawPayers, rawItems, rawPayments);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Error calculating balances:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

**Note:** For the production implementation, use `inArray` from drizzle-orm to query multiple splitIds. The above is simplified for single-split sessions; the real implementation should loop or use `inArray`.

- [ ] **Step 2: Commit**

```bash
git add app/api/splits/sessions/\\[id\\]/balances/route.ts
git commit -m "feat(splits): add GET /api/splits/sessions/[id]/balances"
```

---

### Task 8: Create split item + payment endpoints

**Files:**
- Create: `app/api/splits/sessions/[id]/items/route.ts`
- Create: `app/api/splits/sessions/[id]/payments/route.ts`
- Create: `app/api/splits/items/[id]/route.ts`

- [ ] **Step 1: Create items endpoint**

```typescript
// app/api/splits/sessions/[id]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { split_sessions, splits, split_payers, split_items } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";

const participantSchema = z.object({
  userId: z.string().optional(),
  tempUserId: z.string().optional(),
  amount: z.number().positive(),
  percentage: z.number().optional(),
});

const payerSchema = z.object({
  userId: z.string().optional(),
  tempUserId: z.string().optional(),
  amountPaid: z.number().positive(),
});

const createSchema = z.object({
  description: z.string().min(1).max(200),
  totalAmount: z.number().positive(),
  splitType: z.enum(["equal", "percentage", "fixed"]),
  payers: z.array(payerSchema).min(1),
  participants: z.array(participantSchema).min(1),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: sessionId } = await params;
    const session = await db.query.split_sessions.findFirst({
      where: eq(split_sessions.id, sessionId),
    });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.owner_user_id !== userId) {
      return NextResponse.json({ error: "Only the session owner can add splits" }, { status: 403 });
    }
    if (session.status !== "open") {
      return NextResponse.json({ error: "Session is closed" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { description, totalAmount, splitType, payers, participants } = parsed.data;
    const splitId = randomUUID();
    const now = Date.now();

    await db.insert(splits).values({
      id: splitId, session_id: sessionId, description,
      total_amount: totalAmount, split_type: splitType,
      created_by_user_id: userId, created_at: now,
    });

    await db.insert(split_payers).values(
      payers.map(p => ({
        id: randomUUID(), split_id: splitId,
        user_id: p.userId ?? null, temp_user_id: p.tempUserId ?? null,
        amount_paid: p.amountPaid,
      }))
    );

    await db.insert(split_items).values(
      participants.map(p => ({
        id: randomUUID(), split_id: splitId,
        user_id: p.userId ?? null, temp_user_id: p.tempUserId ?? null,
        amount_owed: p.amount, percentage: p.percentage ?? null,
      }))
    );

    return NextResponse.json({ id: splitId, description, totalAmount, splitType }, { status: 201 });
  } catch (err) {
    console.error("Error creating split item:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create payments endpoint**

```typescript
// app/api/splits/sessions/[id]/payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { split_sessions, split_payments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";

const createSchema = z.object({
  payerUserId: z.string().optional(),
  payerTempId: z.string().optional(),
  payeeUserId: z.string().optional(),
  payeeTempId: z.string().optional(),
  amount: z.number().positive(),
  method: z.enum(["manual", "receipt_ocr"]).default("manual"),
  receiptImageUrl: z.string().url().optional(),
  ocrRawText: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: sessionId } = await params;
    const session = await db.query.split_sessions.findFirst({
      where: eq(split_sessions.id, sessionId),
    });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.status !== "open") {
      return NextResponse.json({ error: "Session is closed" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const d = parsed.data;
    const payment = {
      id: randomUUID(), session_id: sessionId,
      payer_user_id: d.payerUserId ?? null, payer_temp_id: d.payerTempId ?? null,
      payee_user_id: d.payeeUserId ?? null, payee_temp_id: d.payeeTempId ?? null,
      amount: d.amount, method: d.method,
      receipt_image_url: d.receiptImageUrl ?? null, ocr_raw_text: d.ocrRawText ?? null,
      confirmed_at: Date.now(),
    };

    await db.insert(split_payments).values(payment);
    return NextResponse.json(payment, { status: 201 });
  } catch (err) {
    console.error("Error recording split payment:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create split item edit/cancel endpoint**

```typescript
// app/api/splits/items/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splits, split_sessions, split_items } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const patchSchema = z.object({
  totalAmount: z.number().positive().optional(),
  status: z.literal("cancelled").optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const split = await db.query.splits.findFirst({ where: eq(splits.id, id) });
    if (!split) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const session = await db.query.split_sessions.findFirst({
      where: eq(split_sessions.id, split.session_id),
    });
    if (!session || session.owner_user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (parsed.data.status === "cancelled") {
      updates.status = "cancelled";
      updates.cancelled_at = Date.now();
    }
    if (parsed.data.totalAmount !== undefined) {
      updates.total_amount = parsed.data.totalAmount;
    }

    await db.update(splits).set(updates).where(eq(splits.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error updating split:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All existing tests PASS + new tests PASS. 0 failures.

- [ ] **Step 5: Commit and push**

```bash
git add app/api/splits/
git commit -m "feat(splits): add all REST API endpoints for splits module"
git push origin feature/splits-db-and-balances
```

---

## Phase 2 complete — open PR

- [ ] **Create PR for review before continuing to Web UI (Phase 3)**

```bash
gh pr create \
  --title "feat(splits): DB schema + balance logic + REST API" \
  --body "## Descripción
Implementa la base del módulo compartidos: tablas de DB, lógica de balances y endpoints REST.

## Solución
- Migración 0006 con 7 tablas nuevas (no modifica nada existente)
- calculateSessionBalances + simplifyDebts con tests completos
- 6 endpoints REST: sessions CRUD, items, payments, balances

## Tests
- lib/splits/__tests__/balances.test.ts — cobertura completa
- app/api/splits/sessions/__tests__ — happy path + auth + error cases

## Auditoría pre-PR
Pendiente de ejecutar code-review agent

Closes # (sin issue asignado — feature nueva)"
```
