import { headers } from "next/headers";
import { getMonthSummary, getCategoryBreakdown } from "@/lib/finance/summaries";
import { db } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getActiveMonthArgentina } from "@/lib/utils/dates";
import { MonthStatus } from "@/components/dashboard/MonthStatus";
import { SummaryBar } from "@/components/dashboard/SummaryBar";
import { CategoryCard } from "@/components/dashboard/CategoryCard";
import { CategoryDonut } from "@/components/dashboard/CategoryDonut";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { ExpenseForm } from "@/components/forms/ExpenseForm";

export default async function DashboardPage() {
  const hdrs = await headers();
  const userId = hdrs.get("x-user-id")!;
  const month = getActiveMonthArgentina();

  const [summary, categoryBreakdown] = await Promise.all([
    getMonthSummary(userId, month),
    getCategoryBreakdown(userId, month),
  ]);

  const recentTx = await db.query.transactions.findMany({
    where: and(
      eq(transactions.user_id, userId),
      eq(transactions.month, month),
      eq(transactions.status, "active"),
    ),
    orderBy: (t, { desc }) => desc(t.created_at),
    limit: 10,
    with: { category: true },
  });

  const spentARS = categoryBreakdown.reduce((acc, c) => acc + c.gastado_ars, 0);
  const incomeARS = (summary?.income_usd ?? 0) * (summary?.exchange_rate ?? 1);
  const ahorroARS = incomeARS - spentARS;
  const pctAhorro = incomeARS > 0 ? Math.round((ahorroARS / incomeARS) * 100) : 0;

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-3xl tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="inline-flex items-center gap-1.5 bg-white/5 border border-border/50 rounded-full px-3 py-0.5 text-xs font-medium">
              📅 {month}
            </span>
          </p>
        </div>
      </div>

      {summary && (
        <MonthStatus
          status={summary.status}
          ahorro_usd={summary.ahorro_proyectado_usd}
          saving_goal_usd={summary.saving_goal_usd}
        />
      )}

      {summary?.exchange_rate_source !== "ripio" && (
        <div className="text-xs text-amber-400 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <span>⚠️</span>
          <span>Tipo de cambio ingresado manualmente. Actualizar desde Ajustes para usar la cotización Ripio.</span>
        </div>
      )}

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryBar
          label="Ingreso mensual"
          value={`$${incomeARS.toLocaleString("es-AR")}`}
          sub={`USD ${summary?.income_usd?.toFixed(0) ?? "—"}`}
          icon="💵"
        />
        <SummaryBar
          label="Gasto total"
          value={`$${spentARS.toLocaleString("es-AR")}`}
          icon="💸"
        />
        <SummaryBar
          label="Ahorro proyectado"
          value={`$${ahorroARS.toLocaleString("es-AR")}`}
          sub={`USD ${summary?.ahorro_proyectado_usd?.toFixed(0) ?? "—"}`}
          icon="🏦"
        />
        <SummaryBar label="% Ahorro" value={`${pctAhorro}%`} icon="📊" />
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card border border-border/60 rounded-2xl p-5 card-glow">
          <h2 className="font-heading font-semibold text-sm uppercase tracking-widest text-muted-foreground mb-4">
            Gastos por categoría
          </h2>
          <CategoryDonut
            data={categoryBreakdown.map(c => ({ name: c.name, gastado_ars: c.gastado_ars, emoji: c.emoji }))}
          />
        </div>
        <div className="bg-card border border-border/60 rounded-2xl p-5 card-glow">
          <h2 className="font-heading font-semibold text-sm uppercase tracking-widest text-muted-foreground mb-4">
            Presupuesto vs Gastado
          </h2>
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

      {/* Form + Categories */}
      <div className="grid md:grid-cols-3 gap-6">
        <div>
          <h2 className="font-heading font-semibold text-sm uppercase tracking-widest text-muted-foreground mb-4">
            Registrar gasto
          </h2>
          <ExpenseForm categories={categoryBreakdown} />
        </div>
        <div className="md:col-span-2">
          <h2 className="font-heading font-semibold text-sm uppercase tracking-widest text-muted-foreground mb-4">
            Categorías
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {categoryBreakdown.map(cat => (
              <CategoryCard
                key={cat.id}
                name={cat.name}
                emoji={cat.emoji}
                status={cat.status as "OK" | "WARNING" | "CLOSED"}
                gastado_ars={cat.gastado_ars}
                budget_ars={cat.budget_ars}
                disponible_ars={cat.disponible_ars}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div>
        <h2 className="font-heading font-semibold text-sm uppercase tracking-widest text-muted-foreground mb-4">
          Últimos movimientos
        </h2>
        <div className="space-y-2">
          {recentTx.length === 0 && (
            <p className="text-muted-foreground text-sm py-6 text-center">Sin movimientos este mes.</p>
          )}
          {recentTx.map(tx => {
            const txWithCat = tx as typeof tx & { category?: { emoji: string; name: string } };
            return (
              <div
                key={tx.id}
                className="card-glow flex items-center justify-between bg-card border border-border/60 rounded-xl px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium">
                    {txWithCat.category?.emoji} {txWithCat.category?.name}
                  </span>
                  {tx.merchant && (
                    <span className="text-muted-foreground ml-2">{tx.merchant}</span>
                  )}
                </div>
                <span className="font-heading font-semibold text-foreground">${tx.amount_ars.toLocaleString("es-AR")}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
