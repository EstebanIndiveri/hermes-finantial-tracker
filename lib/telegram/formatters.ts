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
