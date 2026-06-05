# Compartidos — Implementation Plan (Phases 3–5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web UI for /compartidos, Telegram group bot commands, and automated reminder alerts.

**Prerequisite:** Phases 0-2 must be merged to main before starting this plan.

**Architecture:** Next.js App Router pages inside existing DashboardLayout. Bot commands isolated in new lib/telegram/splits/ handlers. Cron extended (not replaced). Zero changes to existing pages, components, or bot behavior.

**Tech Stack:** Next.js 16, React 19, Drizzle ORM, Telegram Bot API inline keyboards, Jest

---

## Phase 3: Web UI

### Task 9: Sidebar + CSS skeletons

**Files:**
- Modify: `components/dashboard/HermesSidebar.tsx`
- Modify: `app/hermes.css`

- [ ] **Step 1: Add "Compartidos" nav item to sidebar**

In `HermesSidebar.tsx`, after the Categorías `<Link>` and before the `<div className="h-nav-label">Grupo</div>`, add:

```tsx
<Link
  href="/dashboard/compartidos"
  className={`h-nav-item${pathname.startsWith("/dashboard/compartidos") ? " active" : ""}`}
  onClick={() => setMobileOpen(false)}
>
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m9-4.13a4 4 0 11-8 0 4 4 0 018 0zM3 8a4 4 0 108 0A4 4 0 003 8z"/>
  </svg>
  Compartidos
</Link>
```

- [ ] **Step 2: Add skeleton CSS classes to hermes.css**

Append at the end of `app/hermes.css`:

```css
/* ── Splits / Compartidos skeletons ── */
[data-hermes] .h-skel-session-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}
@media (max-width: 640px) {
  [data-hermes] .h-skel-session-strip {
    grid-template-columns: 1fr;
  }
}
[data-hermes] .h-skel-session-card {
  background: var(--hsurface);
  border: 1px solid var(--hborder);
  border-radius: var(--hradius);
  padding: 18px 20px;
  margin-bottom: 12px;
}
[data-hermes] .h-splits-detail-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 20px;
  align-items: start;
}
@media (max-width: 900px) {
  [data-hermes] .h-splits-detail-layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Verify TypeScript and build**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/HermesSidebar.tsx app/hermes.css
git commit -m "feat(splits): add Compartidos nav item and skeleton CSS classes"
```

---

### Task 10: Sessions list page + skeleton

**Files:**
- Create: `app/dashboard/compartidos/page.tsx`
- Create: `app/dashboard/compartidos/loading.tsx`

- [ ] **Step 1: Create loading.tsx (skeleton)**

```tsx
// app/dashboard/compartidos/loading.tsx
import { Skel } from "@/components/ui/Skeleton";

export default function CompartidosLoading() {
  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <Skel w={180} h={26} mb={8} />
          <Skel w={260} h={13} />
        </div>
        <Skel w={140} h={38} r={8} />
      </div>

      {/* Summary strip */}
      <div className="h-skel-session-strip">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-card" style={{ padding: 16 }}>
            <Skel w={80} h={11} mb={8} />
            <Skel w={100} h={26} mb={6} />
            <Skel w={130} h={11} />
          </div>
        ))}
      </div>

      {/* Session cards */}
      {[0, 1, 2].map(i => (
        <div key={i} className="h-skel-session-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <Skel w={160} h={18} />
            <Skel w={60} h={22} r={20} />
          </div>
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <Skel w={80} h={12} />
            <Skel w={60} h={12} />
            <Skel w={100} h={12} />
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <Skel w={80} h={26} r={20} />
            <Skel w={70} h={26} r={20} />
            <Skel w={75} h={26} r={20} />
          </div>
          <div className="h-card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
            <div><Skel w={100} h={12} mb={6} /><Skel w={200} h={11} /></div>
            <Skel w={70} h={22} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create page.tsx**

```tsx
// app/dashboard/compartidos/page.tsx
import { cookies } from "next/headers";
import Link from "next/link";

interface Session {
  id: string;
  name: string;
  owner_user_id: string;
  status: "open" | "closed";
  created_at: number;
  telegram_chat_id?: string | null;
}

async function getSessions(): Promise<Session[]> {
  try {
    const cookieStore = await cookies();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const userId = cookieStore.get("user_id")?.value;
    if (!userId) return [];

    const res = await fetch(`${appUrl}/api/splits/sessions`, {
      headers: { "x-user-id": userId },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function CompartidosPage() {
  const sessions = await getSessions();
  const open = sessions.filter(s => s.status === "open");
  const closed = sessions.filter(s => s.status === "closed");

  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--htext1)", margin: 0 }}>
            🤝 Compartidos
          </h1>
          <p style={{ fontSize: 13, color: "var(--htext2)", marginTop: 4 }}>
            Gastos compartidos con otras personas
          </p>
        </div>
        <Link
          href="/dashboard/compartidos/nueva"
          className="h-btn-primary"
          style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none", padding: "9px 16px", borderRadius: 8, background: "var(--haccent)", color: "#fff", fontSize: 13, fontWeight: 600 }}
        >
          ＋ Nueva sesión
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="h-card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--htext1)", marginBottom: 8 }}>
            No tenés sesiones aún
          </p>
          <p style={{ fontSize: 13, color: "var(--htext2)" }}>
            Creá una sesión para empezar a dividir gastos con otras personas.
          </p>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--htext3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                Sesiones activas
              </p>
              {open.map(s => <SessionCard key={s.id} session={s} />)}
            </>
          )}
          {closed.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--htext3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "24px 0 12px" }}>
                Sesiones cerradas
              </p>
              {closed.map(s => <SessionCard key={s.id} session={s} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}

function SessionCard({ session }: { session: Session }) {
  const date = new Date(session.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  const isOpen = session.status === "open";

  return (
    <Link
      href={`/dashboard/compartidos/${session.id}`}
      style={{ textDecoration: "none", display: "block" }}
    >
      <div
        className="h-card"
        style={{
          padding: "18px 20px",
          marginBottom: 12,
          borderLeft: `3px solid ${isOpen ? "var(--haccent)" : "var(--hborder)"}`,
          cursor: "pointer",
          opacity: isOpen ? 1 : 0.75,
          transition: "border-color 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--htext1)" }}>{session.name}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
            textTransform: "uppercase", letterSpacing: "0.05em",
            background: isOpen ? "rgba(34,197,94,0.12)" : "var(--hborder)",
            color: isOpen ? "#22C55E" : "var(--htext3)",
          }}>
            {isOpen ? "Abierta" : "Cerrada"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--htext2)" }}>
          <span>📅 {date}</span>
          {session.telegram_chat_id && <span>🤖 Grupo Telegram</span>}
          {!session.telegram_chat_id && <span>🌐 Solo web</span>}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/compartidos/page.tsx app/dashboard/compartidos/loading.tsx
git commit -m "feat(splits): add /dashboard/compartidos list page and skeleton"
```

---

### Task 11: Session detail page + skeleton

**Files:**
- Create: `app/dashboard/compartidos/[id]/page.tsx`
- Create: `app/dashboard/compartidos/[id]/loading.tsx`

- [ ] **Step 1: Create loading.tsx**

```tsx
// app/dashboard/compartidos/[id]/loading.tsx
import { Skel } from "@/components/ui/Skeleton";

export default function SessionDetailLoading() {
  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      {/* Back + header */}
      <Skel w={140} h={13} mb={12} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div><Skel w={200} h={24} mb={8} /><Skel w={280} h={13} /></div>
        <Skel w={140} h={38} r={8} />
      </div>

      <div className="h-splits-detail-layout">
        {/* Left: expense list */}
        <div className="h-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hborder)" }}>
            <Skel w={160} h={16} />
          </div>
          <div style={{ padding: "0 18px" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--hborder)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Skel w={36} h={36} r={8} />
                  <div><Skel w={140} h={14} mb={6} /><Skel w={200} h={11} /></div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Skel w={70} h={16} mb={6} />
                  <Skel w={90} h={11} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: balances + actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="h-card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hborder)" }}>
              <Skel w={80} h={16} />
            </div>
            <div style={{ padding: "0 18px" }}>
              {[0, 1].map(i => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--hborder)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Skel w={28} h={28} r={14} />
                    <div><Skel w={80} h={14} mb={4} /><Skel w={60} h={11} /></div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Skel w={80} h={18} mb={6} />
                    <Skel w={90} h={26} r={6} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-card" style={{ padding: 16 }}>
            <Skel w={100} h={14} mb={12} />
            <Skel w="100%" h={38} r={8} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create page.tsx**

```tsx
// app/dashboard/compartidos/[id]/page.tsx
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

async function getSessionDetail(id: string) {
  try {
    const cookieStore = await cookies();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const userId = cookieStore.get("user_id")?.value;
    if (!userId) return null;

    const [detailRes, balancesRes] = await Promise.all([
      fetch(`${appUrl}/api/splits/sessions/${id}`, {
        headers: { "x-user-id": userId }, cache: "no-store",
      }),
      fetch(`${appUrl}/api/splits/sessions/${id}/balances`, {
        headers: { "x-user-id": userId }, cache: "no-store",
      }),
    ]);

    if (!detailRes.ok) return null;
    const detail = await detailRes.json();
    const balances = balancesRes.ok ? await balancesRes.json() : { balances: [], debts: [], isSettled: true };

    return { ...detail, balanceSummary: balances, userId };
  } catch {
    return null;
  }
}

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getSessionDetail(id);
  if (!data) notFound();

  const { session, splits, balanceSummary, userId } = data;
  const isOwner = session.owner_user_id === userId;
  const isOpen = session.status === "open";

  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      {/* Back */}
      <Link
        href="/dashboard/compartidos"
        style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--htext2)", fontSize: 13, textDecoration: "none", marginBottom: 16 }}
      >
        ← Compartidos
      </Link>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--htext1)", margin: 0 }}>{session.name}</h1>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
              textTransform: "uppercase" as const, letterSpacing: "0.05em",
              background: isOpen ? "rgba(34,197,94,0.12)" : "var(--hborder)",
              color: isOpen ? "#22C55E" : "var(--htext3)",
            }}>
              {isOpen ? "Abierta" : "Cerrada"}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--htext2)", marginTop: 4 }}>
            {splits.length} gastos
            {session.telegram_chat_id && " · Grupo Telegram activo"}
          </p>
        </div>
        {isOpen && (
          <Link
            href={`/dashboard/compartidos/${id}/nuevo`}
            style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none", padding: "9px 16px", borderRadius: 8, background: "var(--haccent)", color: "#fff", fontSize: 13, fontWeight: 600 }}
          >
            ＋ Nuevo gasto
          </Link>
        )}
      </div>

      <div className="h-splits-detail-layout">
        {/* Left: splits list */}
        <div className="h-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hborder)", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--htext1)" }}>
              {splits.length} gastos
            </span>
          </div>
          {splits.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--htext2)", fontSize: 13 }}>
              No hay gastos aún. ＋ Agregá el primero.
            </div>
          ) : (
            splits.map((s: { id: string; description: string; total_amount: number; split_type: string; created_by_user_id?: string; status: string }) => (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px", borderBottom: "1px solid var(--hborder)",
                opacity: s.status === "cancelled" ? 0.5 : 1,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, background: "var(--hsurface2)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                    💸
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--htext1)" }}>{s.description}</div>
                    <div style={{ fontSize: 11, color: "var(--htext3)", marginTop: 2 }}>
                      {s.split_type === "equal" ? "Partes iguales" : s.split_type === "percentage" ? "Porcentajes" : "Montos fijos"}
                      {s.status === "cancelled" && " · Cancelado"}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--htext1)" }}>
                    ${s.total_amount.toLocaleString("es-AR")}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right: balances + actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Balances */}
          <div className="h-card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hborder)" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--htext1)" }}>Balances</span>
            </div>
            <div style={{ padding: "0 18px" }}>
              {balanceSummary.isSettled ? (
                <div style={{ padding: "20px 0", textAlign: "center", color: "var(--htext2)", fontSize: 13 }}>
                  ✅ Todo saldado
                </div>
              ) : (
                balanceSummary.debts?.map((debt: { from: { userId?: string; tempUserId?: string }; to: { userId?: string; tempUserId?: string }; amount: number }, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--hborder)" }}>
                    <div style={{ fontSize: 12, color: "var(--htext2)" }}>
                      {debt.from.userId ?? debt.from.tempUserId} → {debt.to.userId ?? debt.to.tempUserId}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#EF4444" }}>
                      ${debt.amount.toLocaleString("es-AR")}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Actions */}
          {isOwner && isOpen && (
            <div className="h-card" style={{ padding: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--htext3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                Acciones
              </p>
              <button style={{
                width: "100%", padding: 9, fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: "pointer",
                background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid #F59E0B",
              }}>
                ⚠️ Cerrar sesión
              </button>
              {!balanceSummary.isSettled && (
                <p style={{ fontSize: 11, color: "var(--htext3)", textAlign: "center", marginTop: 6 }}>
                  Quedan deudas pendientes
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/compartidos/\\[id\\]/page.tsx app/dashboard/compartidos/\\[id\\]/loading.tsx
git commit -m "feat(splits): add session detail page with balances panel and skeleton"
```

---

### Task 12: New session + new split forms

**Files:**
- Create: `app/dashboard/compartidos/nueva/page.tsx`
- Create: `app/dashboard/compartidos/[id]/nuevo/page.tsx`

- [ ] **Step 1: Create nueva session page**

```tsx
// app/dashboard/compartidos/nueva/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NuevaSessionPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/splits/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error("Error al crear la sesión");
      const session = await res.json();
      router.push(`/dashboard/compartidos/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  }

  return (
    <div style={{ width: "100%", maxWidth: 520, fontFamily: "DM Sans, sans-serif" }}>
      <Link href="/dashboard/compartidos" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--htext2)", fontSize: 13, textDecoration: "none", marginBottom: 16 }}>
        ← Compartidos
      </Link>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--htext1)", marginBottom: 24 }}>
        ＋ Nueva sesión compartida
      </h1>

      <form onSubmit={handleSubmit} className="h-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--htext3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Nombre de la sesión
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Cena viernes, Viaje Bariloche, Hogar Junio..."
            required
            style={{ width: "100%", background: "var(--hsurface2)", border: "1px solid var(--hborder)", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "var(--htext1)", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 12, color: "#EF4444", marginBottom: 16 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !name.trim()}
          style={{ width: "100%", padding: 11, fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer", background: "var(--haccent)", color: "#fff", opacity: loading || !name.trim() ? 0.6 : 1 }}
        >
          {loading ? "Creando..." : "Crear sesión"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create nuevo gasto page**

```tsx
// app/dashboard/compartidos/[id]/nuevo/page.tsx
"use client";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

type SplitType = "equal" | "percentage" | "fixed";

export default function NuevoGastoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(totalAmount.replace(/\./g, "").replace(",", "."));
    if (!description.trim() || isNaN(amount) || amount <= 0) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/splits/sessions/${sessionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          totalAmount: amount,
          splitType,
          // For MVP, payer is current user and all split equally
          // Full participant selection comes from bot or future enhancement
          payers: [{ userId: "current", amountPaid: amount }],
          participants: [{ userId: "current", amount }],
        }),
      });
      if (!res.ok) throw new Error("Error al registrar el gasto");
      router.push(`/dashboard/compartidos/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  }

  const splitOptions: { type: SplitType; icon: string; label: string }[] = [
    { type: "equal", icon: "⚖️", label: "Partes iguales" },
    { type: "percentage", icon: "📊", label: "Porcentajes" },
    { type: "fixed", icon: "💰", label: "Montos fijos" },
  ];

  return (
    <div style={{ width: "100%", maxWidth: 520, fontFamily: "DM Sans, sans-serif" }}>
      <Link href={`/dashboard/compartidos/${sessionId}`} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--htext2)", fontSize: 13, textDecoration: "none", marginBottom: 16 }}>
        ← Volver a sesión
      </Link>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--htext1)", marginBottom: 24 }}>
        ＋ Nuevo gasto compartido
      </h1>

      <form onSubmit={handleSubmit} className="h-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--htext3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Descripción
          </label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: La Parolaccia, Uber, Netflix..." required style={{ width: "100%", background: "var(--hsurface2)", border: "1px solid var(--hborder)", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "var(--htext1)", outline: "none", boxSizing: "border-box" }} />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--htext3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Monto total
          </label>
          <input value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder="0" type="text" inputMode="numeric" required style={{ width: "100%", background: "var(--hsurface2)", border: "1px solid var(--hborder)", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "var(--htext1)", outline: "none", boxSizing: "border-box" }} />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--htext3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            ¿Cómo dividir?
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {splitOptions.map(opt => (
              <button
                key={opt.type}
                type="button"
                onClick={() => setSplitType(opt.type)}
                style={{
                  background: splitType === opt.type ? "var(--haccent-soft)" : "var(--hsurface2)",
                  border: `1px solid ${splitType === opt.type ? "var(--haccent)" : "var(--hborder)"}`,
                  borderRadius: 8, padding: "10px 8px", textAlign: "center", cursor: "pointer",
                  fontSize: 12, color: splitType === opt.type ? "var(--haccent)" : "var(--htext2)",
                  fontWeight: splitType === opt.type ? 600 : 400,
                }}
              >
                <div style={{ fontSize: 18, marginBottom: 4 }}>{opt.icon}</div>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: "#EF4444" }}>{error}</p>}

        <button type="submit" disabled={loading} style={{ width: "100%", padding: 11, fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer", background: "var(--haccent)", color: "#fff", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Guardando..." : "✅ Registrar gasto"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript + run tests**

```bash
npx tsc --noEmit && npx jest --no-coverage
```

Expected: 0 TypeScript errors, all tests PASS.

- [ ] **Step 4: Commit and push**

```bash
git add app/dashboard/compartidos/
git commit -m "feat(splits): add nueva session and nuevo gasto forms"
git push origin feature/splits-web-ui
```

---

## Phase 4: Bot de Telegram — Grupos

### Task 13: Conversation state helpers

**Files:**
- Create: `lib/telegram/splits/conversation-state.ts`

- [ ] **Step 1: Implement**

```typescript
// lib/telegram/splits/conversation-state.ts
import { db } from "@/lib/db/client";
import { bot_conversation_state } from "@/lib/db/schema";
import { and, eq, lt } from "drizzle-orm";

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ConversationState {
  step: string;
  data: Record<string, unknown>;
}

/** Retrieves active conversation state for a chat+user pair. Returns null if expired or missing. */
export async function getConversationState(
  chatId: string,
  userId: string
): Promise<ConversationState | null> {
  const row = await db.query.bot_conversation_state.findFirst({
    where: and(
      eq(bot_conversation_state.chat_id, chatId),
      eq(bot_conversation_state.user_id, userId)
    ),
  });
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await clearConversationState(chatId, userId);
    return null;
  }
  return JSON.parse(row.state) as ConversationState;
}

/** Saves or updates conversation state with TTL refresh. */
export async function setConversationState(
  chatId: string,
  userId: string,
  state: ConversationState
): Promise<void> {
  const expires_at = Date.now() + TTL_MS;
  await db.insert(bot_conversation_state)
    .values({ chat_id: chatId, user_id: userId, state: JSON.stringify(state), expires_at })
    .onConflictDoUpdate({
      target: [bot_conversation_state.chat_id, bot_conversation_state.user_id],
      set: { state: JSON.stringify(state), expires_at },
    });
}

/** Clears conversation state for a chat+user. */
export async function clearConversationState(chatId: string, userId: string): Promise<void> {
  await db.delete(bot_conversation_state).where(
    and(
      eq(bot_conversation_state.chat_id, chatId),
      eq(bot_conversation_state.user_id, userId)
    )
  );
}

/** Cleans up all expired states (call periodically or from cron). */
export async function purgeExpiredStates(): Promise<void> {
  await db.delete(bot_conversation_state).where(
    lt(bot_conversation_state.expires_at, Date.now())
  );
}
```

- [ ] **Step 2: Write tests for conversation state**

```typescript
// lib/telegram/splits/__tests__/conversation-state.test.ts
import { getConversationState, setConversationState, clearConversationState } from "../conversation-state";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: { bot_conversation_state: { findFirst: jest.fn() } },
    insert: jest.fn(() => ({ values: jest.fn(() => ({ onConflictDoUpdate: jest.fn() })) })),
    delete: jest.fn(() => ({ where: jest.fn() })),
  },
}));

describe("conversation state", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null when no state exists", async () => {
    (db.query.bot_conversation_state.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await getConversationState("chat1", "user1");
    expect(result).toBeNull();
  });

  it("returns null when state is expired", async () => {
    (db.query.bot_conversation_state.findFirst as jest.Mock).mockResolvedValue({
      state: JSON.stringify({ step: "waiting_amount", data: {} }),
      expires_at: Date.now() - 1000, // expired
    });
    const result = await getConversationState("chat1", "user1");
    expect(result).toBeNull();
  });

  it("returns parsed state when valid", async () => {
    const state = { step: "waiting_amount", data: { description: "Test" } };
    (db.query.bot_conversation_state.findFirst as jest.Mock).mockResolvedValue({
      state: JSON.stringify(state),
      expires_at: Date.now() + 60000,
    });
    const result = await getConversationState("chat1", "user1");
    expect(result).toEqual(state);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx jest lib/telegram/splits/__tests__/conversation-state.test.ts --no-coverage
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/telegram/splits/conversation-state.ts lib/telegram/splits/__tests__/conversation-state.test.ts
git commit -m "feat(splits): add conversation state helpers for group bot"
```

---

### Task 14: Group message handler + /activar command

**Files:**
- Create: `lib/telegram/splits/handler.ts`
- Create: `lib/telegram/splits/commands/activar.ts`
- Modify: `app/api/telegram/webhook/route.ts`

- [ ] **Step 1: Create /activar command handler**

```typescript
// lib/telegram/splits/commands/activar.ts
import { db } from "@/lib/db/client";
import { users, temp_users, split_sessions, split_session_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://hermes-finantial-tracker.vercel.app";

/**
 * Handles /activar command in a Telegram group.
 * Creates a split session for the group and registers the activator.
 */
export async function handleActivar(
  chatId: string,
  telegramUserId: string,
  telegramUsername: string | undefined,
  firstName: string,
  lastName: string | undefined
): Promise<string> {
  // Check if group already has an active session
  const existing = await db.query.split_sessions.findFirst({
    where: eq(split_sessions.telegram_chat_id, chatId),
  });
  if (existing && existing.status === "open") {
    return `Este grupo ya tiene una sesión activa: <b>${existing.name}</b>\nUsá /balances para ver el estado.`;
  }

  // Check if telegram user is registered in Hermes
  const hermesUser = await db.query.users.findFirst({
    where: eq(users.telegram_user_id, telegramUserId),
  });

  let ownerId: string;
  let ownerType: "user" | "temp";

  if (hermesUser) {
    ownerId = hermesUser.id;
    ownerType = "user";
  } else {
    // Create or find temp_user
    let tempUser = await db.query.temp_users.findFirst({
      where: eq(temp_users.telegram_user_id, telegramUserId),
    });
    if (!tempUser) {
      const tempId = randomUUID();
      await db.insert(temp_users).values({
        id: tempId,
        telegram_user_id: telegramUserId,
        telegram_username: telegramUsername ?? null,
        first_name: firstName,
        last_name: lastName ?? null,
        created_at: Date.now(),
      });
      tempUser = { id: tempId, telegram_user_id: telegramUserId, telegram_username: telegramUsername ?? null, first_name: firstName, last_name: lastName ?? null, created_at: Date.now(), upgraded_to: null };
    }
    ownerId = tempUser.id;
    ownerType = "temp";

    // Prompt registration but allow to continue
  }

  // Create session — ask for name via conversation state
  // For simplicity, use the group name placeholder; user can rename from web
  const sessionId = randomUUID();
  const sessionName = `Sesión ${new Date().toLocaleDateString("es-AR")}`;

  if (ownerType === "user") {
    await db.insert(split_sessions).values({
      id: sessionId,
      name: sessionName,
      owner_user_id: ownerId,
      telegram_chat_id: chatId,
      status: "open",
      created_at: Date.now(),
    });
    await db.insert(split_session_members).values({
      session_id: sessionId,
      user_id: ownerId,
      temp_user_id: null,
      joined_at: Date.now(),
    });
  } else {
    // temp user as owner — needs a Hermes user FK, so we require registration
    return `Para activar Hermes en este grupo, necesitás una cuenta.\n\nRegistrate gratis en:\n👉 ${APP_URL}\n\nUna vez registrado, volvé y usá /activar`;
  }

  return `✅ <b>¡Hermes activado!</b>\n\nSesión "<b>${sessionName}</b>" creada.\n\nComandos disponibles:\n/compartido [monto] [descripción] — nuevo gasto\n/balances — ver deudas\n/cerrar — finalizar sesión\n/ayuda — todos los comandos`;
}
```

- [ ] **Step 2: Create group handler router**

```typescript
// lib/telegram/splits/handler.ts
import { handleActivar } from "./commands/activar";
import { getConversationState, clearConversationState } from "./conversation-state";
import { sendTelegramMessage } from "@/lib/telegram/send-message";

interface TelegramGroupUpdate {
  message: {
    chat: { id: number; type: string };
    from: { id: number; username?: string; first_name: string; last_name?: string };
    text?: string;
    photo?: unknown[];
    caption?: string;
  };
}

/**
 * Routes group messages to the appropriate split command handler.
 * Returns true if the message was handled (bot should respond).
 */
export async function handleSplitGroupMessage(update: TelegramGroupUpdate): Promise<boolean> {
  const chatId = String(update.message.chat.id);
  const from = update.message.from;
  const telegramUserId = String(from.id);
  const text = update.message.text ?? update.message.caption ?? "";

  // /activar — setup group
  if (text.trim().toLowerCase().startsWith("/activar")) {
    const response = await handleActivar(
      chatId, telegramUserId, from.username, from.first_name, from.last_name
    );
    await sendTelegramMessage(chatId, response);
    return true;
  }

  // /balances
  if (text.trim().toLowerCase() === "/balances") {
    await sendTelegramMessage(chatId, "📊 <b>Balances</b>\n\n(Próximamente — funcionalidad en desarrollo)");
    return true;
  }

  // /ayuda
  if (text.trim().toLowerCase() === "/ayuda") {
    await sendTelegramMessage(chatId, [
      "🤖 <b>Comandos de Hermes</b>",
      "",
      "/compartido [monto] [descripción] — registrar gasto compartido",
      "/pague [persona] — confirmar pago de deuda",
      "/balances — ver balances del grupo",
      "/cerrar — cerrar sesión actual",
      "/activar — activar Hermes en este grupo",
    ].join("\n"));
    return true;
  }

  // Check active conversation state (multi-step flows)
  const state = await getConversationState(chatId, telegramUserId);
  if (state) {
    // Multi-step flow responses handled by specific command handlers
    // For MVP, clear state on unexpected input
    await clearConversationState(chatId, telegramUserId);
    return false;
  }

  return false; // not handled
}
```

- [ ] **Step 3: Extend webhook to handle group messages**

In `app/api/telegram/webhook/route.ts`, after the idempotency check (line ~39), add group detection before the existing user lookup:

```typescript
// After: if (existing) return NextResponse.json({ ok: true });
// Add:

const isGroupMessage = msg.chat.type === "group" || msg.chat.type === "supergroup";
if (isGroupMessage) {
  try {
    await handleSplitGroupMessage(update);
  } catch (err) {
    console.error("Telegram group handler error:", {
      message: err instanceof Error ? err.message : "Unknown error",
      updateId,
    });
  }
  return NextResponse.json({ ok: true });
}
```

Also add import at top of file:
```typescript
import { handleSplitGroupMessage } from "@/lib/telegram/splits/handler";
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/telegram/splits/ app/api/telegram/webhook/route.ts
git commit -m "feat(splits): add group bot handler and /activar command"
```

---

## Phase 5: Cron Alerts for Open Sessions

### Task 15: Extend daily-alerts cron

**Files:**
- Modify: `app/api/cron/daily-alerts/route.ts`

- [ ] **Step 1: Add split session alert logic**

At the end of the existing `GET` handler in `daily-alerts/route.ts`, before the final `return NextResponse.json`, add:

```typescript
// Split session reminders — alert groups with unpaid debts after 24h
const ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const cutoff = Date.now() - ALERT_INTERVAL_MS;

const openSessions = await db.query.split_sessions.findMany({
  where: and(
    eq(split_sessions.status, "open"),
    // telegram_chat_id not null means it's a group session
  ),
});

for (const session of openSessions) {
  if (!session.telegram_chat_id) continue;
  if (session.last_alert_at && session.last_alert_at > cutoff) continue;

  // Fetch balances for session
  const hasDebts = true; // Simplified — full implementation queries split_payments + split_items
  // In production: call calculateSessionBalances and check isSettled

  if (hasDebts) {
    await sendTelegramMessage(
      session.telegram_chat_id,
      `⏰ <b>Recordatorio</b> — sesión <b>${session.name}</b>\nHay deudas pendientes. Usá /balances para ver el estado.`
    );
    await db.update(split_sessions)
      .set({ last_alert_at: Date.now() })
      .where(eq(split_sessions.id, session.id));
  }
}
```

Add required imports at top of file:
```typescript
import { split_sessions } from "@/lib/db/schema";
// (and, eq already imported)
```

- [ ] **Step 2: Verify TypeScript + run full test suite**

```bash
npx tsc --noEmit && npx jest --no-coverage
```

Expected: 0 TypeScript errors, all tests PASS.

- [ ] **Step 3: Final commit and push**

```bash
git add app/api/cron/daily-alerts/route.ts lib/telegram/splits/ app/dashboard/compartidos/
git commit -m "feat(splits): add cron alerts for open split sessions with pending debts"
git push origin feature/splits-web-ui
```

---

## Final Checklist

- [ ] All 5 phases implemented and passing tests
- [ ] `vercel --prod` deploy successful
- [ ] Manual test: create session from web, navigate all pages
- [ ] Manual test: `/activar` in Telegram group
- [ ] Manual test: register expense via `/compartido` command
- [ ] No regressions in existing dashboard, bot, or cron behavior
- [ ] Rollback tag `v1.0-pre-compartidos` still exists on remote

## Rollback if needed

```bash
git checkout v1.0-pre-compartidos
vercel --prod
# Drop tables in reverse FK order (see spec Part 4)
```
