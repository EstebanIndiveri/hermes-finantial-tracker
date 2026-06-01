# Categorías Editables desde la Web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear la página `/dashboard/categories` con editor inline (crear, editar, eliminar) de categorías globales, protegiendo el borrado cuando existen transacciones asociadas.

**Architecture:** API Routes RESTful para CRUD de categorías, con validación Zod y mismas convenciones del proyecto. La página es un Client Component que gestiona estado local de edición. Solo una fila puede estar en modo edición a la vez. DB: Turso (libsql), migration via Node script.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, Zod, `@libsql/client` (migration), TypeScript, `sonner` (toasts).

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---------|--------|----------------|
| `lib/db/schema.ts` | Modificar | Agregar campo `default_hard_limit` a `categories` |
| `scripts/migrate-categories-default-hard-limit.mjs` | Crear (temporal) | Aplicar ALTER TABLE a Turso |
| `app/api/categories/route.ts` | Modificar | Extender GET con `?all=true`; agregar POST |
| `app/api/categories/__tests__/route.test.ts` | Crear | Tests para GET y POST |
| `app/api/categories/[id]/route.ts` | Crear | PATCH + DELETE con guards |
| `app/api/categories/[id]/__tests__/route.test.ts` | Crear | Tests para PATCH y DELETE |
| `app/dashboard/categories/page.tsx` | Crear | Página con editor inline |
| `app/hermes.css` | Modificar | Estilos del editor inline |
| `components/dashboard/HermesSidebar.tsx` | Modificar | Agregar link a Categorías |

---

## Task 1: DB migration — agregar `default_hard_limit` a `categories`

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `scripts/migrate-categories-default-hard-limit.mjs`

- [ ] **Step 1: Agregar el campo al schema Drizzle**

En `lib/db/schema.ts`, dentro de `sqliteTable("categories", { ... })`, agregar después de `sort_order`:

```typescript
  default_hard_limit: integer("default_hard_limit").notNull().default(1),
```

El bloque completo de la tabla queda:

```typescript
export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("📦"),
  is_active: integer("is_active").notNull().default(1),
  sort_order: integer("sort_order").notNull().default(0),
  default_hard_limit: integer("default_hard_limit").notNull().default(1),
});
```

- [ ] **Step 2: Crear script de migración**

Crear `scripts/migrate-categories-default-hard-limit.mjs`:

```javascript
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

// Parse .env.local manually
const envContent = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envContent.split("\n")
    .filter(line => line.includes("=") && !line.startsWith("#"))
    .map(line => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^"|"$/g, "")];
    })
);

const client = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
});

async function migrate() {
  console.log("Applying migration: add default_hard_limit to categories...");
  
  // Check if column already exists
  const tableInfo = await client.execute("PRAGMA table_info(categories)");
  const hasColumn = tableInfo.rows.some(row => row[1] === "default_hard_limit");
  
  if (hasColumn) {
    console.log("Column already exists, skipping.");
    process.exit(0);
  }
  
  await client.execute(
    "ALTER TABLE categories ADD COLUMN default_hard_limit INTEGER NOT NULL DEFAULT 1"
  );
  
  console.log("Migration applied successfully.");
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Ejecutar la migración**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
node scripts/migrate-categories-default-hard-limit.mjs
```

Expected: `Migration applied successfully.`

- [ ] **Step 4: Verificar en Turso**

```bash
node -e "
import('@libsql/client').then(({ createClient }) => {
  import('fs').then(({ readFileSync }) => {
    const env = Object.fromEntries(readFileSync('.env.local','utf-8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^\"|\"$/g,'')]}));
    const c = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
    c.execute('PRAGMA table_info(categories)').then(r=>{ console.log(r.rows.map(row=>row[1])); process.exit(0); });
  });
});
"
```

Expected: array de columnas que incluye `"default_hard_limit"`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts scripts/migrate-categories-default-hard-limit.mjs
git commit -m "feat: add default_hard_limit column to categories table"
```

---

## Task 2: Extender GET + agregar POST en `/api/categories`

**Files:**
- Modify: `app/api/categories/route.ts`
- Create: `app/api/categories/__tests__/route.test.ts`

### Función auxiliar de slug

```typescript
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 50);
}
```

- [ ] **Step 1: Escribir los tests que van a fallar**

Crear `app/api/categories/__tests__/route.test.ts`:

```typescript
import { GET, POST } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      categories: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    },
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn(),
      })),
    })),
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => []),
      })),
    })),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

function makeReq(url: string, options?: RequestInit) {
  return new NextRequest(url, options);
}

function withUser(req: NextRequest, userId = "user-123") {
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((key: string) => key === "x-user-id" ? userId : null),
  });
  return req;
}

describe("GET /api/categories", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/categories");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns active categories by default", async () => {
    (mockDb.query.categories.findMany as jest.Mock).mockResolvedValue([
      { id: "1", name: "Comida", emoji: "🍕", slug: "comida", is_active: 1, sort_order: 1, default_hard_limit: 1 },
    ]);
    const req = withUser(makeReq("http://localhost/api/categories"));
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockDb.query.categories.findMany).toHaveBeenCalledTimes(1);
  });

  it("returns all categories when ?all=true", async () => {
    (mockDb.query.categories.findMany as jest.Mock).mockResolvedValue([]);
    const req = withUser(makeReq("http://localhost/api/categories?all=true"));
    const res = await GET(req);
    expect(res.status).toBe(200);
    // Called without is_active filter — just verify it doesn't crash
    expect(mockDb.query.categories.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/categories", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Nueva", emoji: "🆕", sort_order: 10, default_hard_limit: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 422 when name is missing", async () => {
    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ emoji: "🆕", sort_order: 10 }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 422 when emoji is missing", async () => {
    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Nueva", sort_order: 10 }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 422 when sort_order is out of range", async () => {
    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Nueva", emoji: "🆕", sort_order: 0 }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 409 when slug already exists", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "existing" });
    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Comida", emoji: "🍕", sort_order: 5 }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("creates category and returns 201 when valid", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue(null);
    const created = { id: "new-id", slug: "nueva", name: "Nueva", emoji: "🆕", sort_order: 10, default_hard_limit: 1, is_active: 1 };
    (mockDb.insert as jest.Mock).mockReturnValue({
      values: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([created]) })),
    });
    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Nueva", emoji: "🆕", sort_order: 10 }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.slug).toBe("nueva");
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
npx jest app/api/categories/__tests__/route.test.ts --no-coverage
```

Expected: FAIL — `POST is not a function` y errores similares.

- [ ] **Step 3: Reemplazar `app/api/categories/route.ts` con la implementación completa**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";

const postSchema = z.object({
  name: z.string().min(1).max(40),
  emoji: z.string().min(1).max(8),
  sort_order: z.number().int().min(1).max(99),
  default_hard_limit: z.boolean().optional().default(true),
});

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 50);
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const all = req.nextUrl.searchParams.get("all") === "true";

    const cats = await db.query.categories.findMany({
      where: all ? undefined : eq(categories.is_active, 1),
      orderBy: (c, { asc }) => asc(c.sort_order),
    });

    return NextResponse.json(cats);
  } catch (err) {
    console.error("Error fetching categories:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

    const { name, emoji, sort_order, default_hard_limit } = parsed.data;
    const slug = toSlug(name);

    const existing = await db.query.categories.findFirst({
      where: eq(categories.slug, slug),
    });
    if (existing) {
      return NextResponse.json({ error: "Ya existe una categoría con ese nombre." }, { status: 409 });
    }

    const [created] = await db
      .insert(categories)
      .values({
        id: randomUUID(),
        slug,
        name,
        emoji,
        sort_order,
        default_hard_limit: default_hard_limit ? 1 : 0,
        is_active: 1,
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("Error creating category:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
npx jest app/api/categories/__tests__/route.test.ts --no-coverage
```

Expected: PASS — todos en verde.

- [ ] **Step 5: Commit**

```bash
git add app/api/categories/route.ts app/api/categories/__tests__/route.test.ts
git commit -m "feat: extend GET and add POST to /api/categories"
```

---

## Task 3: Crear `GET /api/categories/[id]`, `PATCH /api/categories/[id]` y `DELETE /api/categories/[id]`

**Files:**
- Create: `app/api/categories/[id]/route.ts`
- Create: `app/api/categories/[id]/__tests__/route.test.ts`

- [ ] **Step 1: Escribir los tests que van a fallar**

Crear `app/api/categories/[id]/__tests__/route.test.ts`:

```typescript
import { PATCH, DELETE } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      categories: { findFirst: jest.fn() },
    },
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn(),
        })),
      })),
    })),
    delete: jest.fn(() => ({
      where: jest.fn(),
    })),
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => []),
      })),
    })),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

function makeReq(url: string, options?: RequestInit) {
  return new NextRequest(url, options);
}

function withUser(req: NextRequest, userId = "user-123") {
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((key: string) => key === "x-user-id" ? userId : null),
  });
  return req;
}

const params = { params: Promise.resolve({ id: "cat-123" }) };

describe("PATCH /api/categories/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/categories/cat-123", {
      method: "PATCH",
      body: JSON.stringify({ name: "Nuevo nombre" }),
    });
    const res = await PATCH(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 404 when category does not exist", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue(null);
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", {
      method: "PATCH",
      body: JSON.stringify({ name: "Nuevo nombre" }),
    }));
    const res = await PATCH(req, params);
    expect(res.status).toBe(404);
  });

  it("returns 422 when name exceeds 40 chars", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123" });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", {
      method: "PATCH",
      body: JSON.stringify({ name: "a".repeat(41) }),
    }));
    const res = await PATCH(req, params);
    expect(res.status).toBe(422);
  });

  it("returns 200 and updated category on valid patch", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123", slug: "comida" });
    const updated = { id: "cat-123", name: "Comida Updated", emoji: "🍕", sort_order: 1, default_hard_limit: 1, is_active: 1, slug: "comida" };
    (mockDb.update as jest.Mock).mockReturnValue({
      set: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([updated]) })),
      })),
    });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", {
      method: "PATCH",
      body: JSON.stringify({ name: "Comida Updated" }),
    }));
    const res = await PATCH(req, params);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Comida Updated");
  });
});

describe("DELETE /api/categories/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/categories/cat-123", { method: "DELETE" });
    const res = await DELETE(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 404 when category does not exist", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue(null);
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", { method: "DELETE" }));
    const res = await DELETE(req, params);
    expect(res.status).toBe(404);
  });

  it("returns 409 when category has transactions", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123" });
    // Mock transactions query to return 1 row
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn(() => [{ id: "tx-1" }]),
      })),
    });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", { method: "DELETE" }));
    const res = await DELETE(req, params);
    expect(res.status).toBe(409);
  });

  it("returns 200 when category has no transactions", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123" });
    // Mock transactions query to return empty array
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn(() => []),
      })),
    });
    (mockDb.delete as jest.Mock).mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", { method: "DELETE" }));
    const res = await DELETE(req, params);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
npx jest "app/api/categories/\[id\]/__tests__/route.test.ts" --no-coverage
```

Expected: FAIL — `Cannot find module '../route'`.

- [ ] **Step 3: Crear `app/api/categories/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { categories, transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  emoji: z.string().min(1).max(8).optional(),
  sort_order: z.number().int().min(1).max(99).optional(),
  default_hard_limit: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const existing = await db.query.categories.findFirst({
      where: eq(categories.id, id),
    });
    if (!existing) return NextResponse.json({ error: "Categoría no encontrada." }, { status: 404 });

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

    const { name, emoji, sort_order, default_hard_limit, is_active } = parsed.data;

    const updateData: Partial<typeof categories.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (emoji !== undefined) updateData.emoji = emoji;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (default_hard_limit !== undefined) updateData.default_hard_limit = default_hard_limit ? 1 : 0;
    if (is_active !== undefined) updateData.is_active = is_active ? 1 : 0;

    const [updated] = await db
      .update(categories)
      .set(updateData)
      .where(eq(categories.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Error updating category:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const existing = await db.query.categories.findFirst({
      where: eq(categories.id, id),
    });
    if (!existing) return NextResponse.json({ error: "Categoría no encontrada." }, { status: 404 });

    const txRows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.category_id, id));

    if (txRows.length > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: tiene ${txRows.length} movimientos.`, count: txRows.length },
        { status: 409 }
      );
    }

    await db.delete(categories).where(eq(categories.id, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error deleting category:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
npx jest "app/api/categories/\[id\]/__tests__/route.test.ts" --no-coverage
```

Expected: PASS — todos en verde.

- [ ] **Step 5: Commit**

```bash
git add "app/api/categories/[id]/route.ts" "app/api/categories/[id]/__tests__/route.test.ts"
git commit -m "feat: add PATCH and DELETE for /api/categories/[id]"
```

---

## Task 4: Página `/dashboard/categories` con editor inline

**Files:**
- Create: `app/dashboard/categories/page.tsx`

- [ ] **Step 1: Crear la página**

```typescript
// app/dashboard/categories/page.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  is_active: number;
  sort_order: number;
  default_hard_limit: number;
}

interface EditState {
  name: string;
  emoji: string;
  sort_order: number;
  default_hard_limit: boolean;
  is_active: boolean;
}

const NEW_ROW_ID = "__new__";

function categoryToEdit(cat: Category): EditState {
  return {
    name: cat.name,
    emoji: cat.emoji,
    sort_order: cat.sort_order,
    default_hard_limit: cat.default_hard_limit === 1,
    is_active: cat.is_active === 1,
  };
}

export default function CategoriesPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/categories?all=true")
      .then(r => r.json())
      .then((data: Category[]) => setCats(data))
      .catch(() => toast.error("Error al cargar categorías"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (editingId) setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [editingId]);

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditState(categoryToEdit(cat));
    setConfirmDeleteId(null);
  }

  function startNew() {
    setEditingId(NEW_ROW_ID);
    setEditState({ name: "", emoji: "", sort_order: cats.length + 1, default_hard_limit: true, is_active: true });
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditState(null);
  }

  async function saveEdit() {
    if (!editState) return;
    const { name, emoji, sort_order, default_hard_limit, is_active } = editState;

    if (!name.trim()) { toast.error("El nombre es requerido."); return; }
    if (!emoji.trim()) { toast.error("El emoji es requerido."); return; }
    if (sort_order < 1 || sort_order > 99) { toast.error("El orden debe ser entre 1 y 99."); return; }

    setSaving(true);
    try {
      if (editingId === NEW_ROW_ID) {
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), emoji: emoji.trim(), sort_order, default_hard_limit }),
        });
        if (res.status === 409) { toast.error("Ya existe una categoría con ese nombre."); return; }
        if (!res.ok) { toast.error("Error al crear categoría."); return; }
        const created: Category = await res.json();
        setCats(prev => [...prev, created].sort((a, b) => a.sort_order - b.sort_order));
        toast.success(`Categoría "${created.name}" creada ✅`);
      } else {
        const res = await fetch(`/api/categories/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), emoji: emoji.trim(), sort_order, default_hard_limit, is_active }),
        });
        if (!res.ok) { toast.error("Error al guardar."); return; }
        const updated: Category = await res.json();
        setCats(prev => prev.map(c => c.id === editingId ? updated : c).sort((a, b) => a.sort_order - b.sort_order));
        toast.success("Categoría guardada ✅");
      }
      cancelEdit();
    } catch {
      toast.error("Error de conexión.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (res.status === 409) {
        const data = await res.json();
        toast.error(data.error ?? "No se puede eliminar.");
        setConfirmDeleteId(null);
        return;
      }
      if (!res.ok) { toast.error("Error al eliminar."); return; }
      setCats(prev => prev.filter(c => c.id !== id));
      toast.success("Categoría eliminada.");
      setConfirmDeleteId(null);
    } catch {
      toast.error("Error de conexión.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--htext3)" }}>
        Cargando categorías...
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 400, color: "var(--htext1)", margin: 0 }}>
          Categorías
        </h1>
        <button className="h-cat-edit-add-btn" onClick={startNew} disabled={editingId !== null}>
          + Nueva categoría
        </button>
      </div>

      <div className="h-card">
        <div className="h-card-body">
          <div className="h-cat-edit-list">
            {/* Header */}
            <div className="h-cat-edit-header">
              <span>Categoría</span>
              <span>Orden</span>
              <span>Límite default</span>
              <span>Estado</span>
              <span></span>
            </div>

            {/* Rows */}
            {cats.map(cat => (
              <div key={cat.id} className={`h-cat-edit-row${editingId === cat.id ? " editing" : ""}${cat.is_active === 0 ? " inactive" : ""}`}>
                {editingId === cat.id && editState ? (
                  // Edit mode
                  <>
                    <div className="h-cat-edit-inputs">
                      <input
                        ref={nameInputRef}
                        className="h-cat-edit-input h-cat-edit-emoji"
                        value={editState.emoji}
                        onChange={e => setEditState(s => s ? { ...s, emoji: e.target.value } : s)}
                        maxLength={2}
                        placeholder="🏷️"
                        aria-label="Emoji"
                      />
                      <input
                        className="h-cat-edit-input h-cat-edit-name"
                        value={editState.name}
                        onChange={e => setEditState(s => s ? { ...s, name: e.target.value } : s)}
                        maxLength={40}
                        placeholder="Nombre"
                        aria-label="Nombre"
                      />
                    </div>
                    <input
                      className="h-cat-edit-input h-cat-edit-order"
                      type="number"
                      min={1}
                      max={99}
                      value={editState.sort_order}
                      onChange={e => setEditState(s => s ? { ...s, sort_order: Number(e.target.value) } : s)}
                      aria-label="Orden"
                    />
                    <label className="h-cat-edit-toggle">
                      <input
                        type="checkbox"
                        checked={editState.default_hard_limit}
                        onChange={e => setEditState(s => s ? { ...s, default_hard_limit: e.target.checked } : s)}
                        aria-label="Límite por defecto"
                      />
                      <span className="h-toggle-track"><span className="h-toggle-thumb" /></span>
                    </label>
                    <label className="h-cat-edit-toggle">
                      <input
                        type="checkbox"
                        checked={editState.is_active}
                        onChange={e => setEditState(s => s ? { ...s, is_active: e.target.checked } : s)}
                        aria-label="Activa"
                      />
                      <span className="h-toggle-track"><span className="h-toggle-thumb" /></span>
                    </label>
                    <div className="h-cat-edit-actions">
                      <button className="h-cat-edit-save" onClick={saveEdit} disabled={saving}>
                        {saving ? "..." : "Guardar"}
                      </button>
                      <button className="h-cat-edit-cancel" onClick={cancelEdit} disabled={saving}>
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  // View mode
                  <>
                    <div className="h-cat-edit-name-cell">
                      <span className="h-cat-edit-emoji-cell">{cat.emoji}</span>
                      <span>{cat.name}</span>
                      {cat.is_active === 0 && <span className="h-cat-edit-inactive-badge">Inactiva</span>}
                    </div>
                    <span className="h-cat-edit-order-cell">{cat.sort_order}</span>
                    <span className={`h-cat-edit-limit-cell ${cat.default_hard_limit === 1 ? "on" : "off"}`}>
                      {cat.default_hard_limit === 1 ? "Sí" : "No"}
                    </span>
                    <span className={`h-cat-edit-status-cell ${cat.is_active === 1 ? "active" : "inactive"}`}>
                      {cat.is_active === 1 ? "Activa" : "Inactiva"}
                    </span>
                    <div className="h-cat-edit-row-actions">
                      {confirmDeleteId === cat.id ? (
                        <>
                          <span className="h-cat-edit-confirm-text">¿Eliminar?</span>
                          <button className="h-cat-edit-confirm-yes" onClick={() => confirmDelete(cat.id)} disabled={saving}>Sí</button>
                          <button className="h-cat-edit-confirm-no" onClick={() => setConfirmDeleteId(null)} disabled={saving}>No</button>
                        </>
                      ) : (
                        <>
                          <button
                            className="h-cat-edit-icon-btn"
                            onClick={() => startEdit(cat)}
                            disabled={editingId !== null}
                            aria-label={`Editar ${cat.name}`}
                          >
                            ✏️
                          </button>
                          <button
                            className="h-cat-edit-icon-btn delete"
                            onClick={() => setConfirmDeleteId(cat.id)}
                            disabled={editingId !== null}
                            aria-label={`Eliminar ${cat.name}`}
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* New row */}
            {editingId === NEW_ROW_ID && editState && (
              <div className="h-cat-edit-row editing new-row">
                <div className="h-cat-edit-inputs">
                  <input
                    ref={nameInputRef}
                    className="h-cat-edit-input h-cat-edit-emoji"
                    value={editState.emoji}
                    onChange={e => setEditState(s => s ? { ...s, emoji: e.target.value } : s)}
                    maxLength={2}
                    placeholder="🏷️"
                    aria-label="Emoji"
                  />
                  <input
                    className="h-cat-edit-input h-cat-edit-name"
                    value={editState.name}
                    onChange={e => setEditState(s => s ? { ...s, name: e.target.value } : s)}
                    maxLength={40}
                    placeholder="Nombre de la categoría"
                    aria-label="Nombre"
                  />
                </div>
                <input
                  className="h-cat-edit-input h-cat-edit-order"
                  type="number"
                  min={1}
                  max={99}
                  value={editState.sort_order}
                  onChange={e => setEditState(s => s ? { ...s, sort_order: Number(e.target.value) } : s)}
                  aria-label="Orden"
                />
                <label className="h-cat-edit-toggle">
                  <input
                    type="checkbox"
                    checked={editState.default_hard_limit}
                    onChange={e => setEditState(s => s ? { ...s, default_hard_limit: e.target.checked } : s)}
                    aria-label="Límite por defecto"
                  />
                  <span className="h-toggle-track"><span className="h-toggle-thumb" /></span>
                </label>
                <span />
                <div className="h-cat-edit-actions">
                  <button className="h-cat-edit-save" onClick={saveEdit} disabled={saving}>
                    {saving ? "..." : "Guardar"}
                  </button>
                  <button className="h-cat-edit-cancel" onClick={cancelEdit} disabled={saving}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {cats.length === 0 && editingId !== NEW_ROW_ID && (
              <div style={{ padding: "24px 0", textAlign: "center", color: "var(--htext3)", fontSize: 14 }}>
                No hay categorías. Creá la primera.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "categories/page" | head -10
```

Expected: sin errores en ese archivo.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/categories/page.tsx
git commit -m "feat: add categories inline editor page"
```

---

## Task 5: CSS del editor inline

**Files:**
- Modify: `app/hermes.css` (agregar al final)

- [ ] **Step 1: Agregar estilos al final de `app/hermes.css`**

```css
/* ── Categories Editor ─────────────────────────────────────── */
.h-cat-edit-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--haccent);
  color: #fff;
  border: none;
  border-radius: var(--hradius-sm);
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: var(--htransition);
}
.h-cat-edit-add-btn:hover:not(:disabled) { background: #1d4ed8; }
.h-cat-edit-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.h-cat-edit-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.h-cat-edit-header {
  display: grid;
  grid-template-columns: 1fr 60px 110px 80px 100px;
  gap: 8px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--htext3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--hborder);
}

.h-cat-edit-row {
  display: grid;
  grid-template-columns: 1fr 60px 110px 80px 100px;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--hborder);
  transition: background 0.15s;
}
.h-cat-edit-row:last-child { border-bottom: none; }
.h-cat-edit-row:hover { background: var(--hsurface2); }
.h-cat-edit-row.editing { background: var(--haccent-soft); border-bottom: 1px solid var(--hborder); }
.h-cat-edit-row.inactive { opacity: 0.55; }

.h-cat-edit-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--htext1);
}
.h-cat-edit-emoji-cell { font-size: 18px; line-height: 1; }
.h-cat-edit-inactive-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--hred-soft);
  color: var(--hred);
  text-transform: uppercase;
}

.h-cat-edit-order-cell { font-size: 13px; color: var(--htext2); }

.h-cat-edit-limit-cell {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  display: inline-block;
}
.h-cat-edit-limit-cell.on { background: var(--hgreen-soft); color: var(--hgreen); }
.h-cat-edit-limit-cell.off { background: var(--hyellow-soft); color: var(--hyellow); }

.h-cat-edit-status-cell {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  display: inline-block;
}
.h-cat-edit-status-cell.active { background: var(--hgreen-soft); color: var(--hgreen); }
.h-cat-edit-status-cell.inactive { background: var(--hred-soft); color: var(--hred); }

.h-cat-edit-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
}
.h-cat-edit-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 14px;
  opacity: 0.4;
  transition: opacity 0.15s, background 0.15s;
}
.h-cat-edit-icon-btn:hover:not(:disabled) { opacity: 1; background: var(--haccent-soft); }
.h-cat-edit-icon-btn.delete:hover:not(:disabled) { background: var(--hred-soft); }
.h-cat-edit-icon-btn:disabled { cursor: not-allowed; }

.h-cat-edit-confirm-text { font-size: 12px; color: var(--hred); font-weight: 500; white-space: nowrap; }
.h-cat-edit-confirm-yes {
  background: var(--hred); color: #fff; border: none;
  border-radius: 4px; padding: 4px 8px; font-size: 12px; cursor: pointer;
}
.h-cat-edit-confirm-no {
  background: var(--hsurface); color: var(--htext2);
  border: 1px solid var(--hborder); border-radius: 4px;
  padding: 4px 8px; font-size: 12px; cursor: pointer;
}

.h-cat-edit-inputs {
  display: flex;
  gap: 6px;
  align-items: center;
}

.h-cat-edit-input {
  padding: 6px 8px;
  border: 1px solid var(--hborder);
  border-radius: var(--hradius-sm);
  background: var(--hsurface);
  color: var(--htext1);
  font-size: 13px;
  font-family: inherit;
  transition: border-color 0.15s;
}
.h-cat-edit-input:focus { outline: none; border-color: var(--haccent); box-shadow: 0 0 0 3px var(--haccent-soft); }
.h-cat-edit-emoji { width: 48px; text-align: center; font-size: 18px; }
.h-cat-edit-name { flex: 1; }
.h-cat-edit-order { width: 56px; text-align: center; }

.h-cat-edit-toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
}
.h-cat-edit-toggle input[type="checkbox"] { display: none; }
.h-cat-edit-toggle input:checked + .h-toggle-track { background: var(--haccent); }
.h-cat-edit-toggle input:checked + .h-toggle-track .h-toggle-thumb { transform: translateX(16px); }

.h-cat-edit-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.h-cat-edit-save {
  background: var(--haccent); color: #fff; border: none;
  border-radius: var(--hradius-sm); padding: 6px 12px;
  font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer;
  transition: background 0.15s;
}
.h-cat-edit-save:hover:not(:disabled) { background: #1d4ed8; }
.h-cat-edit-save:disabled { opacity: 0.5; cursor: not-allowed; }
.h-cat-edit-cancel {
  background: var(--hsurface); color: var(--htext2);
  border: 1px solid var(--hborder); border-radius: var(--hradius-sm);
  padding: 6px 12px; font-size: 12px; font-family: inherit; cursor: pointer;
}

@media (max-width: 640px) {
  .h-cat-edit-header { display: none; }
  .h-cat-edit-row {
    grid-template-columns: 1fr auto;
    gap: 6px;
  }
  .h-cat-edit-order-cell,
  .h-cat-edit-limit-cell,
  .h-cat-edit-status-cell { display: none; }
  .h-cat-edit-row.editing {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/hermes.css
git commit -m "style: add categories inline editor CSS"
```

---

## Task 6: Agregar link en el Sidebar

**Files:**
- Modify: `components/dashboard/HermesSidebar.tsx`

- [ ] **Step 1: Agregar el link de Categorías después del link de Dashboard y antes de la sección Configuración**

En `components/dashboard/HermesSidebar.tsx`, después del `<Link href="/dashboard">...</Link>` (línea ~69) y antes del `<div className="h-nav-label" style={{ marginTop: 16 }}>Configuración</div>`:

```tsx
          <Link
            href="/dashboard/categories"
            className={`h-nav-item${pathname === "/dashboard/categories" ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M7 7h.01M7 12h.01M7 17h.01M11 7h6M11 12h6M11 17h6"/>
            </svg>
            Categorías
          </Link>
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "HermesSidebar" | head -5
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/HermesSidebar.tsx
git commit -m "feat: add Categorias link to sidebar"
```

---

## Task 7: Build + deploy

- [ ] **Step 1: Correr suite completa de tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: todos los tests pasan (salvo pre-existing failure en `parse-message.test.ts` — ignorar).

- [ ] **Step 2: Build de producción**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` sin errores nuevos.

- [ ] **Step 3: Merge a main y push**

```bash
git checkout main
git merge feature/categories-editor --no-ff -m "feat: categories CRUD editor from web dashboard"
git push origin main
```

Expected: push sin conflictos. Vercel desplegará automáticamente.

---

## Checklist pre-merge

- [ ] Suite pasa (`npm test -- --no-coverage`)
- [ ] `npm run build` sin errores
- [ ] GET `?all=true` devuelve todas las categorías incluyendo inactivas
- [ ] POST crea categoría con slug auto-generado
- [ ] PATCH actualiza campos correctamente
- [ ] DELETE bloquea si hay transacciones (409)
- [ ] Editor inline: solo una fila editable a la vez
- [ ] Nueva fila aparece al final en modo edición
- [ ] Toast de error al intentar borrar con transacciones
- [ ] Confirmación inline antes de borrar
- [ ] Link "Categorías" aparece en sidebar con estado activo correcto
- [ ] Responsive mobile: header oculto, columnas simplificadas
