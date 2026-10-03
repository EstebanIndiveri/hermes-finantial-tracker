import { formatARS, formatUSD } from "@/lib/finance/formatters";
import type { CurrencyMode } from "@/lib/finance/currency-mode";

type TransactionConfirmBase = {
  amount_ars: number;
  category: string;
  emoji: string;
  gastado_ars: number;
  budget_ars: number;
  disponible_ars: number | null;
  status: string;
  is_income?: boolean;
};

type TransactionConfirmSavings =
  | { currency_mode?: "USD_ARS"; ahorro_proyectado_usd?: number }
  | { currency_mode: "ARS_ARS"; ahorro_proyectado_ars?: number };

export function formatTransactionConfirm(params: TransactionConfirmBase & TransactionConfirmSavings): string {
  const savingsLine = params.currency_mode === "ARS_ARS"
    ? params.ahorro_proyectado_ars === undefined
      ? null
      : `💰 Ahorro proyectado: ${formatARS(params.ahorro_proyectado_ars)}`
    : params.ahorro_proyectado_usd === undefined
      ? null
      : `💰 Ahorro proyectado: ${formatUSD(params.ahorro_proyectado_usd)}`;

  if (params.is_income) {
    const lines = [
      `✅ Ingreso registrado: +${formatARS(params.amount_ars)} en ${params.emoji} ${params.category}.`,
      ``,
      `Este ingreso suma a tu balance del mes.`,
      ...(savingsLine ? [``, savingsLine] : []),
    ];
    return lines.filter((line): line is string => line !== null).join("\n");
  }
  const statusIcon = params.status === "OK" ? "🟢 OK" : params.status === "WARNING" ? "🟡 WARNING" : "🔴 CLOSED";
  const lines = [
    `✅ Registrado: ${formatARS(params.amount_ars)} en ${params.emoji} ${params.category}.`,
    ``,
    `<b>${params.emoji} ${params.category} — este mes:</b>`,
    `Presupuesto: ${params.budget_ars > 0 ? formatARS(params.budget_ars) : "Sin límite"}`,
    `Gastado: ${formatARS(params.gastado_ars)}`,
    params.disponible_ars !== null ? `Disponible: ${formatARS(params.disponible_ars)}` : null,
    `Estado: ${statusIcon}`,
    ...(savingsLine ? [``, savingsLine] : []),
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

type SummaryFormatParams =
  | {
      currency_mode?: "USD_ARS";
      month: string;
      income_usd: number;
      total_spent_usd: number;
      ahorro_proyectado_usd: number;
      status: string;
      exchange_rate: number;
    }
  | {
      currency_mode: "ARS_ARS";
      month: string;
      income_ars: number;
      total_spent_ars: number;
      ahorro_proyectado_ars: number;
      status: string;
    };

export function formatResumen(params: SummaryFormatParams): string {
  const icon = params.status === "GREEN" ? "🟢" : params.status === "YELLOW" ? "🟡" : "🔴";
  if (params.currency_mode === "ARS_ARS") {
    return [
      `<b>📊 Resumen ${params.month}</b>`,
      ``,
      `Ingreso: ARS ${formatARS(params.income_ars)}`,
      `Gastado: ARS ${formatARS(params.total_spent_ars)}`,
      `Ahorro proyectado: ARS ${formatARS(params.ahorro_proyectado_ars)}`,
      ``,
      `Estado: ${icon} ${params.status}`,
    ].join("\n");
  }
  return [
    `<b>📊 Resumen ${params.month}</b>`,
    ``,
    `Ingreso: USD ${formatUSD(params.income_usd)}`,
    `Gastado: USD ${formatUSD(params.total_spent_usd)}`,
    `Ahorro proyectado: USD ${formatUSD(params.ahorro_proyectado_usd)}`,
    `Tipo de cambio: ${params.exchange_rate.toLocaleString("es-AR")} ARS/USD`,
    ``,
    `Estado: ${icon} ${params.status}`,
  ].join("\n");
}

export function formatDisponible(params: {
  currency_mode?: CurrencyMode;
  category: string;
  emoji: string;
  budget_ars: number;
  gastado_ars: number;
  disponible_ars: number | null;
  status: string;
}): string {
  const statusIcon = params.status === "OK" ? "🟢 OK" : params.status === "WARNING" ? "🟡 WARNING" : "🔴 CLOSED";
  const formatAmount = (amount: number) => params.currency_mode === "ARS_ARS"
    ? `ARS ${formatARS(amount)}`
    : formatARS(amount);
  return [
    `<b>${params.emoji} ${params.category}</b>`,
    `Presupuesto: ${params.budget_ars > 0 ? formatAmount(params.budget_ars) : "Sin límite"}`,
    `Gastado: ${formatAmount(params.gastado_ars)}`,
    params.disponible_ars !== null ? `Disponible: ${formatAmount(params.disponible_ars)}` : "Sin límite definido",
    `Estado: ${statusIcon}`,
  ].join("\n");
}

type CanSpendBase = {
  amount_ars: number;
  category: string;
  emoji: string;
  gastado_ars: number;
  budget_ars: number;
  newCategoryStatus: string;
  disponible_after: number | null;
  newMonthStatus: string;
};

type CanSpendFormatParams = CanSpendBase & (
  | {
      currency_mode?: "USD_ARS";
      ahorro_usd_before: number;
      ahorro_usd_after: number;
      saving_goal_usd: number;
    }
  | {
      currency_mode: "ARS_ARS";
      ahorro_ars_before: number;
      ahorro_ars_after: number;
      saving_goal_ars: number;
    }
);

export function formatPuedo(params: CanSpendFormatParams): string {
  const {
    amount_ars, category, emoji,
    gastado_ars, budget_ars,
    newCategoryStatus, disponible_after,
    newMonthStatus,
  } = params;
  const isArsOnly = params.currency_mode === "ARS_ARS";
  const formatAmount = (amount: number) => isArsOnly ? `ARS ${formatARS(amount)}` : formatARS(amount);
  const savingsBefore = isArsOnly ? params.ahorro_ars_before : params.ahorro_usd_before;
  const savingsAfter = isArsOnly ? params.ahorro_ars_after : params.ahorro_usd_after;
  const savingsGoal = isArsOnly ? params.saving_goal_ars : params.saving_goal_usd;
  const formatSavings = (amount: number) => isArsOnly ? `ARS ${formatARS(amount)}` : formatUSD(amount);

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
    `💭 <b>¿Podés gastar ${formatAmount(amount_ars)} en ${emoji} ${category}?</b>`,
    ``,
    decision,
    ``,
    `<b>${emoji} ${category} después del gasto:</b>`,
    `Gastado: ${formatAmount(gastado_ars + amount_ars)}${budget_ars > 0 ? ` de ${formatAmount(budget_ars)}` : " (sin límite)"}`,
    disponible_after !== null && disponible_after > 0
      ? `Disponible: ${formatAmount(disponible_after)} ${catIcon}`
      : disponible_after !== null && disponible_after <= 0
        ? `Sin disponible restante ${catIcon}`
        : `Sin presupuesto definido ${catIcon}`,
    ``,
    `<b>💰 Impacto en ahorro:</b>`,
    `Antes: ${formatSavings(savingsBefore)} → Después: ${formatSavings(savingsAfter)} ${monthIcon}`,
    savingsGoal > 0
      ? `Meta: ${formatSavings(savingsGoal)} (${Math.round((savingsAfter / savingsGoal) * 100)}% alcanzado)`
      : "",
  ];

  return lines.filter(l => l !== "").join("\n");
}
