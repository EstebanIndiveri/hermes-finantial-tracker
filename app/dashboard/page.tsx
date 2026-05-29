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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Dashboard <span className="text-muted-foreground text-base font-normal">{month}</span>
        </h1>
      </div>

      {summary && (
        <MonthStatus
          status={summary.status}
          ahorro_usd={summary.ahorro_proyectado_usd}
          saving_goal_usd={summary.saving_goal_usd}
        />
      )}

      {summary?.exchange_rate_source !== "ripio" && (
        <div className="text-xs text-yellow-500 bg-yellow-900/20 border border-yellow-700 rounded px-3 py-2">
          ⚠️ Tipo de cambio ingresado manualmente. Actualizar desde Ajustes para usar la cotización Ripio.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryBar
          label="Ingreso mensual"
          value={`$${incomeARS.toLocaleString("es-AR")}`}
          sub={`USD ${summary?.income_usd?.toFixed(0) ?? "—"}`}
        />
        <SummaryBar label="Gasto total" value={`$${spentARS.toLocaleString("es-AR")}`} />
        <SummaryBar
          label="Ahorro proyectado"
          value={`$${ahorroARS.toLocaleString("es-AR")}`}
          sub={`USD ${summary?.ahorro_proyectado_usd?.toFixed(0) ?? "—"}`}
        />
        <SummaryBar label="% Ahorro" value={`${pctAhorro}%`} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold mb-3">Gastos por categoría</h2>
          <CategoryDonut
            data={categoryBreakdown.map(c => ({ name: c.name, gastado_ars: c.gastado_ars, emoji: c.emoji }))}
          />
        </div>
        <div>
          <h2 className="font-semibold mb-3">Presupuesto vs Gastado</h2>
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

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold mb-3">Registrar gasto</h2>
          <ExpenseForm categories={categoryBreakdown} />
        </div>
        <div>
          <h2 className="font-semibold mb-3">Categorías</h2>
          <div className="space-y-2">
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

      <div>
        <h2 className="font-semibold mb-3">Últimos movimientos</h2>
        <div className="space-y-2">
          {recentTx.length === 0 && (
            <p className="text-muted-foreground text-sm">Sin movimientos este mes.</p>
          )}
          {recentTx.map(tx => {
            const txWithCat = tx as typeof tx & { category?: { emoji: string; name: string } };
            return (
              <div
                key={tx.id}
                className="flex items-center justify-between bg-card border rounded-xl px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium">
                    {txWithCat.category?.emoji} {txWithCat.category?.name}
                  </span>
                  {tx.merchant && (
                    <span className="text-muted-foreground ml-2">{tx.merchant}</span>
                  )}
                </div>
                <span className="font-semibold">${tx.amount_ars.toLocaleString("es-AR")}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
