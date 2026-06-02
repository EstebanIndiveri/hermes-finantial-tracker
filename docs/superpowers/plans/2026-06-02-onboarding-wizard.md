# Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar un wizard de onboarding de 3 pasos (Bienvenida → Tour → Telegram) que se muestra una sola vez a los usuarios nuevos que ingresan vía enlace de invitación, redirigiendo a `/dashboard` al completarlo.

**Architecture:** Se agrega `onboarding_completed_at` a la tabla `users` via migration manual SQL en `lib/db/migrations/`. El middleware detecta si el usuario nuevo aún no completó el onboarding y permite acceso a `/onboarding`. `JoinClient.tsx` redirige a `/onboarding` en lugar de `/dashboard` post-registro. La página `/onboarding` es un client component que gestiona los 3 pasos con estado local.

**Tech Stack:** Next.js 14 App Router, React client components, Drizzle ORM, SQLite (Turso), bcrypt, TypeScript

---

## File Map

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `lib/db/migrations/0004_onboarding.sql` | Crear | ALTER TABLE users + marcar owner como completado |
| `lib/db/schema.ts` | Modificar | Agregar campo `onboarding_completed_at` a users |
| `app/api/auth/me/route.ts` | Modificar | Agregar PATCH handler para marcar onboarding completado |
| `middleware.ts` | Modificar | Permitir `/onboarding`, detectar usuarios sin completar |
| `app/onboarding/page.tsx` | Crear | Wizard completo (3 pasos + pantalla final) |
| `app/join/[token]/JoinClient.tsx` | Modificar | Redirigir a `/onboarding` en lugar de `/dashboard` post-registro |
| `app/api/auth/__tests__/me.patch.test.ts` | Crear | Tests del PATCH endpoint |

---

## Task 1: Migración de base de datos

**Files:**
- Create: `lib/db/migrations/0004_onboarding.sql`
- Modify: `lib/db/schema.ts`

- [ ] **Step 1.1: Escribir el test que falla primero**

```bash
# No hay test unitario de migration SQL, pero sí un smoke test del PATCH que falla
# antes de crear la migration (lo haremos en Task 2). Continuar.
echo "Migration will be validated when PATCH endpoint tests run in Task 2"
```

- [ ] **Step 1.2: Crear el archivo de migration**

Crear `lib/db/migrations/0004_onboarding.sql`:

```sql
-- Agregar campo onboarding_completed_at a users
ALTER TABLE users ADD COLUMN onboarding_completed_at INTEGER;

-- Marcar a todos los usuarios existentes como que ya completaron el onboarding
-- (el owner original no debe ver el wizard)
UPDATE users SET onboarding_completed_at = (unixepoch() * 1000);
```

- [ ] **Step 1.3: Actualizar schema Drizzle**

En `lib/db/schema.ts`, agregar el campo en la definición de `users`:

```typescript
// Reemplazar:
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  telegram_user_id: text("telegram_user_id").unique(),
  personal_token_hash: text("personal_token_hash"),
  active_telegram_group_id: text("active_telegram_group_id"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// Por:
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  telegram_user_id: text("telegram_user_id").unique(),
  personal_token_hash: text("personal_token_hash"),
  active_telegram_group_id: text("active_telegram_group_id"),
  onboarding_completed_at: integer("onboarding_completed_at"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});
```

- [ ] **Step 1.4: Correr la migration**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
npm run db:migrate
```

Salida esperada: migración ejecutada sin errores.

- [ ] **Step 1.5: Commit**

```bash
git add lib/db/migrations/0004_onboarding.sql lib/db/schema.ts
git commit -m "feat: add onboarding_completed_at field to users

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: PATCH /api/auth/me para marcar onboarding completado

**Files:**
- Modify: `app/api/auth/me/route.ts`
- Create: `app/api/auth/__tests__/me.patch.test.ts`

- [ ] **Step 2.1: Escribir el test que falla**

Crear `app/api/auth/__tests__/me.patch.test.ts`:

```typescript
import { NextRequest } from "next/server";

jest.mock("@/lib/utils/session", () => ({
  verifySession: jest.fn(),
}));
jest.mock("@/lib/db/client", () => ({
  db: {
    update: jest.fn(),
    query: { users: { findFirst: jest.fn() } },
  },
}));

import { verifySession } from "@/lib/utils/session";
import { db } from "@/lib/db/client";
import { PATCH } from "../route";

const mockVerifySession = verifySession as jest.MockedFunction<typeof verifySession>;
const mockDb = db as jest.Mocked<typeof db>;

function makeRequest(body: Record<string, unknown>, cookie = "valid-session"): NextRequest {
  return new NextRequest("http://localhost/api/auth/me", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      cookie: `hermes_session=${cookie}`,
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/auth/me", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no session cookie", async () => {
    mockVerifySession.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest({ onboarding_completed: true }, ""));
    expect(res.status).toBe(401);
  });

  it("marks onboarding as completed when onboarding_completed is true", async () => {
    mockVerifySession.mockResolvedValueOnce("user-123");
    const mockSet = jest.fn().mockReturnThis();
    const mockWhere = jest.fn().mockResolvedValue(undefined);
    (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });

    const res = await PATCH(makeRequest({ onboarding_completed: true }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("returns 400 for invalid body", async () => {
    mockVerifySession.mockResolvedValueOnce("user-123");
    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2.2: Correr el test para verificar que falla**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
npx jest app/api/auth/__tests__/me.patch.test.ts --no-coverage 2>&1 | tail -20
```

Salida esperada: FAIL — `PATCH is not a function` o similar.

- [ ] **Step 2.3: Implementar el PATCH handler**

Reemplazar todo el contenido de `app/api/auth/me/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/utils/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? await verifySession(cookie) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    has_personal_token: !!user.personal_token_hash,
    has_telegram: !!user.telegram_user_id,
    onboarding_completed: !!user.onboarding_completed_at,
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? await verifySession(cookie) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || body.onboarding_completed !== true) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  await db.update(users)
    .set({ onboarding_completed_at: Date.now() })
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2.4: Correr el test para verificar que pasa**

```bash
npx jest app/api/auth/__tests__/me.patch.test.ts --no-coverage 2>&1 | tail -20
```

Salida esperada: PASS — 3 tests passing.

- [ ] **Step 2.5: Commit**

```bash
git add app/api/auth/me/route.ts app/api/auth/__tests__/me.patch.test.ts
git commit -m "feat: add PATCH /api/auth/me to mark onboarding completed

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Middleware — proteger y controlar /onboarding

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 3.1: Actualizar middleware**

Reemplazar todo el contenido de `middleware.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/utils/session";
import { getPersonalGroup } from "@/lib/groups/permissions";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
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

  // /onboarding is accessible to authenticated users regardless of onboarding status
  // The page itself handles completion state via /api/auth/me
  if (pathname === "/onboarding") {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  res.headers.set("x-user-id", userId);

  // Resolve active group
  const activeGroupId = req.cookies.get("active_group_id")?.value;
  if (activeGroupId) {
    res.headers.set("x-group-id", activeGroupId);
  } else {
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

- [ ] **Step 3.2: Commit**

```bash
git add middleware.ts
git commit -m "feat: allow /onboarding route for authenticated users

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Página /onboarding — Wizard completo

**Files:**
- Create: `app/onboarding/page.tsx`

El wizard tiene 4 estados internos: `step` ∈ `1 | 2 | 3 | "done"`.

- [ ] **Step 4.1: Crear `app/onboarding/page.tsx`**

```typescript
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Step = 1 | 2 | 3 | "done";

interface UserInfo {
  name: string;
  has_telegram: boolean;
  onboarding_completed: boolean;
}

const TOUR_SLIDES = [
  {
    icon: "📊",
    title: "Dashboard",
    desc: "Resumen mensual de ingresos, gastos, ahorro y distribución por categoría.",
  },
  {
    icon: "➕",
    title: "Registrar gastos",
    desc: "Agregá transacciones desde la web o directamente con el bot de Telegram.",
  },
  {
    icon: "🗂️",
    title: "Categorías y presupuesto",
    desc: "Configurá límites por categoría y controlá en qué gastás más cada mes.",
  },
  {
    icon: "🤖",
    title: "Bot de Telegram",
    desc: "Escribí gastos en lenguaje natural y consultá tu saldo desde cualquier lugar.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [slideIndex, setSlideIndex] = useState(0);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [telegramCode, setTelegramCode] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then((data: UserInfo) => {
        if (data.onboarding_completed) {
          router.replace("/dashboard");
          return;
        }
        setUser(data);
        if (data.has_telegram) setTelegramLinked(true);
      })
      .catch(() => router.replace("/dashboard"));
  }, [router]);

  async function fetchTelegramCode() {
    setLoadingCode(true);
    try {
      const res = await fetch("/api/auth/telegram/code", { method: "POST" });
      const data = await res.json();
      if (data.code) setTelegramCode(data.code);
    } finally {
      setLoadingCode(false);
    }
  }

  async function completeOnboarding() {
    await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_completed: true }),
    });
    router.push("/dashboard");
  }

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "HermesFinanceAssistBot";

  // Shared styles
  const container: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--hbg)",
    padding: "24px 20px",
  };
  const card: React.CSSProperties = {
    background: "var(--hsurface)",
    border: "1px solid var(--hborder)",
    borderRadius: 20,
    padding: "32px 28px",
    width: "100%",
    maxWidth: 420,
    boxShadow: "var(--hshadow-lg)",
  };
  const btnPrimary: React.CSSProperties = {
    width: "100%",
    padding: "12px",
    borderRadius: 10,
    border: "none",
    background: "var(--haccent)",
    color: "white",
    cursor: "pointer",
    fontSize: "0.95rem",
    fontWeight: 600,
    marginBottom: 10,
  };
  const btnGhost: React.CSSProperties = {
    width: "100%",
    padding: "11px",
    borderRadius: 10,
    border: "1px solid var(--hborder)",
    background: "transparent",
    color: "var(--htext2)",
    cursor: "pointer",
    fontSize: "0.88rem",
  };

  // Step indicator bar
  function StepBar() {
    const steps = [1, 2, 3] as const;
    return (
      <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
        {steps.map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 3,
              background:
                step === "done" ? "#4ADE80"
                : s < (step as number) ? "#4ADE80"
                : s === (step as number) ? "var(--haccent)"
                : "var(--hborder)",
              transition: "background 0.3s",
            }}
          />
        ))}
      </div>
    );
  }

  if (!user) {
    return (
      <div data-hermes="" style={container}>
        <div style={card}>
          <p style={{ color: "var(--htext2)", textAlign: "center" }}>Cargando...</p>
        </div>
      </div>
    );
  }

  // ── Step 1: Bienvenida ──
  if (step === 1) {
    return (
      <div data-hermes="" style={container}>
        <div style={card}>
          <StepBar />
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: "2.8rem", marginBottom: 8 }}>👋</div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--htext1)", margin: 0 }}>
              ¡Bienvenido/a, {user.name}!
            </h1>
            <p style={{ fontSize: "0.83rem", color: "var(--htext3)", marginTop: 6 }}>
              Ya sos parte de Hermes Finance. Veamos qué podés hacer.
            </p>
          </div>

          <div style={{
            background: "var(--haccent-soft)",
            border: "1px solid var(--haccent)",
            borderRadius: 12,
            padding: "14px 16px",
            marginBottom: 20,
            opacity: 0.9,
          }}>
            <div style={{ fontSize: "0.78rem", color: "var(--haccent)", fontWeight: 600, marginBottom: 6 }}>
              Tu acceso
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                "✅ Ver resumen de gastos del grupo",
                "✅ Agregar y editar transacciones",
                "✅ Consultar presupuestos por categoría",
                "📱 Registrar gastos por Telegram",
              ].map((item) => (
                <div key={item} style={{ fontSize: "0.82rem", color: "var(--htext2)" }}>{item}</div>
              ))}
            </div>
          </div>

          <button style={btnPrimary} onClick={() => setStep(2)}>
            Ver qué puedo hacer →
          </button>
          <button style={btnGhost} onClick={completeOnboarding}>
            Ir al dashboard directo
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Tour ──
  if (step === 2) {
    const slide = TOUR_SLIDES[slideIndex];
    return (
      <div data-hermes="" style={container}>
        <div style={card}>
          <StepBar />
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div style={{ fontSize: "2.6rem", marginBottom: 8 }}>{slide.icon}</div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--htext1)", margin: 0 }}>
              {slide.title}
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--htext3)", marginTop: 8, lineHeight: 1.5 }}>
              {slide.desc}
            </p>
          </div>

          {/* Slide dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "20px 0" }}>
            {TOUR_SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlideIndex(i)}
                style={{
                  width: i === slideIndex ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  border: "none",
                  background: i === slideIndex ? "var(--haccent)" : "var(--hborder)",
                  cursor: "pointer",
                  padding: 0,
                  transition: "all 0.2s",
                }}
              />
            ))}
          </div>

          {/* Navigation */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              style={{ ...btnGhost, width: "auto", padding: "11px 20px", flex: "none" }}
              onClick={() => slideIndex > 0 ? setSlideIndex(slideIndex - 1) : setStep(1)}
            >
              ← Anterior
            </button>
            <button
              style={{ ...btnPrimary, marginBottom: 0, flex: 1 }}
              onClick={() => {
                if (slideIndex < TOUR_SLIDES.length - 1) {
                  setSlideIndex(slideIndex + 1);
                } else {
                  setStep(3);
                  fetchTelegramCode();
                }
              }}
            >
              {slideIndex < TOUR_SLIDES.length - 1 ? "Siguiente →" : "Continuar →"}
            </button>
          </div>

          <button style={btnGhost} onClick={completeOnboarding}>
            Saltar y ir al dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Telegram ──
  if (step === 3) {
    return (
      <div data-hermes="" style={container}>
        <div style={card}>
          <StepBar />
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: "2.8rem", marginBottom: 8 }}>📱</div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--htext1)", margin: 0 }}>
              Conectá Telegram
            </h2>
            <p style={{ fontSize: "0.83rem", color: "var(--htext3)", marginTop: 6, lineHeight: 1.5 }}>
              Registrá gastos escribiendo en el chat y consultá tu presupuesto desde cualquier lugar.
            </p>
          </div>

          {telegramLinked ? (
            <div style={{
              background: "#DCFCE7",
              border: "1px solid #86EFAC",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 20,
              textAlign: "center",
            }}>
              <div style={{ fontSize: "1.2rem", marginBottom: 4 }}>✅</div>
              <div style={{ fontSize: "0.85rem", color: "#166534", fontWeight: 600 }}>
                Telegram ya conectado
              </div>
            </div>
          ) : telegramCode ? (
            <div style={{
              background: "var(--hsurface2)",
              border: "1px solid var(--hborder)",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 16,
            }}>
              <div style={{ fontSize: "0.72rem", color: "var(--htext3)", fontWeight: 600, marginBottom: 6 }}>
                Tu código de vinculación
              </div>
              <div style={{
                fontFamily: "monospace",
                fontSize: "1.6rem",
                fontWeight: 800,
                color: "var(--haccent)",
                letterSpacing: "4px",
                textAlign: "center",
              }}>
                {telegramCode.replace(/(\d{3})(\d{3})/, "$1 $2")}
              </div>
            </div>
          ) : (
            <div style={{
              background: "var(--hsurface2)",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 16,
              textAlign: "center",
              color: "var(--htext3)",
              fontSize: "0.82rem",
            }}>
              {loadingCode ? "Generando código..." : "Error al generar código"}
            </div>
          )}

          {!telegramLinked && telegramCode && (
            <a
              href={`https://t.me/${botUsername}?start=link_${telegramCode}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                background: "#0088cc",
                color: "white",
                textDecoration: "none",
                fontSize: "0.92rem",
                fontWeight: 600,
                marginBottom: 10,
                boxSizing: "border-box",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
              </svg>
              Abrir en Telegram y vincular
            </a>
          )}

          <button style={btnPrimary} onClick={completeOnboarding}>
            {telegramLinked ? "¡Listo! Ir al dashboard 🚀" : "Continuar sin Telegram"}
          </button>

          <p style={{ fontSize: "0.72rem", color: "var(--htext3)", textAlign: "center", marginTop: 8 }}>
            Podés conectarlo después en Configuración
          </p>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 4.2: Verificar que la página compila**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
npx tsc --noEmit 2>&1 | head -30
```

Salida esperada: sin errores de TypeScript.

- [ ] **Step 4.3: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "feat: add onboarding wizard (3-step: welcome, tour, telegram)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Actualizar JoinClient para redirigir a /onboarding

**Files:**
- Modify: `app/join/[token]/JoinClient.tsx`

Hay dos lugares donde se redirige a `/dashboard` post-registro/join. Ambos deben redirigir a `/onboarding`.

- [ ] **Step 5.1: Modificar `handleRegister` en JoinClient.tsx**

Buscar la línea 75:
```typescript
      router.push("/dashboard");
```
Reemplazar por:
```typescript
      router.push("/onboarding");
```

- [ ] **Step 5.2: Modificar `handleAccept` en JoinClient.tsx**

Buscar la línea 100:
```typescript
      router.push("/dashboard");
```
Reemplazar por:
```typescript
      router.push("/onboarding");
```

Nota: el usuario que ya tenía cuenta y acepta una segunda invitación también irá a `/onboarding`, pero como ya tiene `onboarding_completed_at`, el `useEffect` del wizard lo redirigirá automáticamente a `/dashboard`. Comportamiento correcto.

- [ ] **Step 5.3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Salida esperada: sin errores.

- [ ] **Step 5.4: Commit**

```bash
git add app/join/[token]/JoinClient.tsx
git commit -m "feat: redirect to /onboarding after registration/invite accept

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Correr suite completa y deploy

- [ ] **Step 6.1: Correr todos los tests**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
npm test -- --no-coverage 2>&1 | tail -30
```

Salida esperada: todos los tests existentes pasan + 3 nuevos tests de PATCH /api/auth/me.

- [ ] **Step 6.2: Build de producción**

```bash
npm run build 2>&1 | tail -30
```

Salida esperada: `✓ Compiled successfully` sin errores.

- [ ] **Step 6.3: Push a main para deploy en Vercel**

```bash
git push origin main
```

- [ ] **Step 6.4: Verificar deploy**

Abrir https://hermes-finantial-tracker.vercel.app/onboarding — debe redirigir al dashboard (usuario ya tiene onboarding completado). El flujo completo se verifica con un enlace de invitación nuevo.

---

## Checklist de spec coverage

- [x] Paso 1 Bienvenida con permisos → Task 4
- [x] Paso 2 Tour 4 slides → Task 4
- [x] Paso 3 Telegram skippable → Task 4
- [x] Marcado en DB → Tasks 1 + 2
- [x] Redirect si ya completó → Task 4 (useEffect)
- [x] Owner existente marcado como completado → Task 1 migration UPDATE
- [x] JoinClient redirige a /onboarding → Task 5
- [x] Middleware permite /onboarding → Task 3
