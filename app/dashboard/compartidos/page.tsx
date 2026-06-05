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
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--htext3)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 12 }}>
                Sesiones activas
              </p>
              {open.map(s => <SessionCard key={s.id} session={s} />)}
            </>
          )}
          {closed.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--htext3)", textTransform: "uppercase" as const, letterSpacing: "0.08em", margin: "24px 0 12px" }}>
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
            textTransform: "uppercase" as const, letterSpacing: "0.05em",
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
