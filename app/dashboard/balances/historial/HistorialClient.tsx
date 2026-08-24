"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";

interface PaymentHistoryItem {
  id: string;
  date: number;
  amount: number;
  partnerId: string;
  partnerName: string;
  sessionId: string;
  sessionName: string;
  direction: "sent" | "received";
}

interface HistorialClientProps {
  initialItems: PaymentHistoryItem[];
  partners: Array<{ id: string; name: string }>;
  initialFilters: {
    partnerId: string;
    from: string;
    to: string;
    limit: number;
    offset: number;
  };
}

const ALL_PARTNERS = "__all__";

export function HistorialClient({ initialItems, partners, initialFilters }: HistorialClientProps) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState(initialFilters.partnerId || ALL_PARTNERS);
  const [from, setFrom] = useState(initialFilters.from);
  const [to, setTo] = useState(initialFilters.to);
  const [limit] = useState(initialFilters.limit);
  const [offset] = useState(initialFilters.offset);

  const items = initialItems;
  const hasFilters = Boolean((partnerId && partnerId !== ALL_PARTNERS) || from || to);
  const hasItems = items.length > 0;

  const summary = useMemo(() => ({
    sent: items.filter((item) => item.direction === "sent").reduce((sum, item) => sum + item.amount, 0),
    received: items.filter((item) => item.direction === "received").reduce((sum, item) => sum + item.amount, 0),
  }), [items]);

  function applyFilters(nextPartnerId: string, nextFrom: string, nextTo: string, nextOffset = 0) {
    const params = new URLSearchParams();
    if (nextPartnerId && nextPartnerId !== ALL_PARTNERS) params.set("partnerId", nextPartnerId);
    if (nextFrom) params.set("from", nextFrom);
    if (nextTo) params.set("to", nextTo);
    params.set("limit", String(limit));
    params.set("offset", String(nextOffset));
    router.push(`/dashboard/balances/historial?${params.toString()}`);
  }

  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--htext1)", margin: 0 }}>
            💸 Historial de pagos
          </h1>
          <p style={{ fontSize: 13, color: "var(--htext2)", margin: "4px 0 0" }}>
            Filtrá pagos enviados y recibidos
          </p>
        </div>
      </div>

      <div className="h-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "var(--htext1)", fontSize: 13, fontWeight: 600 }}>
          <Filter size={16} />
          Filtros
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--htext2)", marginBottom: 6 }}>Desde</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--htext2)", marginBottom: 6 }}>Hasta</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--htext2)", marginBottom: 6 }}>Persona</label>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value || ALL_PARTNERS)}
              style={{
                width: "100%",
                height: 36,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid var(--hborder)",
                background: "var(--hsurface)",
                color: "var(--htext1)",
                fontSize: 13,
                cursor: "pointer",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center"
              }}
            >
              <option value={ALL_PARTNERS}>Todas las personas</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            onClick={() => applyFilters(partnerId, from, to)}
            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--haccent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Aplicar filtros
          </button>
          <button
            onClick={() => {
              setPartnerId(ALL_PARTNERS);
              setFrom("");
              setTo("");
              applyFilters(ALL_PARTNERS, "", "", 0);
            }}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext1)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Limpiar
          </button>
        </div>
      </div>

      {hasItems && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
          <SummaryCard label="Enviados" value={summary.sent} color="#EF4444" />
          <SummaryCard label="Recibidos" value={summary.received} color="#22C55E" />
        </div>
      )}

      {!hasItems ? (
        <div className="h-card" style={{ padding: 36, textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>🧾</div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--htext1)", marginBottom: 6 }}>
            No hay pagos registrados
          </p>
          <p style={{ fontSize: 13, color: "var(--htext2)", margin: 0 }}>
            {hasFilters ? "Probá cambiando los filtros para ver otros pagos." : "Cuando registres pagos entre personas, aparecerán acá."}
          </p>
        </div>
      ) : (
        <div className="h-card" style={{ overflow: "hidden" }}>
          <div className="payment-history-table">
            {items.map((item) => {
              const received = item.direction === "received";

              return (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(120px, 1fr) minmax(120px, 1fr) 90px minmax(140px, 1fr) minmax(160px, 1fr)",
                    gap: 12,
                    alignItems: "center",
                    padding: "14px 16px",
                    borderBottom: "1px solid var(--hborder)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--htext1)" }}>{formatDate(item.date)}</div>
                    <div style={{ fontSize: 11, color: "var(--htext3)", marginTop: 2 }}>{formatTime(item.date)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: received ? "#22C55E" : "#EF4444" }}>
                    {received ? "+" : "-"}${item.amount.toLocaleString("es-AR")}
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: received ? "#22C55E" : "#EF4444", fontSize: 12, fontWeight: 600 }}>
                    {received ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    {received ? "Recibido" : "Enviado"}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--htext1)" }}>{item.partnerName}</div>
                  <Link href={`/dashboard/compartidos/${item.sessionId}`} style={{ color: "var(--haccent)", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                    {item.sessionName}
                  </Link>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--htext2)" }}>
              Mostrando {items.length} pago{items.length === 1 ? "" : "s"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => applyFilters(partnerId, from, to, Math.max(0, offset - limit))}
                disabled={offset === 0}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext1)", cursor: offset === 0 ? "not-allowed" : "pointer", opacity: offset === 0 ? 0.5 : 1 }}
              >
                <ChevronLeft size={16} />
                Anterior
              </button>
              <button
                onClick={() => applyFilters(partnerId, from, to, offset + limit)}
                disabled={items.length < limit}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext1)", cursor: items.length < limit ? "not-allowed" : "pointer", opacity: items.length < limit ? 0.5 : 1 }}
              >
                Siguiente
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="h-card" style={{ padding: "14px 18px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 2 }}>${value.toLocaleString("es-AR")}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--htext3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
    </div>
  );
}

function formatDate(value: number): string {
  return new Date(value).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
