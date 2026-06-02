# Multi-usuario / Grupos — Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir soporte de grupos compartidos a Hermes Finance: un usuario puede crear hasta 2 grupos, invitar miembros con roles Owner/Admin/Member, y todos los datos (transacciones, presupuestos, categorías, monthly_settings) se scopean al grupo activo.

**Architecture:** Se añaden 3 tablas nuevas (`groups`, `group_members`, `group_invitations`) y `group_id` a las 4 tablas de datos existentes. El middleware resuelve el grupo activo desde una cookie `active_group_id` e inyecta `x-group-id` en todas las requests. Las rutas de datos existentes cambian su filtro de `user_id` a `group_id`.

**Tech Stack:** Next.js 16, Drizzle ORM 0.45, Turso/libsql, TypeScript, Zod 4, Jest + ts-jest

---

## File Map

**Nuevos archivos:**
- `lib/db/migrations/0003_multiuser_groups.sql` — DDL completo de la migración
- `scripts/migrate-multiuser-groups.mjs` — script Node ESM que aplica la migración
- `lib/groups/permissions.ts` — helpers de permisos y service (requireGroupMember, getPersonalGroup, etc.)
- `app/api/groups/route.ts` — GET /api/groups + POST /api/groups
- `app/api/groups/[id]/route.ts` — GET + PATCH + DELETE /api/groups/[id]
- `app/api/groups/[id]/members/route.ts` — GET /api/groups/[id]/members
- `app/api/groups/[id]/members/[userId]/route.ts` — PATCH + DELETE /api/groups/[id]/members/[userId]
- `app/api/groups/[id]/invitations/route.ts` — POST /api/groups/[id]/invitations
- `app/api/groups/[id]/invitations/[invId]/route.ts` — DELETE /api/groups/[id]/invitations/[invId]
- `app/api/join/[token]/route.ts` — GET + POST /api/join/[token] (pública)
- `app/api/groups/__tests__/route.test.ts`
- `app/api/groups/[id]/__tests__/route.test.ts`
- `app/api/groups/[id]/members/__tests__/route.test.ts`
- `app/api/groups/[id]/invitations/__tests__/route.test.ts`
- `app/api/join/__tests__/route.test.ts`
- `components/dashboard/GroupSwitcher.tsx` — dropdown de grupos en sidebar
- `components/dashboard/InviteModal.tsx` — modal para generar link de invitación
- `components/dashboard/CreateGroupModal.tsx` — modal para crear nuevo grupo
- `app/dashboard/group/settings/page.tsx` — página de configuración del grupo
- `app/join/[token]/page.tsx` — página pública de aceptar invitación

**Archivos modificados:**
- `lib/db/schema.ts` — añadir tablas groups, group_members, group_invitations + columnas group_id
- `middleware.ts` — inyectar x-group-id desde cookie active_group_id
- `app/api/transactions/route.ts` — filtrar por group_id + verificar membresía
- `app/api/transactions/[id]/route.ts` — verificar membresía del grupo
- `app/api/budgets/route.ts` (si existe) — filtrar por group_id
- `app/api/categories/route.ts` — filtrar por group_id
- `app/api/categories/[id]/route.ts` — verificar group_id
- `app/api/export/route.ts` — filtrar por group_id
- `components/dashboard/HermesSidebar.tsx` — añadir GroupSwitcher + links de grupo

---

## Task 1: Schema additions

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Añadir las 3 tablas nuevas a `lib/db/schema.ts`**

Reemplazar el contenido de `lib/db/schema.ts` agregando al final (antes de las relations existentes) las 3 tablas nuevas y sus relaciones:

```typescript
export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  owner_id: text("owner_id").notNull().references(() => users.id),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const group_members = sqliteTable("group_members", {
  group_id: text("group_id").notNull().references(() => groups.id),
  user_id: text("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
  joined_at: integer("joined_at").notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  pk: uniqueIndex("gm_group_user_idx").on(t.group_id, t.user_id),
}));

export const group_invitations = sqliteTable("group_invitations", {
  id: text("id").primaryKey(),
  group_id: text("group_id").notNull().references(() => groups.id),
  token: text("token").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull(),
  created_by: text("created_by").notNull().references(() => users.id),
  expires_at: integer("expires_at").notNull(),
  used_at: integer("used_at"),
  used_by: text("used_by").references(() => users.id),
}, (t) => ({
  tokenIdx: uniqueIndex("gi_token_idx").on(t.token),
}));
```

- [ ] **Step 2: Añadir columna `group_id` a las 4 tablas existentes**

En `lib/db/schema.ts`, editar cada tabla:

```typescript
// En transactions — añadir después de user_id:
group_id: text("group_id").references(() => groups.id),

// En budgets — añadir después de user_id:
group_id: text("group_id").references(() => groups.id),

// En monthly_settings — añadir después de user_id:
group_id: text("group_id").references(() => groups.id),

// En categories — añadir después de id:
group_id: text("group_id").references(() => groups.id),
```

- [ ] **Step 3: Añadir relations para las nuevas tablas**

Al final de `lib/db/schema.ts`:

```typescript
export const groupsRelations = relations(groups, ({ one, many }) => ({
  owner: one(users, { fields: [groups.owner_id], references: [users.id] }),
  members: many(group_members),
  invitations: many(group_invitations),
}));

export const groupMembersRelations = relations(group_members, ({ one }) => ({
  group: one(groups, { fields: [group_members.group_id], references: [groups.id] }),
  user: one(users, { fields: [group_members.user_id], references: [users.id] }),
}));

export const groupInvitationsRelations = relations(group_invitations, ({ one }) => ({
  group: one(groups, { fields: [group_invitations.group_id], references: [groups.id] }),
  creator: one(users, { fields: [group_invitations.created_by], references: [users.id] }),
}));
```

- [ ] **Step 4: Verificar que el archivo compila sin errores**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
npx tsc --noEmit lib/db/schema.ts 2>&1 | head -20
```

Expected: Sin errores de compilación.

---

## Task 2: Migration SQL + Script

**Files:**
- Create: `lib/db/migrations/0003_multiuser_groups.sql`
- Create: `scripts/migrate-multiuser-groups.mjs`

- [ ] **Step 1: Crear el archivo SQL de referencia**

Crear `lib/db/migrations/0003_multiuser_groups.sql`:

```sql
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
-- (se ejecutan después del backfill de datos en el script .mjs)
-- DROP INDEX IF EXISTS budgets_user_month_cat_idx;
-- CREATE UNIQUE INDEX budgets_group_month_cat_idx ON budgets(group_id, month, category_id) WHERE group_id IS NOT NULL;
-- DROP INDEX IF EXISTS ms_user_month_idx;
-- CREATE UNIQUE INDEX ms_group_month_idx ON monthly_settings(group_id, month) WHERE group_id IS NOT NULL;
```

- [ ] **Step 2: Crear el script de migración `scripts/migrate-multiuser-groups.mjs`**

```javascript
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadEnv() {
  const envPath = resolve(__dirname, "../.env.local");
  const envContent = readFileSync(envPath, "utf-8");
  return Object.fromEntries(
    envContent.split("\n")
      .filter(line => line.includes("=") && !line.startsWith("#"))
      .map(line => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^"|"$/g, "")];
      })
  );
}

async function migrate() {
  const env = await loadEnv();
  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = env;
  if (!url || !authToken) throw new Error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");

  const client = createClient({ url, authToken });
  await client.execute("PRAGMA foreign_keys = ON");

  console.log("Step 1: Creating groups table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);

  console.log("Step 2: Creating group_members table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
      joined_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (group_id, user_id)
    )
  `);

  console.log("Step 3: Creating group_invitations table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS group_invitations (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
      created_by TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      used_by TEXT REFERENCES users(id)
    )
  `);

  console.log("Step 4: Adding group_id columns to existing tables...");
  for (const table of ["transactions", "budgets", "monthly_settings", "categories"]) {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    const hasColumn = info.rows.some(row => row[1] === "group_id");
    if (hasColumn) {
      console.log(`  ${table}.group_id already exists, skipping.`);
    } else {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN group_id TEXT REFERENCES groups(id)`);
      console.log(`  Added group_id to ${table}.`);
    }
  }

  console.log("Step 5a: Updating unique indexes to use group_id...");
  // Drop old user-scoped unique indexes and create group-scoped ones
  await client.execute("DROP INDEX IF EXISTS budgets_user_month_cat_idx").catch(() => {});
  await client.execute("DROP INDEX IF EXISTS ms_user_month_idx").catch(() => {});
  // Create new group-scoped unique indexes (partial: only where group_id IS NOT NULL)
  await client.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS budgets_group_month_cat_idx ON budgets(group_id, month, category_id)"
  ).catch(e => console.warn("  budgets index:", e.message));
  await client.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS ms_group_month_idx ON monthly_settings(group_id, month)"
  ).catch(e => console.warn("  monthly_settings index:", e.message));
  console.log("  Indexes updated.");

  console.log("Step 5: Auto-creating personal group 'Hogar' for existing users...");
  const usersResult = await client.execute("SELECT id FROM users");
  for (const row of usersResult.rows) {
    const userId = row[0];

    // Check if user already has a personal group
    const existingGroup = await client.execute({
      sql: "SELECT id FROM groups WHERE owner_id = ?",
      args: [userId],
    });
    if (existingGroup.rows.length > 0) {
      const groupId = existingGroup.rows[0][0];
      console.log(`  User ${userId} already has group ${groupId}, skipping.`);
      continue;
    }

    const groupId = randomUUID();
    await client.execute({
      sql: "INSERT INTO groups (id, name, owner_id) VALUES (?, ?, ?)",
      args: [groupId, "Hogar", userId],
    });
    await client.execute({
      sql: "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')",
      args: [groupId, userId],
    });

    // Backfill group_id on all user's data
    for (const table of ["transactions", "budgets", "monthly_settings"]) {
      await client.execute({
        sql: `UPDATE ${table} SET group_id = ? WHERE user_id = ? AND group_id IS NULL`,
        args: [groupId, userId],
      });
    }
    // Categories are not user-scoped, backfill all
    await client.execute({
      sql: "UPDATE categories SET group_id = ? WHERE group_id IS NULL",
      args: [groupId],
    });

    console.log(`  Created group 'Hogar' (${groupId}) for user ${userId} and backfilled data.`);
  }

  console.log("✅ Migration complete.");
  client.close();
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Ejecutar el script**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
node scripts/migrate-multiuser-groups.mjs
```

Expected output:
```
Step 1: Creating groups table...
Step 2: Creating group_members table...
Step 3: Creating group_invitations table...
Step 4: Adding group_id columns to existing tables...
  Added group_id to transactions.
  Added group_id to budgets.
  Added group_id to monthly_settings.
  Added group_id to categories.
Step 5: Auto-creating personal group 'Hogar' for existing users...
  Created group 'Hogar' (<uuid>) for user <userId> and backfilled data.
✅ Migration complete.
```

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/0003_multiuser_groups.sql scripts/migrate-multiuser-groups.mjs
git commit -m "feat: add groups schema and run migration"
```

---

## Task 3: Group permissions helper

**Files:**
- Create: `lib/groups/permissions.ts`

This module is imported by all API routes to verify membership and roles without repeating logic.

- [ ] **Step 1: Crear `lib/groups/permissions.ts`**

```typescript
import { db } from "@/lib/db/client";
import { groups, group_members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const MAX_OWNED_GROUPS = 2;

export type GroupRole = "owner" | "admin" | "member";

export interface GroupMembership {
  group_id: string;
  user_id: string;
  role: GroupRole;
}

/**
 * Verifica que el usuario es miembro del grupo. Devuelve la membresía o null.
 */
export async function getGroupMembership(
  userId: string,
  groupId: string
): Promise<GroupMembership | null> {
  const member = await db.query.group_members.findFirst({
    where: and(
      eq(group_members.group_id, groupId),
      eq(group_members.user_id, userId)
    ),
  });
  if (!member) return null;
  return {
    group_id: member.group_id,
    user_id: member.user_id,
    role: member.role as GroupRole,
  };
}

/**
 * Devuelve el grupo personal del usuario (primer grupo donde es owner).
 * Retorna null si el usuario aún no tiene grupo personal.
 */
export async function getPersonalGroup(userId: string): Promise<string | null> {
  const membership = await db.query.group_members.findFirst({
    where: and(
      eq(group_members.user_id, userId),
      eq(group_members.role, "owner")
    ),
  });
  return membership?.group_id ?? null;
}

/**
 * Devuelve todos los grupos del usuario (owned + member).
 */
export async function getUserGroups(userId: string) {
  const memberships = await db.query.group_members.findMany({
    where: eq(group_members.user_id, userId),
    with: { group: true },
  });
  return memberships.map(m => ({
    group_id: m.group_id,
    role: m.role as GroupRole,
    group: m.group,
  }));
}

/**
 * Cuenta los grupos donde el usuario es owner.
 */
export async function countOwnedGroups(userId: string): Promise<number> {
  const rows = await db.query.group_members.findMany({
    where: and(
      eq(group_members.user_id, userId),
      eq(group_members.role, "owner")
    ),
  });
  return rows.length;
}

export function canManageMembers(role: GroupRole): boolean {
  return role === "owner" || role === "admin";
}

export function canEditGroupData(role: GroupRole): boolean {
  return role === "owner" || role === "admin";
}

export function canDeleteOthersData(role: GroupRole): boolean {
  return role === "owner" || role === "admin";
}

export function isOwner(role: GroupRole): boolean {
  return role === "owner";
}
```

- [ ] **Step 2: Verificar compilación**

```bash
npx tsc --noEmit lib/groups/permissions.ts 2>&1 | head -20
```

Expected: Sin errores.

- [ ] **Step 3: Commit**

```bash
git add lib/groups/permissions.ts
git commit -m "feat: add group permissions helper"
```

---

## Task 4: Groups CRUD API

**Files:**
- Create: `app/api/groups/route.ts`
- Create: `app/api/groups/[id]/route.ts`
- Create: `app/api/groups/__tests__/route.test.ts`
- Create: `app/api/groups/[id]/__tests__/route.test.ts`

- [ ] **Step 1: Escribir los tests que fallan para GET+POST /api/groups**

Crear `app/api/groups/__tests__/route.test.ts`:

```typescript
import { GET, POST } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/client", () => ({ db: {} }));
jest.mock("@/lib/groups/permissions", () => ({
  getUserGroups: jest.fn(),
  countOwnedGroups: jest.fn(),
  MAX_OWNED_GROUPS: 2,
}));
jest.mock("@/lib/db/schema", () => ({
  groups: {},
  group_members: {},
}));

import * as perms from "@/lib/groups/permissions";
import { db } from "@/lib/db/client";

const mockPerms = perms as jest.Mocked<typeof perms>;
const mockDb = db as any;

function makeReq(url: string, options?: RequestInit) {
  return new NextRequest(url, options);
}
function withUser(req: NextRequest, userId = "user-1") {
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((key: string) => {
      if (key === "x-user-id") return userId;
      return null;
    }),
  });
  return req;
}

describe("GET /api/groups", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/groups");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns list of groups for user", async () => {
    mockPerms.getUserGroups.mockResolvedValue([
      { group_id: "g-1", role: "owner", group: { id: "g-1", name: "Hogar", owner_id: "user-1", created_at: 0 } },
    ]);
    const req = withUser(makeReq("http://localhost/api/groups"));
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].role).toBe("owner");
  });
});

describe("POST /api/groups", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.insert = jest.fn(() => ({
      values: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([{ id: "g-2", name: "Trabajo", owner_id: "user-1", created_at: 0 }]) })),
    }));
  });

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/groups", { method: "POST", body: JSON.stringify({ name: "Trabajo" }) });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 422 when name is missing", async () => {
    mockPerms.countOwnedGroups.mockResolvedValue(0);
    const req = withUser(makeReq("http://localhost/api/groups", { method: "POST", body: JSON.stringify({}) }));
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 422 when MAX_OWNED_GROUPS exceeded", async () => {
    mockPerms.countOwnedGroups.mockResolvedValue(2);
    const req = withUser(makeReq("http://localhost/api/groups", { method: "POST", body: JSON.stringify({ name: "Nuevo" }) }));
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("MAX_GROUPS_REACHED");
  });

  it("creates group and returns 201", async () => {
    mockPerms.countOwnedGroups.mockResolvedValue(0);
    mockDb.insert = jest.fn()
      .mockReturnValueOnce({ values: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([{ id: "g-2", name: "Trabajo", owner_id: "user-1", created_at: 0 }]) })) })
      .mockReturnValueOnce({ values: jest.fn().mockResolvedValue([]) });
    const req = withUser(makeReq("http://localhost/api/groups", { method: "POST", body: JSON.stringify({ name: "Trabajo" }) }));
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Trabajo");
  });
});
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```bash
npx jest app/api/groups/__tests__/route.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — "Cannot find module '../route'"

- [ ] **Step 3: Crear `app/api/groups/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { groups, group_members } from "@/lib/db/schema";
import { getUserGroups, countOwnedGroups, MAX_OWNED_GROUPS } from "@/lib/groups/permissions";
import { randomUUID } from "crypto";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(50),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const userGroups = await getUserGroups(userId);
    return NextResponse.json(userGroups);
  } catch (err) {
    console.error("Error fetching groups:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  try {
    const owned = await countOwnedGroups(userId);
    if (owned >= MAX_OWNED_GROUPS) {
      return NextResponse.json(
        { error: `Podés crear hasta ${MAX_OWNED_GROUPS} grupos.`, code: "MAX_GROUPS_REACHED" },
        { status: 422 }
      );
    }

    const groupId = randomUUID();
    const [created] = await db.insert(groups).values({
      id: groupId,
      name: parsed.data.name,
      owner_id: userId,
    }).returning();

    await db.insert(group_members).values({
      group_id: groupId,
      user_id: userId,
      role: "owner",
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("Error creating group:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Escribir tests para GET+PATCH+DELETE /api/groups/[id]**

Crear `app/api/groups/[id]/__tests__/route.test.ts`:

```typescript
import { GET, PATCH, DELETE } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/client", () => ({ db: {} }));
jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
  isOwner: jest.fn(),
}));
jest.mock("@/lib/db/schema", () => ({ groups: {}, group_members: {} }));

import * as perms from "@/lib/groups/permissions";
import { db } from "@/lib/db/client";

const mockPerms = perms as jest.Mocked<typeof perms>;
const mockDb = db as any;

function makeReq(url: string, options?: RequestInit) {
  return new NextRequest(url, options);
}
function withUser(req: NextRequest, userId = "user-1") {
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((key: string) => key === "x-user-id" ? userId : null),
  });
  return req;
}
const params = { params: Promise.resolve({ id: "g-1" }) };

describe("GET /api/groups/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without user", async () => {
    const res = await GET(makeReq("http://localhost/api/groups/g-1"), params);
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a member", async () => {
    mockPerms.getGroupMembership.mockResolvedValue(null);
    const res = await GET(withUser(makeReq("http://localhost/api/groups/g-1")), params);
    expect(res.status).toBe(403);
  });

  it("returns group info for member", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ group_id: "g-1", user_id: "user-1", role: "owner" });
    mockDb.query = { groups: { findFirst: jest.fn().mockResolvedValue({ id: "g-1", name: "Hogar", owner_id: "user-1", created_at: 0 }) } };
    const res = await GET(withUser(makeReq("http://localhost/api/groups/g-1")), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("g-1");
  });
});

describe("PATCH /api/groups/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when not owner", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ group_id: "g-1", user_id: "user-1", role: "member" });
    mockPerms.isOwner.mockReturnValue(false);
    const req = withUser(makeReq("http://localhost/api/groups/g-1", { method: "PATCH", body: JSON.stringify({ name: "Nuevo" }) }));
    const res = await PATCH(req, params);
    expect(res.status).toBe(403);
  });

  it("renames group when owner", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ group_id: "g-1", user_id: "user-1", role: "owner" });
    mockPerms.isOwner.mockReturnValue(true);
    mockDb.update = jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([{ id: "g-1", name: "Nuevo" }]) })),
      })),
    }));
    const req = withUser(makeReq("http://localhost/api/groups/g-1", { method: "PATCH", body: JSON.stringify({ name: "Nuevo" }) }));
    const res = await PATCH(req, params);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/groups/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when not owner", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ group_id: "g-1", user_id: "user-1", role: "admin" });
    mockPerms.isOwner.mockReturnValue(false);
    const res = await DELETE(withUser(makeReq("http://localhost/api/groups/g-1")), params);
    expect(res.status).toBe(403);
  });

  it("deletes group when owner", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ group_id: "g-1", user_id: "user-1", role: "owner" });
    mockPerms.isOwner.mockReturnValue(true);
    mockDb.delete = jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) }));
    const res = await DELETE(withUser(makeReq("http://localhost/api/groups/g-1")), params);
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 5: Crear `app/api/groups/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { groups } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getGroupMembership, isOwner } from "@/lib/groups/permissions";
import { z } from "zod";

const patchSchema = z.object({ name: z.string().min(1).max(50) });

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const membership = await getGroupMembership(userId, id);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const group = await db.query.groups.findFirst({ where: eq(groups.id, id) });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ...group, role: membership.role });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const membership = await getGroupMembership(userId, id);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isOwner(membership.role)) return NextResponse.json({ error: "Solo el owner puede renombrar el grupo." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const [updated] = await db.update(groups)
    .set({ name: parsed.data.name })
    .where(eq(groups.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const membership = await getGroupMembership(userId, id);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isOwner(membership.role)) return NextResponse.json({ error: "Solo el owner puede eliminar el grupo." }, { status: 403 });

  await db.delete(groups).where(eq(groups.id, id));
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 6: Correr tests**

```bash
npx jest app/api/groups/ --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/groups/
git commit -m "feat: add groups CRUD API"
```

---

## Task 5: Members + Invitations API

**Files:**
- Create: `app/api/groups/[id]/members/route.ts`
- Create: `app/api/groups/[id]/members/[userId]/route.ts`
- Create: `app/api/groups/[id]/invitations/route.ts`
- Create: `app/api/groups/[id]/invitations/[invId]/route.ts`
- Create: `app/api/groups/[id]/members/__tests__/route.test.ts`
- Create: `app/api/groups/[id]/invitations/__tests__/route.test.ts`

- [ ] **Step 1: Escribir tests que fallan para members**

Crear `app/api/groups/[id]/members/__tests__/route.test.ts`:

```typescript
import { GET } from "../route";
import { PATCH, DELETE } from "../[userId]/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/client", () => ({ db: {} }));
jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
  isOwner: jest.fn(),
  canManageMembers: jest.fn(),
}));
jest.mock("@/lib/db/schema", () => ({ group_members: {} }));

import * as perms from "@/lib/groups/permissions";
import { db } from "@/lib/db/client";

const mockPerms = perms as jest.Mocked<typeof perms>;
const mockDb = db as any;

function makeReq(url: string, options?: RequestInit) { return new NextRequest(url, options); }
function withUser(req: NextRequest, userId = "user-1") {
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((k: string) => k === "x-user-id" ? userId : null),
  });
  return req;
}

const groupParams = { params: Promise.resolve({ id: "g-1" }) };
const memberParams = { params: Promise.resolve({ id: "g-1", userId: "user-2" }) };

describe("GET /api/groups/[id]/members", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without user", async () => {
    const res = await GET(makeReq("http://localhost/api/groups/g-1/members"), groupParams);
    expect(res.status).toBe(401);
  });

  it("returns 403 when not member", async () => {
    mockPerms.getGroupMembership.mockResolvedValue(null);
    const res = await GET(withUser(makeReq("http://localhost/api/groups/g-1/members")), groupParams);
    expect(res.status).toBe(403);
  });

  it("returns members list", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ group_id: "g-1", user_id: "user-1", role: "owner" });
    mockDb.query = {
      group_members: {
        findMany: jest.fn().mockResolvedValue([
          { group_id: "g-1", user_id: "user-1", role: "owner", joined_at: 0, user: { id: "user-1", name: "Esteban" } },
        ]),
      },
    };
    const res = await GET(withUser(makeReq("http://localhost/api/groups/g-1/members")), groupParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe("PATCH /api/groups/[id]/members/[userId]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when not owner", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ role: "admin" });
    mockPerms.isOwner.mockReturnValue(false);
    const req = withUser(makeReq("http://localhost/...", { method: "PATCH", body: JSON.stringify({ role: "member" }) }));
    const res = await PATCH(req, memberParams);
    expect(res.status).toBe(403);
  });

  it("returns 400 when trying to change own role as owner", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ group_id: "g-1", user_id: "user-1", role: "owner" });
    mockPerms.isOwner.mockReturnValue(true);
    const req = withUser(makeReq("http://localhost/...", { method: "PATCH", body: JSON.stringify({ role: "admin" }) }));
    // userId param matches x-user-id
    const sameUserParams = { params: Promise.resolve({ id: "g-1", userId: "user-1" }) };
    const res = await PATCH(req, sameUserParams);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/groups/[id]/members/[userId]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when owner tries to leave (must delete group)", async () => {
    mockPerms.getGroupMembership
      .mockResolvedValueOnce({ group_id: "g-1", user_id: "user-1", role: "owner" }) // requester
      .mockResolvedValueOnce({ group_id: "g-1", user_id: "user-1", role: "owner" }); // target
    mockPerms.isOwner.mockReturnValue(true);
    const sameUserParams = { params: Promise.resolve({ id: "g-1", userId: "user-1" }) };
    const res = await DELETE(withUser(makeReq("http://localhost/...")), sameUserParams);
    expect(res.status).toBe(400);
  });

  it("removes member when owner requests", async () => {
    mockPerms.getGroupMembership
      .mockResolvedValueOnce({ group_id: "g-1", user_id: "user-1", role: "owner" }) // requester
      .mockResolvedValueOnce({ group_id: "g-1", user_id: "user-2", role: "member" }); // target
    mockPerms.isOwner.mockReturnValue(true);
    mockDb.delete = jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) }));
    const res = await DELETE(withUser(makeReq("http://localhost/...")), memberParams);
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```bash
npx jest "app/api/groups/\[id\]/members" --no-coverage 2>&1 | tail -10
```

Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Crear `app/api/groups/[id]/members/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { group_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getGroupMembership } from "@/lib/groups/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const membership = await getGroupMembership(userId, id);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const members = await db.query.group_members.findMany({
    where: eq(group_members.group_id, id),
    with: { user: true },
  });

  return NextResponse.json(members);
}
```

- [ ] **Step 4: Crear `app/api/groups/[id]/members/[userId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { group_members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getGroupMembership, isOwner } from "@/lib/groups/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string; userId: string }> };

const patchSchema = z.object({ role: z.enum(["admin", "member"]) });

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const requesterId = req.headers.get("x-user-id");
  if (!requesterId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId, userId: targetUserId } = await params;

  const requesterMembership = await getGroupMembership(requesterId, groupId);
  if (!requesterMembership || !isOwner(requesterMembership.role)) {
    return NextResponse.json({ error: "Solo el owner puede cambiar roles." }, { status: 403 });
  }
  if (requesterId === targetUserId) {
    return NextResponse.json({ error: "No podés cambiar tu propio rol." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const targetMembership = await getGroupMembership(targetUserId, groupId);
  if (!targetMembership) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (isOwner(targetMembership.role)) {
    return NextResponse.json({ error: "No se puede cambiar el rol del owner." }, { status: 400 });
  }

  await db.update(group_members)
    .set({ role: parsed.data.role })
    .where(and(eq(group_members.group_id, groupId), eq(group_members.user_id, targetUserId)));

  return NextResponse.json({ group_id: groupId, user_id: targetUserId, role: parsed.data.role });
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const requesterId = req.headers.get("x-user-id");
  if (!requesterId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId, userId: targetUserId } = await params;

  const requesterMembership = await getGroupMembership(requesterId, groupId);
  if (!requesterMembership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const isSelf = requesterId === targetUserId;
  if (!isSelf && !isOwner(requesterMembership.role)) {
    return NextResponse.json({ error: "Solo el owner puede remover miembros." }, { status: 403 });
  }

  const targetMembership = await getGroupMembership(targetUserId, groupId);
  if (!targetMembership) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (isOwner(targetMembership.role)) {
    return NextResponse.json({ error: "El owner no puede salir del grupo. Eliminá el grupo si querés." }, { status: 400 });
  }

  await db.delete(group_members)
    .where(and(eq(group_members.group_id, groupId), eq(group_members.user_id, targetUserId)));

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 5: Escribir tests que fallan para invitations**

Crear `app/api/groups/[id]/invitations/__tests__/route.test.ts`:

```typescript
import { POST } from "../route";
import { DELETE } from "../[invId]/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/client", () => ({ db: {} }));
jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
  canManageMembers: jest.fn(),
}));
jest.mock("@/lib/db/schema", () => ({ group_invitations: {} }));

import * as perms from "@/lib/groups/permissions";
import { db } from "@/lib/db/client";

const mockPerms = perms as jest.Mocked<typeof perms>;
const mockDb = db as any;

function makeReq(url: string, options?: RequestInit) { return new NextRequest(url, options); }
function withUser(req: NextRequest, userId = "user-1") {
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((k: string) => k === "x-user-id" ? userId : null),
  });
  return req;
}

const groupParams = { params: Promise.resolve({ id: "g-1" }) };
const invParams = { params: Promise.resolve({ id: "g-1", invId: "inv-1" }) };

describe("POST /api/groups/[id]/invitations", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when member (not owner/admin)", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ role: "member" });
    mockPerms.canManageMembers.mockReturnValue(false);
    const req = withUser(makeReq("http://localhost/...", { method: "POST", body: JSON.stringify({ role: "member" }) }));
    const res = await POST(req, groupParams);
    expect(res.status).toBe(403);
  });

  it("creates invitation link when admin", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ role: "admin" });
    mockPerms.canManageMembers.mockReturnValue(true);
    mockDb.insert = jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn().mockResolvedValue([{
          id: "inv-1", group_id: "g-1", token: "abc-token", role: "member",
          created_by: "user-1", expires_at: Date.now() + 86400000 * 7,
        }]),
      })),
    }));
    const req = withUser(makeReq("http://localhost/...", { method: "POST", body: JSON.stringify({ role: "member" }) }));
    const res = await POST(req, groupParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBeDefined();
  });
});

describe("DELETE /api/groups/[id]/invitations/[invId]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("revokes invitation when admin", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ role: "admin" });
    mockPerms.canManageMembers.mockReturnValue(true);
    mockDb.query = { group_invitations: { findFirst: jest.fn().mockResolvedValue({ id: "inv-1", group_id: "g-1" }) } };
    mockDb.delete = jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) }));
    const res = await DELETE(withUser(makeReq("http://localhost/...")), invParams);
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 6: Crear `app/api/groups/[id]/invitations/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { group_invitations } from "@/lib/db/schema";
import { getGroupMembership, canManageMembers } from "@/lib/groups/permissions";
import { randomUUID } from "crypto";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  role: z.enum(["admin", "member"]),
  expires_days: z.number().int().min(1).max(30).optional().default(7),
});

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId } = await params;

  const membership = await getGroupMembership(userId, groupId);
  if (!membership || !canManageMembers(membership.role)) {
    return NextResponse.json({ error: "Solo owner o admin pueden invitar miembros." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { role, expires_days } = parsed.data;
  const token = randomUUID();
  const expires_at = Date.now() + expires_days * 24 * 60 * 60 * 1000;

  const [invitation] = await db.insert(group_invitations).values({
    id: randomUUID(),
    group_id: groupId,
    token,
    role,
    created_by: userId,
    expires_at,
  }).returning();

  return NextResponse.json(invitation, { status: 201 });
}
```

- [ ] **Step 7: Crear `app/api/groups/[id]/invitations/[invId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { group_invitations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getGroupMembership, canManageMembers } from "@/lib/groups/permissions";

type Params = { params: Promise<{ id: string; invId: string }> };

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId, invId } = await params;

  const membership = await getGroupMembership(userId, groupId);
  if (!membership || !canManageMembers(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invitation = await db.query.group_invitations.findFirst({
    where: and(eq(group_invitations.id, invId), eq(group_invitations.group_id, groupId)),
  });
  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });

  await db.delete(group_invitations).where(eq(group_invitations.id, invId));
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 8: Correr todos los tests de groups**

```bash
npx jest app/api/groups/ --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add app/api/groups/[id]/members/ app/api/groups/[id]/invitations/
git commit -m "feat: add group members and invitations API"
```

---

## Task 6: Join API (pública)

**Files:**
- Create: `app/api/join/[token]/route.ts`
- Create: `app/api/join/__tests__/route.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

Crear `app/api/join/__tests__/route.test.ts`:

```typescript
import { GET, POST } from "../[token]/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/client", () => ({ db: {} }));
jest.mock("@/lib/db/schema", () => ({ group_invitations: {}, group_members: {}, groups: {} }));

import { db } from "@/lib/db/client";
const mockDb = db as any;

function makeReq(url: string, options?: RequestInit) { return new NextRequest(url, options); }
function withUser(req: NextRequest, userId = "user-2") {
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((k: string) => k === "x-user-id" ? userId : null),
  });
  return req;
}

const tokenParams = { params: Promise.resolve({ token: "abc-token" }) };
const futureExpiry = Date.now() + 86400000;
const pastExpiry = Date.now() - 1000;

describe("GET /api/join/[token]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when token not found", async () => {
    mockDb.query = { group_invitations: { findFirst: jest.fn().mockResolvedValue(null) } };
    const res = await GET(makeReq("http://localhost/api/join/abc-token"), tokenParams);
    expect(res.status).toBe(404);
  });

  it("returns 410 when token expired", async () => {
    mockDb.query = {
      group_invitations: { findFirst: jest.fn().mockResolvedValue({ token: "abc-token", expires_at: pastExpiry, used_at: null }) },
    };
    const res = await GET(makeReq("http://localhost/api/join/abc-token"), tokenParams);
    expect(res.status).toBe(410);
  });

  it("returns group info when token is valid", async () => {
    mockDb.query = {
      group_invitations: {
        findFirst: jest.fn().mockResolvedValue({
          token: "abc-token", expires_at: futureExpiry, used_at: null,
          role: "member", group: { id: "g-1", name: "Hogar" },
          creator: { id: "user-1", name: "Esteban" },
        }),
      },
    };
    const res = await GET(makeReq("http://localhost/api/join/abc-token"), tokenParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.group.name).toBe("Hogar");
  });
});

describe("POST /api/join/[token]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without user", async () => {
    const res = await POST(makeReq("http://localhost/api/join/abc-token", { method: "POST" }), tokenParams);
    expect(res.status).toBe(401);
  });

  it("returns 410 when token expired", async () => {
    mockDb.query = {
      group_invitations: { findFirst: jest.fn().mockResolvedValue({ token: "abc-token", expires_at: pastExpiry, used_at: null }) },
    };
    const res = await POST(withUser(makeReq("http://localhost/...", { method: "POST" })), tokenParams);
    expect(res.status).toBe(410);
  });

  it("returns 409 when token already used", async () => {
    mockDb.query = {
      group_invitations: { findFirst: jest.fn().mockResolvedValue({ token: "abc-token", expires_at: futureExpiry, used_at: Date.now() }) },
    };
    const res = await POST(withUser(makeReq("http://localhost/...", { method: "POST" })), tokenParams);
    expect(res.status).toBe(409);
  });

  it("returns 409 when user already member", async () => {
    mockDb.query = {
      group_invitations: { findFirst: jest.fn().mockResolvedValue({ id: "inv-1", token: "abc-token", expires_at: futureExpiry, used_at: null, group_id: "g-1", role: "member" }) },
      group_members: { findFirst: jest.fn().mockResolvedValue({ group_id: "g-1", user_id: "user-2" }) },
    };
    const res = await POST(withUser(makeReq("http://localhost/...", { method: "POST" })), tokenParams);
    expect(res.status).toBe(409);
  });

  it("joins group and marks token used on success", async () => {
    mockDb.query = {
      group_invitations: { findFirst: jest.fn().mockResolvedValue({ id: "inv-1", token: "abc-token", expires_at: futureExpiry, used_at: null, group_id: "g-1", role: "member" }) },
      group_members: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    mockDb.insert = jest.fn(() => ({ values: jest.fn().mockResolvedValue([]) }));
    mockDb.update = jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue([]) })) }));
    const res = await POST(withUser(makeReq("http://localhost/...", { method: "POST" })), tokenParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.group_id).toBe("g-1");
  });
});
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```bash
npx jest "app/api/join" --no-coverage 2>&1 | tail -10
```

Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Crear `app/api/join/[token]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { group_invitations, group_members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { token } = await params;

  const invitation = await db.query.group_invitations.findFirst({
    where: eq(group_invitations.token, token),
    with: { group: true, creator: true },
  });

  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (invitation.expires_at < Date.now()) return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
  if (invitation.used_at) return NextResponse.json({ error: "Invitation already used" }, { status: 409 });

  return NextResponse.json({
    group: invitation.group,
    invited_by: invitation.creator,
    role: invitation.role,
    expires_at: invitation.expires_at,
  });
}

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { token } = await params;

  const invitation = await db.query.group_invitations.findFirst({
    where: eq(group_invitations.token, token),
  });

  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (invitation.expires_at < Date.now()) return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
  if (invitation.used_at) return NextResponse.json({ error: "Invitation already used" }, { status: 409 });

  const existing = await db.query.group_members.findFirst({
    where: and(eq(group_members.group_id, invitation.group_id), eq(group_members.user_id, userId)),
  });
  if (existing) return NextResponse.json({ error: "Ya sos miembro de este grupo." }, { status: 409 });

  await db.insert(group_members).values({
    group_id: invitation.group_id,
    user_id: userId,
    role: invitation.role,
  });

  await db.update(group_invitations)
    .set({ used_at: Date.now(), used_by: userId })
    .where(eq(group_invitations.id, invitation.id));

  return NextResponse.json({ group_id: invitation.group_id, role: invitation.role });
}
```

- [ ] **Step 4: Correr tests**

```bash
npx jest "app/api/join" --no-coverage 2>&1 | tail -20
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/join/
git commit -m "feat: add join invitation API"
```

---

## Task 7: Middleware — inyectar x-group-id

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Actualizar `middleware.ts` para resolver e inyectar `x-group-id`**

Reemplazar el contenido completo de `middleware.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/utils/session";
import { getPersonalGroup } from "@/lib/groups/permissions";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/telegram/webhook",
  "/api/cron",
  "/api/join",
  "/join",
];

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? await verifySession(cookie) : null;
  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const res = NextResponse.next();
  res.headers.set("x-user-id", userId);

  // Resolve active group
  const activeGroupId = req.cookies.get("active_group_id")?.value;
  if (activeGroupId) {
    res.headers.set("x-group-id", activeGroupId);
  } else {
    // First request: resolve personal group and set cookie
    try {
      const personalGroupId = await getPersonalGroup(userId);
      if (personalGroupId) {
        res.headers.set("x-group-id", personalGroupId);
        res.cookies.set("active_group_id", personalGroupId, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
      }
    } catch {
      // No group yet (pre-migration), proceed without group
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Verificar compilación del middleware**

```bash
npx tsc --noEmit middleware.ts 2>&1 | head -20
```

Expected: Sin errores.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: inject x-group-id from active_group_id cookie in middleware"
```

---

## Task 8: Update existing data routes to use group_id

**Files:**
- Modify: `app/api/transactions/route.ts`
- Modify: `app/api/transactions/[id]/route.ts`
- Modify: `app/api/categories/route.ts`
- Modify: `app/api/categories/[id]/route.ts`
- Modify: `app/api/export/route.ts`

The pattern is the same for all routes:
1. Read `x-group-id` header (set by middleware)
2. Verify the user is a member of that group (using `getGroupMembership`)
3. Replace `user_id` filters with `group_id` filters in DB queries
4. Keep `user_id` in INSERT operations (records who added the item)

- [ ] **Step 1: Actualizar `app/api/transactions/route.ts`**

Al inicio de cada handler, después de leer `userId`, añadir:

```typescript
const groupId = req.headers.get("x-group-id");
if (!groupId) return NextResponse.json({ error: "No active group" }, { status: 400 });

// Verificar membresía
const membership = await getGroupMembership(userId, groupId);
if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

En el GET, cambiar el filtro:
```typescript
// Antes:
where: and(eq(transactions.user_id, userId), eq(transactions.month, month), eq(transactions.status, "active"))
// Después:
where: and(eq(transactions.group_id, groupId), eq(transactions.month, month), eq(transactions.status, "active"))
```

En el POST, cambiar la verificación de `monthly_settings` y `budgets`:
```typescript
// monthly_settings: cambiar filtro de user_id a group_id
where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month))

// budgets: cambiar filtro de user_id a group_id  
where: and(eq(budgets.group_id, groupId), eq(budgets.month, month), eq(budgets.category_id, category_id))

// spent calculation: cambiar filtro de user_id a group_id
eq(transactions.group_id, groupId)
```

En el INSERT de la transacción, añadir `group_id`:
```typescript
await db.insert(transactions).values({
  id,
  user_id: userId,   // quien la registró
  group_id: groupId, // ← nuevo
  category_id,
  amount_ars,
  amount_usd,
  merchant: merchant ?? null,
  description: description ?? null,
  date,
  month,
  source: "web",
  status: "active",
  is_exception: is_exception ? 1 : 0,
});
```

Añadir imports al inicio del archivo:
```typescript
import { getGroupMembership } from "@/lib/groups/permissions";
```

- [ ] **Step 2: Actualizar `app/api/transactions/[id]/route.ts`** (si existe)

Verificar existencia: `ls app/api/transactions/[id]/`

Si existe, aplicar el mismo patrón: leer `x-group-id`, verificar membresía, filtrar por `group_id` en lugar de `user_id`.

- [ ] **Step 3: Actualizar `app/api/categories/route.ts`**

En GET:
```typescript
const groupId = req.headers.get("x-group-id");
if (!groupId) return NextResponse.json({ error: "No active group" }, { status: 400 });

// Cambiar la query para filtrar por group_id
const cats = await db.query.categories.findMany({
  where: all
    ? eq(categories.group_id, groupId)
    : and(eq(categories.is_active, 1), eq(categories.group_id, groupId)),
  orderBy: (c, { asc }) => asc(c.sort_order),
});
```

En POST, añadir `group_id` al INSERT:
```typescript
const [created] = await db.insert(categories).values({
  id: randomUUID(),
  slug,
  name,
  emoji,
  sort_order,
  default_hard_limit: default_hard_limit ? 1 : 0,
  is_active: 1,
  group_id: groupId, // ← nuevo
}).returning();
```

- [ ] **Step 4: Actualizar `app/api/categories/[id]/route.ts`**

Añadir verificación de que la categoría pertenece al grupo activo en PATCH y DELETE:

```typescript
const groupId = req.headers.get("x-group-id");
if (!groupId) return NextResponse.json({ error: "No active group" }, { status: 400 });

// Verificar que la categoría pertenece al grupo
const cat = await db.query.categories.findFirst({
  where: and(eq(categories.id, id), eq(categories.group_id, groupId)),
});
if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });
```

- [ ] **Step 5: Actualizar `app/api/export/route.ts`**

Cambiar los filtros de `user_id` a `group_id`:

```typescript
const groupId = hdrs.get("x-group-id");
if (!groupId) return NextResponse.json({ error: "No active group" }, { status: 400 });

// En las queries, cambiar eq(transactions.user_id, userId) por eq(transactions.group_id, groupId)
// y eq(budgets.user_id, userId) por eq(budgets.group_id, groupId)
```

- [ ] **Step 6: Correr el build para detectar errores de tipo**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
npm run build 2>&1 | tail -40
```

Expected: Build exitoso. Si hay errores de tipo, corregirlos.

- [ ] **Step 7: Commit**

```bash
git add app/api/transactions/ app/api/categories/ app/api/export/
git commit -m "feat: scope all data routes to group_id"
```

---

## Task 9: GroupSwitcher component + Sidebar update

**Files:**
- Create: `components/dashboard/GroupSwitcher.tsx`
- Modify: `components/dashboard/HermesSidebar.tsx`

- [ ] **Step 1: Crear `components/dashboard/GroupSwitcher.tsx`**

```tsx
"use client";
import { useState, useEffect, useRef } from "react";

interface Group {
  group_id: string;
  role: "owner" | "admin" | "member";
  group: { id: string; name: string; owner_id: string };
}

interface GroupSwitcherProps {
  onGroupChange?: (groupId: string) => void;
}

async function setActiveGroup(groupId: string) {
  await fetch("/api/groups/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_id: groupId }) });
  window.location.reload();
}

export function GroupSwitcher({ onGroupChange }: GroupSwitcherProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/groups")
      .then(r => r.json())
      .then((data: Group[]) => {
        setGroups(data);
        if (data.length > 0) setActiveGroupId(data[0].group_id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const activeGroup = groups.find(g => g.group_id === activeGroupId);
  const MAX_OWNED = 2;
  const ownedCount = groups.filter(g => g.role === "owner").length;

  if (groups.length === 0) return null;

  return (
    <div ref={ref} style={{ position: "relative", padding: "10px 12px", borderBottom: "1px solid var(--hborder)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: "var(--haccent-bg)", border: "1px solid var(--hborder)",
          borderRadius: 8, padding: "8px 10px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, color: "var(--htext1)",
        }}
      >
        <span style={{ fontSize: "1.1rem" }}>🏠</span>
        <span style={{ flex: 1, textAlign: "left", fontSize: "0.82rem", fontWeight: 600 }}>
          {activeGroup?.group.name ?? "Grupo"}
        </span>
        <span style={{ fontSize: "0.7rem", color: "var(--htext3)" }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% - 4px)", left: 8, right: 8, zIndex: 50,
          background: "var(--hsurface)", border: "1px solid var(--hborder)",
          borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 12px 4px", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--htext3)" }}>
            Mis grupos
          </div>
          {groups.map(g => (
            <button
              key={g.group_id}
              onClick={() => { setActiveGroupId(g.group_id); setOpen(false); setActiveGroup(g.group_id); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", background: g.group_id === activeGroupId ? "var(--haccent-bg)" : "transparent",
                border: "none", cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{ fontSize: "0.85rem" }}>🏠</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--htext1)" }}>{g.group.name}</span>
                <span style={{ display: "block", fontSize: "0.7rem", color: "var(--htext3)" }}>{g.role} · miembros</span>
              </span>
              {g.group_id === activeGroupId && <span style={{ color: "var(--haccent)", fontSize: "0.75rem" }}>✓</span>}
            </button>
          ))}
          <div style={{ height: 1, background: "var(--hborder)", margin: "4px 0" }} />
          {ownedCount < MAX_OWNED ? (
            <button
              onClick={() => { setOpen(false); setShowCreateModal(true); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", background: "transparent", border: "none",
                cursor: "pointer", color: "var(--haccent)", fontSize: "0.82rem", fontWeight: 600,
              }}
            >
              ＋ Nuevo grupo ({ownedCount}/{MAX_OWNED})
            </button>
          ) : (
            <div style={{ padding: "9px 12px", fontSize: "0.75rem", color: "var(--htext3)" }}>
              Límite de {MAX_OWNED} grupos creados alcanzado
            </div>
          )}
        </div>
      )}

      {showCreateModal && <CreateGroupInline onClose={() => setShowCreateModal(false)} onCreated={(id) => { setActiveGroupId(id); setActiveGroup(id); }} />}
    </div>
  );
}

function CreateGroupInline({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error al crear grupo"); return; }
      onCreated(data.id);
      onClose();
    } catch { setError("Error de red"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 12, padding: 24, width: 320 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: "1rem" }}>Nuevo grupo</h3>
        <input
          autoFocus
          type="text"
          placeholder="Nombre del grupo (ej: Trabajo)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCreate()}
          style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--hborder)", background: "var(--hbg)", color: "var(--htext1)", fontSize: "0.85rem", marginBottom: 8 }}
        />
        {error && <p style={{ color: "#f87171", fontSize: "0.78rem", margin: "0 0 8px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid var(--hborder)", background: "transparent", cursor: "pointer", color: "var(--htext2)", fontSize: "0.8rem" }}>Cancelar</button>
          <button onClick={handleCreate} disabled={loading || !name.trim()} style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "var(--haccent)", color: "white", cursor: "pointer", fontSize: "0.8rem" }}>
            {loading ? "Creando..." : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Necesitamos la route `/api/groups/active` para cambiar el grupo activo**

Crear `app/api/groups/active/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getGroupMembership } from "@/lib/groups/permissions";
import { z } from "zod";

const schema = z.object({ group_id: z.string().uuid() });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid group_id" }, { status: 422 });

  const membership = await getGroupMembership(userId, parsed.data.group_id);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("active_group_id", parsed.data.group_id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
```

- [ ] **Step 3: Actualizar `components/dashboard/HermesSidebar.tsx`**

Añadir el `GroupSwitcher` después del brand y una sección "Grupo" con links a settings:

En el import:
```tsx
import { GroupSwitcher } from "./GroupSwitcher";
```

Reemplazar el bloque `{/* Brand */}` + `{/* Nav */}` para insertar el `GroupSwitcher` entre el brand y la nav, y agregar la sección Grupo:

```tsx
{/* Brand */}
<div className="h-sidebar-brand">
  <div className="h-brand-logo">
    <div className="h-brand-icon">H</div>
    <div>
      <div className="h-brand-name">Hermes</div>
      <div className="h-brand-sub">Finance</div>
    </div>
  </div>
</div>

{/* Group switcher */}
<GroupSwitcher />

{/* Nav */}
<nav className="h-sidebar-nav">
  <div className="h-nav-label">Principal</div>
  {/* ... links existentes ... */}

  <div className="h-nav-label" style={{ marginTop: 16 }}>Grupo</div>
  <Link
    href="/dashboard/group/settings"
    className={`h-nav-item${pathname === "/dashboard/group/settings" ? " active" : ""}`}
    onClick={() => setMobileOpen(false)}
  >
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
    Miembros y permisos
  </Link>
  {/* ... resto del nav existente ... */}
</nav>
```

- [ ] **Step 4: Verificar build**

```bash
npm run build 2>&1 | tail -30
```

Expected: Build exitoso.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/GroupSwitcher.tsx components/dashboard/HermesSidebar.tsx app/api/groups/active/
git commit -m "feat: add GroupSwitcher to sidebar and active group API"
```

---

## Task 10: Group Settings page + InviteModal

**Files:**
- Create: `app/dashboard/group/settings/page.tsx`
- Create: `components/dashboard/InviteModal.tsx`

- [ ] **Step 1: Crear `components/dashboard/InviteModal.tsx`**

```tsx
"use client";
import { useState } from "react";

interface InviteModalProps {
  groupId: string;
  onClose: () => void;
}

export function InviteModal({ groupId, onClose }: InviteModalProps) {
  const [role, setRole] = useState<"member" | "admin">("member");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const inviteUrl = token ? `${window.location.origin}/join/${token}` : null;

  async function generateLink() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/groups/${groupId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error al generar el link"); return; }
      setToken(data.token);
    } catch { setError("Error de red"); }
    finally { setLoading(false); }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 12, padding: 24, width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Invitar miembro</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--htext3)", fontSize: "1.2rem" }}>×</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--htext3)", marginBottom: 8 }}>
            Rol del invitado
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["member", "admin"] as const).map(r => (
              <button
                key={r}
                onClick={() => { setRole(r); setToken(null); }}
                style={{
                  padding: "7px 14px", borderRadius: 6, border: "1px solid var(--hborder)",
                  background: role === r ? "var(--haccent)" : "transparent",
                  color: role === r ? "white" : "var(--htext2)", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
                }}
              >
                {r === "member" ? "Member" : "Admin"}
              </button>
            ))}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "0.72rem", color: "var(--htext3)" }}>
            {role === "admin" ? "Puede editar presupuestos e invitar miembros." : "Puede ver y agregar transacciones."}
          </p>
        </div>

        {!token ? (
          <button
            onClick={generateLink}
            disabled={loading}
            style={{ width: "100%", padding: "10px", borderRadius: 6, border: "none", background: "var(--haccent)", color: "white", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}
          >
            {loading ? "Generando..." : "Generar link de invitación"}
          </button>
        ) : (
          <div>
            <div style={{ background: "var(--hbg)", border: "1px solid var(--hborder)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "var(--haccent)", wordBreak: "break-all", marginBottom: 6 }}>
                {inviteUrl}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--htext3)" }}>⏱ Expira en 7 días · Un solo uso</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={copyLink} style={{ flex: 1, padding: "8px", borderRadius: 6, border: "none", background: "var(--haccent)", color: "white", cursor: "pointer", fontSize: "0.8rem" }}>
                {copied ? "✓ Copiado" : "📋 Copiar link"}
              </button>
              <button onClick={generateLink} disabled={loading} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext2)", cursor: "pointer", fontSize: "0.8rem" }}>
                🔄 Nuevo
              </button>
            </div>
          </div>
        )}
        {error && <p style={{ color: "#f87171", fontSize: "0.78rem", margin: "10px 0 0" }}>{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear `app/dashboard/group/settings/page.tsx`**

```tsx
"use client";
import { useState, useEffect } from "react";
import { InviteModal } from "@/components/dashboard/InviteModal";

interface Member {
  group_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  user: { id: string; name: string };
}

interface Group {
  id: string;
  name: string;
  owner_id: string;
  role: "owner" | "admin" | "member";
}

export default function GroupSettingsPage() {
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [groupsRes] = await Promise.all([fetch("/api/groups")]);
        const groups: Group[] = await groupsRes.json();
        if (groups.length === 0) return;
        const activeGroup = groups[0]; // Use first group (active)
        setGroup(activeGroup);
        setEditName(activeGroup.name);

        const membersRes = await fetch(`/api/groups/${activeGroup.id}/members`);
        const membersData: Member[] = await membersRes.json();
        setMembers(membersData);
      } catch { setError("Error al cargar el grupo"); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  async function handleRename() {
    if (!group || !editName.trim()) return;
    setSavingName(true);
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) { setGroup(g => g ? { ...g, name: editName.trim() } : g); setSuccess("Nombre actualizado"); }
      else { const d = await res.json(); setError(d.error ?? "Error"); }
    } catch { setError("Error de red"); }
    finally { setSavingName(false); }
  }

  async function handleChangeRole(userId: string, newRole: "admin" | "member") {
    if (!group) return;
    try {
      const res = await fetch(`/api/groups/${group.id}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) setMembers(ms => ms.map(m => m.user_id === userId ? { ...m, role: newRole } : m));
      else { const d = await res.json(); setError(d.error ?? "Error"); }
    } catch { setError("Error de red"); }
  }

  async function handleRemoveMember(userId: string) {
    if (!group || !confirm("¿Remover este miembro del grupo?")) return;
    try {
      const res = await fetch(`/api/groups/${group.id}/members/${userId}`, { method: "DELETE" });
      if (res.ok) setMembers(ms => ms.filter(m => m.user_id !== userId));
      else { const d = await res.json(); setError(d.error ?? "Error"); }
    } catch { setError("Error de red"); }
  }

  async function handleDeleteGroup() {
    if (!group || !confirm(`¿Eliminar el grupo "${group.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/groups/${group.id}`, { method: "DELETE" });
      if (res.ok) window.location.href = "/dashboard";
      else { const d = await res.json(); setError(d.error ?? "Error"); }
    } catch { setError("Error de red"); }
  }

  if (loading) return <div style={{ padding: 32, color: "var(--htext2)" }}>Cargando...</div>;
  if (!group) return <div style={{ padding: 32, color: "var(--htext2)" }}>No tenés ningún grupo activo.</div>;

  const isOwner = group.role === "owner";
  const canManage = group.role === "owner" || group.role === "admin";

  return (
    <div style={{ maxWidth: 600, padding: "24px 20px" }}>
      <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 4 }}>Configuración del grupo</h1>
      <p style={{ color: "var(--htext3)", fontSize: "0.85rem", marginBottom: 28 }}>Grupo actual: {group.name}</p>

      {error && <div style={{ background: "#7f1d1d", color: "#fca5a5", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: "0.82rem" }}>{error}<button onClick={() => setError("")} style={{ marginLeft: 8, background: "none", border: "none", color: "#fca5a5", cursor: "pointer" }}>×</button></div>}
      {success && <div style={{ background: "#14532d", color: "#86efac", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: "0.82rem" }}>{success}<button onClick={() => setSuccess("")} style={{ marginLeft: 8, background: "none", border: "none", color: "#86efac", cursor: "pointer" }}>×</button></div>}

      {/* Rename */}
      {isOwner && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--htext3)", marginBottom: 10 }}>Nombre del grupo</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleRename()}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--hborder)", background: "var(--hbg)", color: "var(--htext1)", fontSize: "0.85rem" }}
            />
            <button onClick={handleRename} disabled={savingName || !editName.trim()} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "var(--haccent)", color: "white", cursor: "pointer", fontSize: "0.8rem" }}>
              {savingName ? "..." : "Guardar"}
            </button>
          </div>
        </section>
      )}

      {/* Members */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--htext3)", margin: 0 }}>
            Miembros ({members.length})
          </h2>
          {canManage && (
            <button onClick={() => setShowInviteModal(true)} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext1)", cursor: "pointer", fontSize: "0.78rem" }}>
              + Invitar
            </button>
          )}
        </div>
        {members.map(m => (
          <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--hborder)" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--haccent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "white", fontSize: "0.85rem", flexShrink: 0 }}>
              {m.user.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--htext1)" }}>{m.user.name}</div>
            </div>
            <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: m.role === "owner" ? "#312e81" : m.role === "admin" ? "#14532d" : "var(--hborder)", color: m.role === "owner" ? "#c7d2fe" : m.role === "admin" ? "#86efac" : "var(--htext2)" }}>
              {m.role}
            </span>
            {isOwner && m.role !== "owner" && (
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => handleChangeRole(m.user_id, m.role === "admin" ? "member" : "admin")} style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext2)", cursor: "pointer", fontSize: "0.7rem" }}>
                  {m.role === "admin" ? "→ Member" : "→ Admin"}
                </button>
                <button onClick={() => handleRemoveMember(m.user_id)} style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid #7f1d1d", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: "0.7rem" }}>
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Danger zone */}
      {isOwner && (
        <section>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#f87171", marginBottom: 10 }}>Zona de peligro</h2>
          <button onClick={handleDeleteGroup} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #7f1d1d", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: "0.82rem" }}>
            Eliminar grupo "{group.name}"
          </button>
          <p style={{ fontSize: "0.72rem", color: "var(--htext3)", marginTop: 6 }}>Esta acción eliminará todos los datos del grupo y no se puede deshacer.</p>
        </section>
      )}

      {showInviteModal && <InviteModal groupId={group.id} onClose={() => setShowInviteModal(false)} />}
    </div>
  );
}
```

- [ ] **Step 3: Verificar build**

```bash
npm run build 2>&1 | tail -30
```

Expected: Build exitoso.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/InviteModal.tsx app/dashboard/group/
git commit -m "feat: add group settings page and invite modal"
```

---

## Task 11: Join page (pública)

**Files:**
- Create: `app/join/[token]/page.tsx`

- [ ] **Step 1: Crear `app/join/[token]/page.tsx`**

```tsx
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import JoinClient from "./JoinClient";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function JoinPage({ params }: Props) {
  const { token } = await params;
  return <JoinClient token={token} />;
}
```

- [ ] **Step 2: Crear `app/join/[token]/JoinClient.tsx`**

```tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface InvitationInfo {
  group: { id: string; name: string };
  invited_by: { name: string };
  role: "admin" | "member";
  expires_at: number;
}

export default function JoinClient({ token }: { token: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "expired" | "used">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetch(`/api/join/${token}`)
      .then(async r => {
        if (r.status === 410) { setStatus("expired"); return; }
        if (r.status === 409) { setStatus("used"); return; }
        if (!r.ok) { setStatus("error"); setErrorMsg("Invitación no encontrada."); return; }
        const data = await r.json();
        setInfo(data);
        setStatus("ready");
      })
      .catch(() => { setStatus("error"); setErrorMsg("Error de red."); });
  }, [token]);

  async function handleAccept() {
    setJoining(true);
    try {
      const res = await fetch(`/api/join/${token}`, { method: "POST" });
      if (res.status === 401) { router.push(`/login?redirect=/join/${token}`); return; }
      if (!res.ok) {
        const d = await res.json();
        setStatus("error");
        setErrorMsg(d.error ?? "Error al unirse");
        return;
      }
      const data = await res.json();
      // Set active group cookie and redirect
      await fetch("/api/groups/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_id: data.group_id }) });
      router.push("/dashboard");
    } catch { setStatus("error"); setErrorMsg("Error de red."); }
    finally { setJoining(false); }
  }

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--hbg)", padding: 20,
  };
  const cardStyle: React.CSSProperties = {
    background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 16,
    padding: "36px 28px", width: "100%", maxWidth: 360, textAlign: "center",
  };

  if (status === "loading") return (
    <div style={containerStyle}>
      <div style={cardStyle}><p style={{ color: "var(--htext2)" }}>Verificando invitación...</p></div>
    </div>
  );

  if (status === "expired") return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⏰</div>
        <h1 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Invitación vencida</h1>
        <p style={{ color: "var(--htext3)", fontSize: "0.85rem" }}>Pedile al owner del grupo que genere un nuevo link.</p>
      </div>
    </div>
  );

  if (status === "used") return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>✅</div>
        <h1 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Invitación ya usada</h1>
        <p style={{ color: "var(--htext3)", fontSize: "0.85rem" }}>Este link de invitación ya fue utilizado.</p>
        <button onClick={() => router.push("/dashboard")} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--haccent)", color: "white", cursor: "pointer" }}>
          Ir al dashboard
        </button>
      </div>
    </div>
  );

  if (status === "error") return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>❌</div>
        <h1 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Invitación no válida</h1>
        <p style={{ color: "var(--htext3)", fontSize: "0.85rem" }}>{errorMsg}</p>
      </div>
    </div>
  );

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🏠</div>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4 }}>Te invitaron al grupo</h1>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--haccent-bg)", borderRadius: 8, padding: "10px 16px", margin: "12px 0 16px" }}>
          <span style={{ fontSize: "1.1rem" }}>🏠</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--htext1)" }}>{info?.group.name}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--htext3)" }}>
              Invitado por {info?.invited_by.name} · Rol: {info?.role}
            </div>
          </div>
        </div>
        <p style={{ fontSize: "0.82rem", color: "var(--htext3)", marginBottom: 20 }}>
          {info?.role === "admin"
            ? "Podrás ver, agregar y editar gastos del grupo."
            : "Podrás ver y agregar transacciones al grupo compartido."}
        </p>
        <button
          onClick={handleAccept}
          disabled={joining}
          style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: "var(--haccent)", color: "white", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600, marginBottom: 8 }}
        >
          {joining ? "Uniéndome..." : "Aceptar invitación"}
        </button>
        <button
          onClick={() => router.push("/")}
          style={{ width: "100%", padding: "11px", borderRadius: 8, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext2)", cursor: "pointer", fontSize: "0.9rem" }}
        >
          Rechazar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Asegurarse que `/join` está en PUBLIC_PATHS del middleware**

Verificar que `middleware.ts` (modificado en Task 7) incluye `/join` en el array PUBLIC_PATHS. Ya fue incluido en ese paso.

- [ ] **Step 3: Verificar build completo**

```bash
npm run build 2>&1 | tail -40
```

Expected: Build exitoso sin errores de TypeScript.

- [ ] **Step 4: Correr toda la suite de tests**

```bash
npx jest --no-coverage 2>&1 | tail -30
```

Expected: Todos los tests de grupos y join pasan. El test pre-existente `lib/ai/__tests__/parse-message.test.ts` puede seguir fallando por el mismatch de nombre del modelo (es un bug pre-existente no relacionado).

- [ ] **Step 5: Commit**

```bash
git add app/join/
git commit -m "feat: add public join page for group invitations"
```

---

## Task 12: Deploy y verificación final

- [ ] **Step 1: Correr suite completa una vez más**

```bash
npx jest --no-coverage 2>&1 | grep -E "(PASS|FAIL|Tests:)" | tail -20
```

Expected: Todos los tests nuevos en PASS.

- [ ] **Step 2: Build final**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build exitoso.

- [ ] **Step 3: Merge a main y deploy**

```bash
git checkout main
git merge feature/multiuser-groups --no-ff -m "feat: multi-user groups phase 1"
git push origin main
vercel --prod
```

- [ ] **Step 4: Verificar en producción**

1. Abrir `https://hermes-finantial-tracker.vercel.app/dashboard`
2. Verificar que el GroupSwitcher aparece en el sidebar con el grupo "Hogar"
3. Navegar a `/dashboard/group/settings` y verificar que carga el grupo
4. Generar un link de invitación y abrirlo en incógnito
5. Verificar que `/join/<token>` muestra la info del grupo

- [ ] **Step 5: Commit final de limpieza si hay cambios**

```bash
git add -A
git commit -m "chore: post-deploy cleanup multi-user groups" --allow-empty
```
