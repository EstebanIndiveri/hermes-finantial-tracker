"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PagarModal } from "./PagarModal";
import type { GlobalBalanceSummary, PartnerBalance } from "@/lib/splits/types";

interface BalancesClientProps {
  initialSummary: GlobalBalanceSummary;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function sortByPartnerName(items: PartnerBalance[]): PartnerBalance[] {
  return [...items].sort((a, b) => (a.partnerName ?? "").localeCompare(b.partnerName ?? ""));
}

export function BalancesClient({ initialSummary }: BalancesClientProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [payingPartner, setPayingPartner] = useState<PartnerBalance | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedPartners, setExpandedPartners] = useState<Record<string, boolean>>({});

  const debts = useMemo(
    () => sortByPartnerName(summary.partnerBalances.filter((partner) => partner.net < 0)),
    [summary],
  );
  const credits = useMemo(
    () => sortByPartnerName(summary.partnerBalances.filter((partner) => partner.net > 0)),
    [summary],
  );

  async function refreshBalances(): Promise<void> {
    setRefreshing(true);
    try {
      const response = await fetch("/api/splits/global-balances", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(data?.error ?? "No se pudieron actualizar los balances");
        return;
      }
      setSummary(data);
    } catch {
      toast.error("Error de conexión al actualizar balances");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--htext1)", margin: 0 }}>💳 Balances globales</h1>
          <p style={{ fontSize: 13, color: "var(--htext2)", margin: "4px 0 0" }}>
            Lo que te deben y lo que debés entre todas tus sesiones compartidas.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="outline" onClick={() => void refreshBalances()} disabled={refreshing}>
            {refreshing ? "Actualizando..." : "Actualizar"}
          </Button>
          <Link href="/dashboard/balances/historial" style={{ textDecoration: "none" }}>
            <Button variant="outline">Ver historial</Button>
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
        <SummaryCard label="Total te deben" value={summary.totalTheyOwe} color="#22C55E" />
        <SummaryCard label="Total debés" value={summary.totalYouOwe} color="#EF4444" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <BalanceColumn
          title="💰 Te deben"
          emptyTitle="Nadie te debe plata"
          emptyDescription="Cuando alguien te deba en una sesión compartida, lo vas a ver acá."
          items={credits}
          tone="credit"
          expandedPartners={expandedPartners}
          onTogglePartner={(partnerKey) => setExpandedPartners((current) => ({ ...current, [partnerKey]: !current[partnerKey] }))}
        />
        <BalanceColumn
          title="💸 Debés"
          emptyTitle="No debés plata"
          emptyDescription="Si tenés pagos pendientes con otras personas, aparecerán en esta sección."
          items={debts}
          tone="debt"
          actionLabel="Registrar pago"
          onAction={(partner) => setPayingPartner(partner)}
          expandedPartners={expandedPartners}
          onTogglePartner={(partnerKey) => setExpandedPartners((current) => ({ ...current, [partnerKey]: !current[partnerKey] }))}
        />
      </div>

      {payingPartner && (
        <PagarModal
          partner={payingPartner}
          debtAmount={Math.abs(payingPartner.net)}
          onClose={() => setPayingPartner(null)}
          onSuccess={async () => {
            setPayingPartner(null);
            await refreshBalances();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="h-card" style={{ padding: "14px 18px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 2 }}>${formatAmount(value)}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--htext3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
    </div>
  );
}

function BalanceColumn({
  title,
  emptyTitle,
  emptyDescription,
  items,
  tone,
  actionLabel,
  onAction,
  expandedPartners,
  onTogglePartner,
}: {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  items: PartnerBalance[];
  tone: "debt" | "credit";
  actionLabel?: string;
  onAction?: (partner: PartnerBalance) => void;
  expandedPartners: Record<string, boolean>;
  onTogglePartner: (partnerKey: string) => void;
}) {
  const amountColor = tone === "debt" ? "#EF4444" : "#22C55E";

  return (
    <div className="h-card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hborder)", fontSize: 13, fontWeight: 700, color: "var(--htext1)" }}>
        {title}
      </div>
      {items.length === 0 ? (
        <div style={{ padding: 28, textAlign: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--htext1)", marginBottom: 6 }}>{emptyTitle}</p>
          <p style={{ fontSize: 13, color: "var(--htext2)", margin: 0 }}>{emptyDescription}</p>
        </div>
      ) : (
        items.map((partner) => {
          const partnerKey = partner.partner.userId ?? partner.partner.tempUserId ?? "partner";
          const isExpanded = Boolean(expandedPartners[partnerKey]);

          return (
            <div key={partnerKey} style={{ padding: 16, borderBottom: "1px solid var(--hborder)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--htext1)" }}>{partner.partnerName ?? "Sin nombre"}</div>
                  <div style={{ fontSize: 12, color: "var(--htext2)", marginTop: 4 }}>
                    {partner.sessionBreakdown.length === 1 ? "1 sesión involucrada" : `${partner.sessionBreakdown.length} sesiones involucradas`}
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: amountColor }}>${formatAmount(Math.abs(partner.net))}</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => onTogglePartner(partnerKey)}
                  style={{ background: "none", border: "none", padding: 0, color: "var(--haccent)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  {isExpanded ? "Ocultar desglose" : "Ver desglose"}
                </button>
                {onAction && actionLabel ? <Button onClick={() => onAction(partner)}>{actionLabel}</Button> : null}
              </div>

              {isExpanded ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                  {partner.sessionBreakdown.map((session) => (
                    <div key={session.sessionId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--htext2)", gap: 8 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.sessionName}</span>
                      <span>${formatAmount(Math.abs(session.net))}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
