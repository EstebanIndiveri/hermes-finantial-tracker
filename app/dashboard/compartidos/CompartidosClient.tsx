"use client";
import { useState, useMemo } from "react";
import Link from "next/link";

type Status = "open" | "closed";
type Filter = "activas" | "cerradas" | "todas";

interface Session {
  id: string;
  name: string;
  owner_user_id: string;
  status: Status;
  created_at: number;
  telegram_chat_id?: string | null;
  splits_count: number;
  members_count: number;
}

interface Props {
  sessions: Session[];
}

export function CompartidosClient({ sessions }: Props) {
  const [filter, setFilter] = useState<Filter>("activas");

  const filtered = useMemo(() => {
    if (filter === "activas") return sessions.filter(s => s.status === "open");
    if (filter === "cerradas") return sessions.filter(s => s.status === "closed");
    return sessions;
  }, [sessions, filter]);

  const activas = sessions.filter(s => s.status === "open").length;
  const cerradas = sessions.filter(s => s.status === "closed").length;

  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--htext1)", margin: 0 }}>
            🤝 Compartidos
          </h1>
          <p style={{ fontSize: 13, color: "var(--htext2)", marginTop: 4, margin: "4px 0 0" }}>
            Gastos compartidos con otras personas
          </p>
        </div>
        <Link
          href="/dashboard/compartidos/nueva"
          style={{
            display: "flex", alignItems: "center", gap: 6, textDecoration: "none",
            padding: "9px 16px", borderRadius: 8, background: "var(--haccent)",
            color: "#fff", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" as const,
          }}
        >
          + Nueva sesión
        </Link>
      </div>

      {/* Summary strip */}
      {sessions.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
          <SummaryCard label="Sesiones activas" value={activas} color="#22C55E" />
          <SummaryCard label="Sesiones cerradas" value={cerradas} color="var(--htext3)" />
          <SummaryCard label="Total" value={sessions.length} color="var(--haccent)" />
        </div>
      )}

      {/* Tab filters */}
      <div style={{
        display: "flex", gap: 2, marginBottom: 20,
        borderBottom: "1px solid var(--hborder)", paddingBottom: 0,
      }}>
        {(["activas", "cerradas", "todas"] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "8px 16px", fontSize: 13, fontWeight: 600,
              color: filter === f ? "var(--haccent)" : "var(--htext2)",
              borderBottom: `2px solid ${filter === f ? "var(--haccent)" : "transparent"}`,
              marginBottom: -1, textTransform: "capitalize" as const,
              transition: "color 0.15s",
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span style={{
              marginLeft: 6, fontSize: 10, fontWeight: 700,
              background: filter === f ? "var(--haccent-soft)" : "var(--hsurface2)",
              color: filter === f ? "var(--haccent)" : "var(--htext3)",
              padding: "2px 6px", borderRadius: 10,
            }}>
              {f === "activas" ? activas : f === "cerradas" ? cerradas : sessions.length}
            </span>
          </button>
        ))}
      </div>

      {/* Session list */}
      {filtered.length === 0 ? (
        <div className="h-card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>
            {filter === "activas" ? "🤝" : filter === "cerradas" ? "📦" : "🤝"}
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--htext1)", marginBottom: 8 }}>
            {filter === "activas"
              ? "No tenés sesiones activas"
              : filter === "cerradas"
              ? "No tenés sesiones cerradas"
              : "No tenés sesiones aún"}
          </p>
          <p style={{ fontSize: 13, color: "var(--htext2)", margin: 0 }}>
            {filter === "activas"
              ? "Creá una sesión para empezar a dividir gastos."
              : filter === "cerradas"
              ? "Las sesiones cerradas aparecerán acá."
              : "Creá una sesión para empezar a dividir gastos con otras personas."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(s => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="h-card" style={{ padding: "14px 18px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--htext3)", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
        {label}
      </div>
    </div>
  );
}

function SessionCard({ session }: { session: Session }) {
  const isOpen = session.status === "open";
  const date = new Date(session.created_at).toLocaleDateString("es-AR", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <Link href={`/dashboard/compartidos/${session.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        className="h-card"
        style={{
          padding: "16px 20px",
          borderLeft: `3px solid ${isOpen ? "var(--haccent)" : "var(--hborder)"}`,
          opacity: isOpen ? 1 : 0.75,
          transition: "all 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          {/* Left */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--htext1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {session.name}
              </span>
              <span style={{
                flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                textTransform: "uppercase" as const, letterSpacing: "0.05em",
                background: isOpen ? "rgba(34,197,94,0.12)" : "var(--hsurface2)",
                color: isOpen ? "#22C55E" : "var(--htext3)",
              }}>
                {isOpen ? "Abierta" : "Cerrada"}
              </span>
            </div>

            {/* Meta pills */}
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
              <MetaPill icon="📅" label={date} />
              <MetaPill icon="💸" label={`${session.splits_count} ${session.splits_count === 1 ? "gasto" : "gastos"}`} />
              <MetaPill icon="👥" label={`${session.members_count} ${session.members_count === 1 ? "miembro" : "miembros"}`} />
              {session.telegram_chat_id
                ? <MetaPill icon="🤖" label="Grupo Telegram" accent />
                : <MetaPill icon="🌐" label="Solo web" />
              }
            </div>
          </div>

          {/* Arrow */}
          <div style={{ color: "var(--htext3)", fontSize: 16, marginTop: 2, flexShrink: 0 }}>→</div>
        </div>
      </div>
    </Link>
  );
}

function MetaPill({ icon, label, accent }: { icon: string; label: string; accent?: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, color: accent ? "var(--haccent)" : "var(--htext2)",
      background: accent ? "var(--haccent-soft)" : "transparent",
      padding: accent ? "2px 8px" : 0,
      borderRadius: accent ? 20 : 0,
      fontWeight: accent ? 600 : 400,
    }}>
      {icon} {label}
    </span>
  );
}
