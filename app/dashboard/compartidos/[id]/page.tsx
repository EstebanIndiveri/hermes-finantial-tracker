import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

async function getSessionDetail(id: string) {
  try {
    const cookieStore = await cookies();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
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
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hborder)" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--htext1)" }}>
              {splits.length} gastos
            </span>
          </div>
          {splits.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--htext2)", fontSize: 13 }}>
              No hay gastos aún. ＋ Agregá el primero.
            </div>
          ) : (
            splits.map((s: { id: string; description: string; total_amount: number; split_type: string; status: string }) => (
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

          {/* Actions — owner only */}
          {isOwner && isOpen && (
            <div className="h-card" style={{ padding: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--htext3)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 10 }}>
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
