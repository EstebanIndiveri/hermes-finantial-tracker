import { formatARS, formatUSD } from "@/lib/finance/formatters";

interface CategoryAlert {
  name: string;
  emoji: string;
  gastado_ars: number;
  budget_ars: number;
  status: string;
}

interface AlertContext {
  month: string;
  income_usd: number;
  total_spent_usd: number;
  ahorro_proyectado_usd: number;
  saving_goal_usd: number;
  status: string;
  exchange_rate: number;
  categories: CategoryAlert[];
  todayTransactions: { amount_ars: number; category: string; emoji: string }[];
  isMonday: boolean;
}

export interface AlertDecision {
  shouldSend: boolean;
  message: string;
}

/**
 * Evaluates daily alert context and decides what to send (if anything).
 * Rules:
 *  - Always send on Mondays (weekly summary)
 *  - Send if there were expenses today (daily summary)
 *  - Send if any category is WARNING (≥80%) or CLOSED
 *  - Send if month semáforo is YELLOW or RED
 */
export function buildDailyAlert(ctx: AlertContext): AlertDecision {
  const closedCats = ctx.categories.filter(c => c.status === "CLOSED");
  const warningCats = ctx.categories.filter(c => {
    if (c.status === "CLOSED" || c.budget_ars === 0) return false;
    const pct = c.gastado_ars / c.budget_ars;
    return pct >= 0.8;
  });
  const hasTransactionsToday = ctx.todayTransactions.length > 0;
  const isCritical = closedCats.length > 0 || warningCats.length > 0 || ctx.status !== "GREEN";

  const shouldSend = ctx.isMonday || hasTransactionsToday || isCritical;
  if (!shouldSend) return { shouldSend: false, message: "" };

  const lines: string[] = [];
  const dateLabel = new Date().toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  // ── Header ──
  if (ctx.isMonday) {
    lines.push(`📅 <b>Resumen semanal — ${dateLabel}</b>`);
  } else if (hasTransactionsToday) {
    lines.push(`🌙 <b>Resumen del día — ${dateLabel}</b>`);
  } else {
    lines.push(`⚠️ <b>Alerta Hermes — ${dateLabel}</b>`);
  }
  lines.push("");

  // ── Gastos de hoy ──
  if (hasTransactionsToday) {
    const totalHoy = ctx.todayTransactions.reduce((s, t) => s + t.amount_ars, 0);
    lines.push(`<b>Gastos de hoy (${ctx.todayTransactions.length}):</b>`);
    ctx.todayTransactions.forEach(t => {
      lines.push(`  ${t.emoji} ${t.category}: ${formatARS(t.amount_ars)}`);
    });
    lines.push(`  <b>Total: ${formatARS(totalHoy)}</b>`);
    lines.push("");
  }

  // ── Estado del mes ──
  const statusIcon = ctx.status === "GREEN" ? "🟢" : ctx.status === "YELLOW" ? "🟡" : "🔴";
  const goalPct = ctx.saving_goal_usd > 0
    ? Math.round((ctx.ahorro_proyectado_usd / ctx.saving_goal_usd) * 100)
    : null;

  lines.push(`<b>📊 Mes ${ctx.month}:</b>`);
  lines.push(`Gastado: ${formatUSD(ctx.total_spent_usd)} | Ahorro: ${formatUSD(ctx.ahorro_proyectado_usd)}${goalPct !== null ? ` (${goalPct}% de meta)` : ""}`);
  lines.push(`Estado: ${statusIcon} ${ctx.status}`);

  // ── Alertas de categorías ──
  if (closedCats.length > 0 || warningCats.length > 0) {
    lines.push("");
    lines.push("<b>Categorías a revisar:</b>");
    closedCats.forEach(c => {
      const pct = c.budget_ars > 0 ? Math.round((c.gastado_ars / c.budget_ars) * 100) : 100;
      lines.push(`  🔴 ${c.emoji} ${c.name}: ${formatARS(c.gastado_ars)} / ${formatARS(c.budget_ars)} (${pct}%) — CERRADA`);
    });
    warningCats
      .filter(c => c.status !== "CLOSED")
      .forEach(c => {
        const pct = Math.round((c.gastado_ars / c.budget_ars) * 100);
        const disp = c.budget_ars - c.gastado_ars;
        lines.push(`  🟡 ${c.emoji} ${c.name}: ${formatARS(c.gastado_ars)} / ${formatARS(c.budget_ars)} (${pct}%) — quedan ${formatARS(disp)}`);
      });
  }

  return { shouldSend: true, message: lines.join("\n") };
}
