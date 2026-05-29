import { formatARS, formatUSD } from "@/lib/finance/formatters";

export function formatTransactionConfirm(params: {
  amount_ars: number;
  category: string;
  emoji: string;
  gastado_ars: number;
  budget_ars: number;
  disponible_ars: number | null;
  status: string;
  ahorro_proyectado_usd: number;
}): string {
  const statusIcon = params.status === "OK" ? "🟢 OK" : params.status === "WARNING" ? "🟡 WARNING" : "🔴 CLOSED";
  const lines = [
    `✅ Registrado: ${formatARS(params.amount_ars)} en ${params.emoji} ${params.category}.`,
    ``,
    `<b>${params.emoji} ${params.category} — este mes:</b>`,
    `Presupuesto: ${params.budget_ars > 0 ? formatARS(params.budget_ars) : "Sin límite"}`,
    `Gastado: ${formatARS(params.gastado_ars)}`,
    params.disponible_ars !== null ? `Disponible: ${formatARS(params.disponible_ars)}` : null,
    `Estado: ${statusIcon}`,
    ``,
    `💰 Ahorro proyectado: ${formatUSD(params.ahorro_proyectado_usd)}`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

export function formatResumen(params: {
  month: string;
  income_usd: number;
  total_spent_usd: number;
  ahorro_proyectado_usd: number;
  status: string;
  exchange_rate: number;
}): string {
  const icon = params.status === "GREEN" ? "🟢" : params.status === "YELLOW" ? "🟡" : "🔴";
  return [
    `<b>📊 Resumen ${params.month}</b>`,
    ``,
    `Ingreso: ${formatUSD(params.income_usd)}`,
    `Gastado: ${formatUSD(params.total_spent_usd)}`,
    `Ahorro proyectado: ${formatUSD(params.ahorro_proyectado_usd)}`,
    `Tipo de cambio: $${params.exchange_rate.toLocaleString("es-AR")}`,
    ``,
    `Estado: ${icon} ${params.status}`,
  ].join("\n");
}

export function formatDisponible(params: {
  category: string;
  emoji: string;
  budget_ars: number;
  gastado_ars: number;
  disponible_ars: number | null;
  status: string;
}): string {
  const statusIcon = params.status === "OK" ? "🟢 OK" : params.status === "WARNING" ? "🟡 WARNING" : "🔴 CLOSED";
  return [
    `<b>${params.emoji} ${params.category}</b>`,
    `Presupuesto: ${params.budget_ars > 0 ? formatARS(params.budget_ars) : "Sin límite"}`,
    `Gastado: ${formatARS(params.gastado_ars)}`,
    params.disponible_ars !== null ? `Disponible: ${formatARS(params.disponible_ars)}` : "Sin límite definido",
    `Estado: ${statusIcon}`,
  ].join("\n");
}

export function formatPuedo(params: {
  amount_ars: number;
  category: string;
  emoji: string;
  // Categoría actual
  gastado_ars: number;
  budget_ars: number;
  newCategoryStatus: string;
  disponible_after: number | null;
  // Ahorro
  ahorro_usd_before: number;
  ahorro_usd_after: number;
  newMonthStatus: string;
  saving_goal_usd: number;
}): string {
  const {
    amount_ars, category, emoji,
    gastado_ars, budget_ars,
    newCategoryStatus, disponible_after,
    ahorro_usd_before, ahorro_usd_after,
    newMonthStatus, saving_goal_usd,
  } = params;

  const catIcon = newCategoryStatus === "OK" ? "🟢" : newCategoryStatus === "WARNING" ? "🟡" : "🔴";
  const monthIcon = newMonthStatus === "GREEN" ? "🟢" : newMonthStatus === "YELLOW" ? "🟡" : "🔴";

  // Decision header
  let decision: string;
  if (newCategoryStatus === "CLOSED" && budget_ars > 0) {
    decision = "🔴 <b>No te alcanza</b> — superarías el presupuesto de esta categoría.";
  } else if (newMonthStatus === "RED") {
    decision = "🔴 <b>Cuidado</b> — este gasto pondría tu ahorro en rojo.";
  } else if (newMonthStatus === "YELLOW" || newCategoryStatus === "WARNING") {
    decision = "🟡 <b>Podés, pero con cuidado</b> — estarías ajustado.";
  } else {
    decision = "🟢 <b>Sí podés</b> — sin comprometer tus metas.";
  }

  const lines = [
    `💭 <b>¿Podés gastar ${formatARS(amount_ars)} en ${emoji} ${category}?</b>`,
    ``,
    decision,
    ``,
    `<b>${emoji} ${category} después del gasto:</b>`,
    `Gastado: ${formatARS(gastado_ars + amount_ars)}${budget_ars > 0 ? ` de ${formatARS(budget_ars)}` : " (sin límite)"}`,
    disponible_after !== null && disponible_after > 0
      ? `Disponible: ${formatARS(disponible_after)} ${catIcon}`
      : disponible_after !== null && disponible_after <= 0
        ? `Sin disponible restante ${catIcon}`
        : `Sin presupuesto definido ${catIcon}`,
    ``,
    `<b>💰 Impacto en ahorro:</b>`,
    `Antes: ${formatUSD(ahorro_usd_before)} → Después: ${formatUSD(ahorro_usd_after)} ${monthIcon}`,
    saving_goal_usd > 0
      ? `Meta: ${formatUSD(saving_goal_usd)} (${Math.round((ahorro_usd_after / saving_goal_usd) * 100)}% alcanzado)`
      : "",
  ];

  return lines.filter(l => l !== "").join("\n");
}
