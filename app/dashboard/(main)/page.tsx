import { headers } from "next/headers";
import { getMonthSummary, getCategoryBreakdown } from "@/lib/finance/summaries";
import { db } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getActiveMonthArgentina } from "@/lib/utils/dates";
import { HermesExpenseForm } from "@/components/forms/HermesExpenseForm";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { CategoryDonut } from "@/components/dashboard/CategoryDonut";
import { MonthSelector } from "@/components/dashboard/MonthSelector";
import { TransactionList } from "@/components/dashboard/TransactionList";
import { ExportPanel } from "@/components/dashboard/ExportPanel";

export const dynamic = "force-dynamic";

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const hdrs = await headers();
  const userId = hdrs.get("x-user-id")!;
  const groupId = hdrs.get("x-group-id") ?? userId;
  const params = await searchParams;
  const currentMonth = getActiveMonthArgentina();
  const month =
    params.month && MONTH_REGEX.test(params.month) && params.month <= currentMonth
      ? params.month
      : currentMonth;

  const [summary, categoryBreakdown] = await Promise.all([
    getMonthSummary(groupId, month),
    getCategoryBreakdown(groupId, month),
  ]);

  const recentTx = await db.query.transactions.findMany({
    where: and(
      eq(transactions.group_id, groupId),
      eq(transactions.month, month),
      eq(transactions.status, "active"),
    ),
    orderBy: (t, { desc }) => desc(t.created_at),
    with: { category: true },
  });

  const spentARS = categoryBreakdown.reduce((acc, c) => acc + c.gastado_ars, 0);
  const incomeARS = (summary?.income_usd ?? 0) * (summary?.exchange_rate ?? 1);
  const ahorroARS = incomeARS - spentARS;
  const pctAhorro = incomeARS > 0 ? Math.round((ahorroARS / incomeARS) * 100) : 0;
  const ahorroUSD = summary?.ahorro_proyectado_usd ?? 0;
  const goalUSD = summary?.saving_goal_usd ?? 0;
  const status = summary?.status ?? "GREEN";

  // Gauge offset: 188 = full circle. offset=38 means 80% filled
  const gaugePct = goalUSD > 0 ? Math.min(1, ahorroUSD / goalUSD) : 0;
  const gaugeOffset = Math.round(188 - gaugePct * 188);
  const gaugeColor = status === "GREEN" ? "" : status === "YELLOW" ? "yellow" : "red";

  const closedCats = categoryBreakdown.filter(c => c.status === "CLOSED");
  const monthLabel = new Date(month + "-01").toLocaleDateString("es-AR", { month: "long", year: "numeric" });

  return (
    <>
      {/* Month selector header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 400, color: "var(--htext1)", margin: 0 }}>
            Dashboard
          </h1>
          {month !== currentMonth && (
            <p style={{ fontSize: 11, color: "var(--haccent)", marginTop: 3, fontWeight: 500 }}>
              📅 Viendo mes pasado — podés editar libremente
            </p>
          )}
        </div>
        <MonthSelector month={month} />
      </div>

      {/* Closed category alert */}
      {closedCats.length > 0 && (
        <div className="h-alert-closed h-animate">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>
            {closedCats.map(c => c.name).join(", ")} superó el presupuesto.{" "}
            {closedCats.length === 1 ? "Categoría cerrada" : "Categorías cerradas"} por este mes.
          </span>
        </div>
      )}

      {/* Exchange rate warning */}
      {summary?.exchange_rate_source !== "ripio" && (
        <div className="h-alert-warn h-animate">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>Tipo de cambio ingresado manualmente. Actualizá desde Ajustes para usar cotización Ripio.</span>
        </div>
      )}

      {/* ── Status Banner ── */}
      <div className="h-status-banner h-animate">
        <div className="h-status-gauge" aria-hidden="true">
          <svg className="h-gauge-svg" viewBox="0 0 80 80">
            <circle className="h-gauge-track" cx="40" cy="40" r="30"/>
            <circle
              className={`h-gauge-fill${gaugeColor ? ` ${gaugeColor}` : ""}`}
              cx="40" cy="40" r="30"
              style={{ strokeDashoffset: gaugeOffset }}
            />
          </svg>
          <div className="h-gauge-center">
            <div className={`h-gauge-dot${gaugeColor ? ` ${gaugeColor}` : ""}`} />
          </div>
        </div>

        <div className="h-status-info">
          <div className={`h-status-badge${gaugeColor ? ` ${gaugeColor}` : ""}`}>
            {status === "GREEN" ? "Estado verde" : status === "YELLOW" ? "Estado amarillo" : "Estado rojo"}
          </div>
          <div className="h-status-main">
            USD {ahorroUSD.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          </div>
          <div className="h-status-sub">
            Ahorro proyectado · meta: USD {goalUSD.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          </div>
        </div>

        <div className="h-status-grid">
          <div className="h-status-stat">
            <div className="h-stat-label">Ingreso</div>
            <div className="h-stat-val">
              USD {(summary?.income_usd ?? 0).toFixed(0)}
            </div>
          </div>
          <div className="h-status-stat">
            <div className="h-stat-label">Gastado</div>
            <div className={`h-stat-val${spentARS > 0 ? " red" : ""}`}>
              ${spentARS.toLocaleString("es-AR")}
            </div>
          </div>
          <div className="h-status-stat">
            <div className="h-stat-label">% Ahorro</div>
            <div className={`h-stat-val${pctAhorro >= 50 ? " green" : " red"}`}>
              {pctAhorro}%
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div className="h-grid-2">
        <div className="h-card h-animate" style={{ animationDelay: "0.05s" }}>
          <div className="h-card-header">
            <h2 className="h-card-title">Distribución por categoría</h2>
          </div>
          <div className="h-card-body">
            <CategoryDonut
              data={categoryBreakdown.map(c => ({ name: c.name, gastado_ars: c.gastado_ars, emoji: c.emoji }))}
            />
          </div>
        </div>

        <div className="h-card h-animate" style={{ animationDelay: "0.1s" }}>
          <div className="h-card-header">
            <h2 className="h-card-title">Presupuesto vs Gastado — {monthLabel}</h2>
          </div>
          <div className="h-card-body">
            <SpendingChart
              data={categoryBreakdown.map(c => ({
                name: c.emoji,
                gastado: c.gastado_ars,
                budget: c.budget_ars,
                status: c.status,
              }))}
            />
          </div>
        </div>
      </div>

      {/* ── Categories + Form ── */}
      <div className="h-grid-2">
        {/* Categories */}
        <div className="h-card h-animate" style={{ animationDelay: "0.15s" }}>
          <div className="h-card-header">
            <h2 className="h-card-title">Presupuestos {monthLabel}</h2>
          </div>
          <div className="h-card-body">
            <div className="h-cat-list">
              {categoryBreakdown.map(cat => {
                const pct = cat.budget_ars > 0 ? Math.min(100, Math.round((cat.gastado_ars / cat.budget_ars) * 100)) : 0;
                const barClass = cat.status === "OK" ? "h-bar-ok" : cat.status === "WARNING" ? "h-bar-warn" : "h-bar-closed";
                const badgeClass = cat.status === "OK" ? "h-badge-ok" : cat.status === "WARNING" ? "h-badge-warn" : "h-badge-closed";
                const badgeLabel = cat.status === "OK" ? "OK" : cat.status === "WARNING" ? "ATENCIÓN" : "CERRADO";
                return (
                  <div key={cat.id} className="h-cat-item">
                    <div>
                      <div className="h-cat-name">{cat.emoji} {cat.name}</div>
                      {cat.budget_ars > 0 && (
                        <div className="h-cat-progress">
                          <div className={`h-cat-bar ${barClass}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="h-cat-right">
                      <div className="h-cat-pct">
                        {cat.budget_ars > 0
                          ? `$${(cat.gastado_ars / 1000).toFixed(0)}k / $${(cat.budget_ars / 1000).toFixed(0)}k`
                          : `$${cat.gastado_ars.toLocaleString("es-AR")}`
                        }
                      </div>
                      <div><span className={`h-cat-badge ${badgeClass}`}>{badgeLabel}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Expense Form */}
        <div className="h-card h-animate" id="expense-form" style={{ animationDelay: "0.2s" }}>
          <div className="h-card-header">
            <h2 className="h-card-title">Registrar gasto</h2>
          </div>
          <div className="h-card-body">
            <HermesExpenseForm
              categories={categoryBreakdown}
              exchangeRate={summary?.exchange_rate ?? 1}
              month={month}
            />
          </div>
        </div>
      </div>

      {/* ── Transactions ── */}
      <div className="h-card h-animate" style={{ animationDelay: "0.25s", marginBottom: 20 }}>
        <div className="h-card-header">
          <h2 className="h-section-title">Últimos movimientos</h2>
        </div>
        <div className="h-card-body">
          <TransactionList
            transactions={recentTx as Parameters<typeof TransactionList>[0]["transactions"]}
            month={month}
          />
        </div>
      </div>

      {/* ── Export ── */}
      <div className="h-card h-animate" style={{ animationDelay: "0.3s" }}>
        <div className="h-card-header">
          <h2 className="h-card-title">Exportar movimientos</h2>
        </div>
        <div className="h-card-body">
          <ExportPanel month={month} />
        </div>
      </div>
    </>
  );
}
