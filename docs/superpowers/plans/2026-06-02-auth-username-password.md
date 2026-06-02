# Auth: Username + Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace token-only login with username + password, add display name management in Settings and Onboarding.

**Architecture:** Add `username` column to users table (unique, backfilled from existing names). Login finds user by username then bcrypt-compares password. Register adds username field. Login/register UIs get two fields. Settings and Onboarding get display name editing.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, SQLite (Turso), bcryptjs, Jest + ts-jest

---

## File Map

| File | Action | Change |
|------|--------|--------|
| `lib/db/migrations/0005_username.sql` | Create | ALTER TABLE + UPDATE + UNIQUE INDEX |
| `lib/db/schema.ts` | Modify | Add `username` field to users table |
| `app/api/auth/login/route.ts` | Modify | `{ token }` → `{ username, password }`, find by username |
| `app/api/auth/login/__tests__/route.test.ts` | Modify | Update tests for new body shape |
| `app/api/auth/register/route.ts` | Modify | Add `username` field, unique check |
| `app/api/auth/register/__tests__/route.test.ts` | Modify | Add username tests |
| `app/api/auth/me/route.ts` | Modify | PATCH accepts optional `name` update |
| `app/api/auth/__tests__/me.patch.test.ts` | Modify | Add name update tests |
| `app/login/page.tsx` | Modify | Two fields: username + contraseña |
| `app/join/[token]/JoinClient.tsx` | Modify | Add username field, rename token→contraseña |
| `app/dashboard/settings/page.tsx` | Modify | Rename token→contraseña, add Cambiar nombre |
| `app/onboarding/page.tsx` | Modify | Step 1 gets editable display name field |

---

### Task 1: DB Migration — add username column

**Files:**
- Create: `lib/db/migrations/0005_username.sql`
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Create migration file**

```sql
-- lib/db/migrations/0005_username.sql
ALTER TABLE users ADD COLUMN username TEXT;
UPDATE users SET username = lower(name);
CREATE UNIQUE INDEX users_username_idx ON users(username);
```

- [ ] **Step 2: Update schema.ts**

In `lib/db/schema.ts`, inside `export const users = sqliteTable("users", {`, add `username` after `name`:

```typescript
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().default(""),
  telegram_user_id: text("telegram_user_id").unique(),
  personal_token_hash: text("personal_token_hash"),
  active_telegram_group_id: text("active_telegram_group_id"),
  onboarding_completed_at: integer("onboarding_completed_at"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});
```

Note: `.default("")` is needed because Drizzle infers NOT NULL from `.notNull()` — the actual DB NOT NULL constraint is enforced by the migration UPDATE + application-level validation. The unique index is in the SQL file.

- [ ] **Step 3: Apply migration to Turso**

```bash
turso db shell hermes-db < lib/db/migrations/0005_username.sql
```

Expected output: no errors, blank response for each statement.

- [ ] **Step 4: Verify migration applied**

```bash
turso db shell hermes-db "SELECT id, name, username FROM users LIMIT 5;"
```

Expected: each row shows `username = lower(name)`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/migrations/0005_username.sql lib/db/schema.ts
git commit -m "feat: add username column to users table"
```

---

### Task 2: Update POST /api/auth/login

**Files:**
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/auth/login/__tests__/route.test.ts`

- [ ] **Step 1: Update tests first (TDD)**

Replace `app/api/auth/login/__tests__/route.test.ts` entirely:

```typescript
import { POST } from "../route";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      users: { findFirst: jest.fn() },
    },
  },
}));
jest.mock("@/lib/utils/session", () => ({
  signSession: jest.fn().mockResolvedValue("signed-session-token"),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require("@/lib/db/client");

function makeReq(body: object) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when username is missing", async () => {
    const res = await POST(makeReq({ password: "somepass" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(makeReq({ username: "alice" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when username not found", async () => {
    jest.mocked(db.query.users.findFirst).mockResolvedValue(undefined);
    const res = await POST(makeReq({ username: "notexist", password: "anypass" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when password does not match", async () => {
    const hash = await bcrypt.hash("correctpass", 10);
    jest.mocked(db.query.users.findFirst).mockResolvedValue({
      id: "user-1", name: "Alice", username: "alice", personal_token_hash: hash,
    } as any);
    const res = await POST(makeReq({ username: "alice", password: "wrongpass" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 and sets session cookie when credentials are correct", async () => {
    const hash = await bcrypt.hash("correctpass", 10);
    jest.mocked(db.query.users.findFirst).mockResolvedValue({
      id: "user-1", name: "Alice", username: "alice", personal_token_hash: hash,
    } as any);
    const res = await POST(makeReq({ username: "alice", password: "correctpass" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(res.headers.get("Set-Cookie")).toContain("hermes_session");
  });

  it("lookup is case-insensitive for username", async () => {
    const hash = await bcrypt.hash("mypass", 10);
    jest.mocked(db.query.users.findFirst).mockResolvedValue({
      id: "user-1", name: "Alice", username: "alice", personal_token_hash: hash,
    } as any);
    const res = await POST(makeReq({ username: "ALICE", password: "mypass" }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd hermes-finantial-tracker && npm test -- --testPathPattern="auth/login" --no-coverage
```

Expected: failures (route still uses old `{ token }` body shape).

- [ ] **Step 3: Replace login route implementation**

Replace `app/api/auth/login/route.ts` entirely:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/utils/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

// In-memory rate limiter: max 10 login attempts per IP per 5 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 5 * 60 * 1000;

function checkRateLimit(ip: string): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { limited: false, retryAfter: 0 };
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return { limited: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { limited: false, retryAfter: 0 };
}

async function createSessionResponse(userId: string): Promise<NextResponse> {
  const sessionValue = await signSession(userId);
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const { limited, retryAfter } = checkRateLimit(ip);
  if (limited) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body?.username || typeof body.username !== "string") {
      return NextResponse.json({ error: "Missing username" }, { status: 400 });
    }
    if (!body?.password || typeof body.password !== "string") {
      return NextResponse.json({ error: "Missing password" }, { status: 400 });
    }

    const { username, password } = body as { username: string; password: string };

    const user = await db.query.users.findFirst({
      where: eq(sql`lower(${users.username})`, username.toLowerCase()),
    });

    if (!user || !user.personal_token_hash) {
      return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
    }

    const match = await bcrypt.compare(password, user.personal_token_hash);
    if (!match) {
      return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
    }

    return createSessionResponse(user.id);
  } catch (err) {
    console.error("Error in login:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests — should all pass**

```bash
npm test -- --testPathPattern="auth/login" --no-coverage
```

Expected: 5 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/login/route.ts app/api/auth/login/__tests__/route.test.ts
git commit -m "feat: login with username + password instead of token"
```

---

### Task 3: Update POST /api/auth/register

**Files:**
- Modify: `app/api/auth/register/route.ts`
- Modify: `app/api/auth/register/__tests__/route.test.ts`

- [ ] **Step 1: Update tests first (TDD)**

Replace `app/api/auth/register/__tests__/route.test.ts` entirely:

```typescript
import { POST } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      group_invitations: { findFirst: jest.fn() },
      users: { findFirst: jest.fn() },
    },
    insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
  },
}));
jest.mock("@/lib/utils/session", () => ({
  signSession: jest.fn().mockResolvedValue("test-session"),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require("@/lib/db/client");

const validInvite = {
  id: "inv-1",
  token: "valid-invite-token",
  group_id: "group-1",
  used_at: null,
  expires_at: Date.now() + 3600000,
  role: "member",
};

function makeReq(body: object) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when name is missing", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    const res = await POST(makeReq({ username: "alice", password: "longpass123", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toMatch(/nombre/i);
  });

  it("returns 400 when password is shorter than 8 chars", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    const res = await POST(makeReq({ name: "Alice", username: "alice", password: "short", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toMatch(/8/);
  });

  it("returns 400 when username is missing", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    const res = await POST(makeReq({ name: "Alice", password: "validpass123", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toMatch(/usuario/i);
  });

  it("returns 400 when username has invalid characters", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    const res = await POST(makeReq({ name: "Alice", username: "alice garcia", password: "validpass123", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toMatch(/usuario/i);
  });

  it("returns 409 when username is already taken", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    jest.mocked(db.query.users.findFirst).mockResolvedValue({ id: "other", username: "alice" } as any);
    const res = await POST(makeReq({ name: "Alice", username: "alice", password: "validpass123", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(409);
  });

  it("returns 410 when invite_token is invalid or expired", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(undefined);
    const res = await POST(makeReq({ name: "Alice", username: "alice", password: "validpass123", invite_token: "bad-token" }));
    expect(res.status).toBe(410);
  });

  it("creates user and returns group_id on valid input", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    jest.mocked(db.query.users.findFirst).mockResolvedValue(undefined);
    const res = await POST(makeReq({ name: "Alice", username: "alice", password: "validpass123", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.group_id).toBe("group-1");
    expect(data.user_id).toBeDefined();
    expect(res.headers.get("Set-Cookie")).toContain("hermes_session");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern="auth/register" --no-coverage
```

Expected: failures.

- [ ] **Step 3: Replace register route implementation**

Replace `app/api/auth/register/route.ts` entirely:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users, group_invitations } from "@/lib/db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { signSession } from "@/lib/utils/session";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { name, username, password, invite_token } = body as {
      name?: string;
      username?: string;
      password?: string;
      invite_token?: string;
    };

    if (!name || typeof name !== "string" || name.trim().length < 1 || name.trim().length > 50) {
      return NextResponse.json({ error: "El nombre debe tener entre 1 y 50 caracteres" }, { status: 400 });
    }
    if (!username || typeof username !== "string" || username.length < 3 || username.length > 30) {
      return NextResponse.json({ error: "El usuario debe tener entre 3 y 30 caracteres" }, { status: 400 });
    }
    if (!USERNAME_REGEX.test(username)) {
      return NextResponse.json({ error: "El usuario solo puede contener letras, números, - y _" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }
    if (!invite_token) {
      return NextResponse.json({ error: "Token de invitación requerido" }, { status: 400 });
    }

    const invitation = await db.query.group_invitations.findFirst({
      where: and(
        eq(group_invitations.token, invite_token),
        isNull(group_invitations.used_at),
        gt(group_invitations.expires_at, Date.now()),
      ),
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitación inválida o expirada" }, { status: 410 });
    }

    const existing = await db.query.users.findFirst({
      where: eq(users.username, username.toLowerCase()),
    });
    if (existing) {
      return NextResponse.json({ error: "Ese nombre de usuario ya está en uso" }, { status: 409 });
    }

    const personal_token_hash = await bcrypt.hash(password, 10);
    const userId = randomUUID();

    await db.insert(users).values({
      id: userId,
      name: name.trim(),
      username: username.toLowerCase(),
      personal_token_hash,
    });

    const sessionValue = await signSession(userId);
    const res = NextResponse.json({ user_id: userId, group_id: invitation.group_id });
    res.cookies.set("hermes_session", sessionValue, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (err) {
    console.error("Error in register:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests — should all pass**

```bash
npm test -- --testPathPattern="auth/register" --no-coverage
```

Expected: 7 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/register/route.ts app/api/auth/register/__tests__/route.test.ts
git commit -m "feat: register with username + password instead of token"
```

---

### Task 4: Extend PATCH /api/auth/me to update display name

**Files:**
- Modify: `app/api/auth/me/route.ts`
- Modify: `app/api/auth/__tests__/me.patch.test.ts`

- [ ] **Step 1: Add tests for name update**

Open `app/api/auth/__tests__/me.patch.test.ts` and ADD these tests after the existing ones (keep existing tests):

```typescript
  it("updates display name when name is provided", async () => {
    jest.mocked(verifySession).mockResolvedValue("user-1");
    jest.mocked(db.query.users.findFirst).mockResolvedValue({ id: "user-1" } as any);
    jest.mocked(db.update).mockReturnValue({
      set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
    } as any);
    const res = await PATCH(makeReq({ name: "Nuevo Nombre" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("returns 400 when name is empty string", async () => {
    jest.mocked(verifySession).mockResolvedValue("user-1");
    jest.mocked(db.query.users.findFirst).mockResolvedValue({ id: "user-1" } as any);
    const res = await PATCH(makeReq({ name: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body has neither onboarding_completed nor name", async () => {
    jest.mocked(verifySession).mockResolvedValue("user-1");
    jest.mocked(db.query.users.findFirst).mockResolvedValue({ id: "user-1" } as any);
    const res = await PATCH(makeReq({}));
    expect(res.status).toBe(400);
  });
```

Note: `makeReq` already exists in this file — just add the new `it()` blocks inside the existing `describe` block.

- [ ] **Step 2: Run tests to confirm new ones fail**

```bash
npm test -- --testPathPattern="me.patch" --no-coverage
```

Expected: 2 new tests fail, existing tests still pass.

- [ ] **Step 3: Update PATCH /api/auth/me**

Replace the `PATCH` function in `app/api/auth/me/route.ts`:

```typescript
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? await verifySession(cookie) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: { onboarding_completed_at?: number; name?: string } = {};

  if (body.onboarding_completed === true) {
    updates.onboarding_completed_at = Date.now();
  }

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.trim().length > 50) {
      return NextResponse.json({ error: "El nombre debe tener entre 1 y 50 caracteres" }, { status: 400 });
    }
    updates.name = body.name.trim();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  await db.update(users)
    .set(updates)
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run all tests — should pass**

```bash
npm test -- --testPathPattern="me.patch" --no-coverage
```

Expected: all tests pass (existing + new).

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/me/route.ts app/api/auth/__tests__/me.patch.test.ts
git commit -m "feat: PATCH /api/auth/me accepts name update"
```

---

### Task 5: Update login page UI

**Files:**
- Modify: `app/login/page.tsx`

- [ ] **Step 1: Replace LoginForm component**

Replace the entire content of `app/login/page.tsx` with:

```tsx
"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError("Usuario o contraseña incorrectos.");
        setLoading(false);
        return;
      }
      router.push(redirectTo);
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
      setLoading(false);
    }
  }

  return (
    <div
      data-hermes=""
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--hbg)",
        padding: "20px",
        width: "100%",
      }}
    >
      <div
        style={{
          background: "var(--hsurface)",
          border: "1px solid var(--hborder)",
          borderRadius: 16,
          padding: "40px 32px",
          width: "100%",
          maxWidth: 360,
          boxShadow: "var(--hshadow-lg)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: "2rem", marginBottom: 8 }}>💰</div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--htext1)", margin: 0 }}>
            Hermes Finance
          </h1>
          <p style={{ fontSize: "0.82rem", color: "var(--htext3)", marginTop: 4 }}>
            Ingresá con tu usuario y contraseña
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="username"
              style={{ display: "block", fontSize: "0.82rem", fontWeight: 500, color: "var(--htext2)", marginBottom: 6 }}
            >
              Usuario
            </label>
            <input
              id="username"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="tu_usuario"
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--hborder)",
                background: "var(--hsurface2)",
                color: "var(--htext1)",
                fontSize: "16px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="password"
              style={{ display: "block", fontSize: "0.82rem", fontWeight: 500, color: "var(--htext2)", marginBottom: 6 }}
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--hborder)",
                background: "var(--hsurface2)",
                color: "var(--htext1)",
                fontSize: "16px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{ color: "var(--herror)", fontSize: "0.85rem", marginBottom: 16, textAlign: "center" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: 10,
              border: "none",
              background: loading ? "var(--htext3)" : "var(--haccent)",
              color: "#fff",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 2: Run full test suite to confirm nothing broke**

```bash
npm test -- --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: update login page to username + contraseña"
```

---

### Task 6: Update JoinClient (register form)

**Files:**
- Modify: `app/join/[token]/JoinClient.tsx`

- [ ] **Step 1: Add `regUsername` state and update the register form**

In `app/join/[token]/JoinClient.tsx`:

1. Add to the "Registration form state" block (after `const [regToken, setRegToken] = useState("")`):
```typescript
const [regUsername, setRegUsername] = useState("");
```

2. Update `handleRegister` function — replace the validation and fetch call:
```typescript
async function handleRegister(e: React.FormEvent) {
  e.preventDefault();
  setRegError("");

  const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;
  if (!regUsername || regUsername.length < 3 || !USERNAME_REGEX.test(regUsername)) {
    setRegError("El usuario debe tener al menos 3 caracteres (letras, números, - y _).");
    return;
  }
  if (regToken.length < 8) { setRegError("La contraseña debe tener al menos 8 caracteres."); return; }
  if (regToken !== regConfirm) { setRegError("Las contraseñas no coinciden."); return; }

  setRegistering(true);
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: regName, username: regUsername, password: regToken, invite_token: token }),
    });
    if (!res.ok) {
      const d = await res.json();
      setRegError(d.error ?? "Error al crear cuenta.");
      setRegistering(false);
      return;
    }
    // User created + session set — now accept the invitation
    const joinRes = await fetch(`/api/join/${token}`, { method: "POST" });
    if (!joinRes.ok) {
      const d = await joinRes.json();
      setRegError(d.error ?? "Error al unirse al grupo.");
      setRegistering(false);
      return;
    }
    const joinData = await joinRes.json();
    await fetch("/api/groups/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: joinData.group_id }),
    });
    router.push("/onboarding");
  } catch {
    setRegError("Error de red.");
  } finally {
    setRegistering(false);
  }
}
```

3. In the register form JSX, add the username field between the name field and the password field. Find the `<form>` in the "register" status section and add (after the name input):

```tsx
<div style={{ marginBottom: 12 }}>
  <label style={labelStyle}>Nombre de usuario</label>
  <input
    style={{ ...inputStyle, fontSize: "16px" }}
    type="text"
    autoCapitalize="none"
    autoCorrect="off"
    placeholder="ej: esteban_ind"
    value={regUsername}
    onChange={e => {
      const val = e.target.value.toLowerCase().replace(/\s/g, "_");
      setRegUsername(val);
    }}
    required
  />
  <span style={{ fontSize: "0.75rem", color: "var(--htext3)" }}>
    Solo letras, números, - y _
  </span>
</div>
```

4. Update the password label in the form from "Token personal" (or similar) to "Contraseña", and confirm label to "Confirmar contraseña". Also update placeholder to `••••••••`.

5. Auto-suggest username from name: add `onChange` to the name input to auto-fill username if username is still empty:
```tsx
onChange={e => {
  setRegName(e.target.value);
  if (!regUsername) {
    setRegUsername(e.target.value.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, ""));
  }
}}
```

- [ ] **Step 2: Run full test suite**

```bash
npm test -- --no-coverage
```

Expected: all tests pass (JoinClient is a client component with no unit tests).

- [ ] **Step 3: Commit**

```bash
git add app/join/[token]/JoinClient.tsx
git commit -m "feat: register form with username field and contraseña labels"
```

---

### Task 7: Update Settings — rename token→contraseña, add Cambiar nombre

**Files:**
- Modify: `app/dashboard/settings/page.tsx`

- [ ] **Step 1: Find the Mi cuenta / token section**

The settings page has a "Mi cuenta" collapsible section that currently shows "token personal" labels. Changes needed:

1. In the subtitle: change `" · token personal configurado"` → `" · contraseña configurada"` and `" · sin token personal"` → `""` (or `" · contraseña pendiente"`)

2. In the form labels/placeholders: change all occurrences of "token" → "contraseña":
   - Form title/heading (if any): "Cambiar token" → "Cambiar contraseña"
   - Label "Token actual" → "Contraseña actual"
   - Label "Nuevo token" → "Nueva contraseña"
   - Label "Confirmar" → "Confirmar contraseña"
   - Placeholder `"nuevo token"` → `"••••••••"`
   - Error message `"El nuevo token debe tener al menos 8 caracteres."` → `"La nueva contraseña debe tener al menos 8 caracteres."`
   - Error message `"Los tokens no coinciden."` → `"Las contraseñas no coinciden."`
   - Success message `"Token actualizado correctamente."` → `"Contraseña actualizada correctamente."`
   - The `state` variable `newTok` can stay as-is (internal var name doesn't matter)

3. **Add "Cambiar nombre" section** — add this block inside the `{open && ...}` div, BEFORE the password form:

```tsx
{/* Cambiar nombre */}
<ChangeNameSection initialName={user.name} onSaved={(newName) => setUser(u => u ? { ...u, name: newName } : u)} />
```

And add this component above the main export (or as a nested component):

```tsx
function ChangeNameSection({ initialName, onSaved }: { initialName: string; onSaved: (name: string) => void }) {
  const [nameOpen, setNameOpen] = useState(false);
  const [nameVal, setNameVal] = useState(initialName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleNameSave(e: React.FormEvent) {
    e.preventDefault();
    setNameMsg(null);
    if (!nameVal.trim() || nameVal.trim().length > 50) {
      setNameMsg({ type: "err", text: "El nombre debe tener entre 1 y 50 caracteres." });
      return;
    }
    setNameSaving(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameVal.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setNameMsg({ type: "err", text: data.error ?? "Error al guardar." }); return; }
      setNameMsg({ type: "ok", text: "Nombre actualizado." });
      onSaved(nameVal.trim());
      setNameOpen(false);
    } catch {
      setNameMsg({ type: "err", text: "Error de red." });
    } finally {
      setNameSaving(false);
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setNameOpen(o => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--haccent)", fontSize: "0.85rem", padding: 0 }}
      >
        {nameOpen ? "▲ Cancelar" : "✏️ Cambiar nombre"}
      </button>
      {nameOpen && (
        <form onSubmit={handleNameSave} style={{ marginTop: 10 }}>
          <input
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            placeholder="Tu nombre"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--hborder)", background: "var(--hsurface2)", color: "var(--htext1)", fontSize: "16px", outline: "none", boxSizing: "border-box" as const, marginBottom: 8 }}
          />
          {nameMsg && (
            <div style={{ fontSize: "0.82rem", color: nameMsg.type === "ok" ? "var(--hsuccess)" : "var(--herror)", marginBottom: 8 }}>
              {nameMsg.text}
            </div>
          )}
          <button
            type="submit"
            disabled={nameSaving}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--haccent)", color: "#fff", fontSize: "0.85rem", cursor: nameSaving ? "not-allowed" : "pointer" }}
          >
            {nameSaving ? "Guardando..." : "Guardar nombre"}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run full test suite**

```bash
npm test -- --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/settings/page.tsx
git commit -m "feat: settings - rename token to contraseña, add cambiar nombre"
```

---

### Task 8: Update Onboarding — add display name editing in Step 1

**Files:**
- Modify: `app/onboarding/page.tsx`

- [ ] **Step 1: Add displayName state**

In `app/onboarding/page.tsx`, add state after `const [user, setUser] = useState<UserInfo | null>(null)`:

```typescript
const [displayName, setDisplayName] = useState("");
```

And after `setUser(data)`, initialize displayName:
```typescript
setDisplayName(data.name);
```

- [ ] **Step 2: Update completeOnboarding to send name**

Find the function that calls `PATCH /api/auth/me` with `{ onboarding_completed: true }`. Update it to also send `name`:

```typescript
const res = await fetch("/api/auth/me", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    onboarding_completed: true,
    name: displayName.trim() || user?.name,
  }),
});
```

- [ ] **Step 3: Add name input to Step 1 JSX**

In the Step 1 render section, add the display name field. Find the step 1 block (the "Bienvenida" step) and add this input BEFORE the "Continuar" button:

```tsx
{/* Display name editor */}
<div style={{ margin: "16px 0" }}>
  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 500, color: "var(--htext2)", marginBottom: 6 }}>
    ¿Cómo querés que te veamos?
  </label>
  <input
    type="text"
    value={displayName}
    onChange={e => setDisplayName(e.target.value)}
    placeholder="Tu nombre"
    maxLength={50}
    style={{
      width: "100%",
      padding: "12px 14px",
      borderRadius: 10,
      border: "1px solid var(--hborder)",
      background: "var(--hsurface2)",
      color: "var(--htext1)",
      fontSize: "16px",
      outline: "none",
      boxSizing: "border-box",
    }}
  />
  <span style={{ fontSize: "0.75rem", color: "var(--htext3)" }}>
    Este es tu nombre visible en la app. Podés cambiarlo después en Configuración.
  </span>
</div>
```

- [ ] **Step 4: Run full test suite**

```bash
npm test -- --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "feat: onboarding step 1 - editable display name"
```

---

### Task 9: Build + deploy

- [ ] **Step 1: Run full test suite one last time**

```bash
npm test -- --no-coverage
```

Expected: all tests pass, 0 failures.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: no TypeScript errors, no build failures.

- [ ] **Step 3: Push to main**

```bash
git push origin main
```

- [ ] **Step 4: Apply migration to production Turso DB**

```bash
turso db shell hermes-db < lib/db/migrations/0005_username.sql
```

Verify:
```bash
turso db shell hermes-db "SELECT id, name, username FROM users LIMIT 5;"
```

Expected: `username` column populated for all existing users.
