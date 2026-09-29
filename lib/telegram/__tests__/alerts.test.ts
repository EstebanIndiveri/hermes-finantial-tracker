import { buildDailyAlert } from "../alerts";

const base = {
  month: "2026-09",
  income_usd: 1002.5,
  total_spent_usd: 74.23,
  ahorro_proyectado_usd: 928.27,
  saving_goal_usd: 0,
  status: "GREEN",
  exchange_rate: 1600,
  categories: [],
  todayTransactions: [],
  isMonday: false,
};

it("does not send a daily expense alert without expenses or a critical status", () => {
  expect(buildDailyAlert(base)).toEqual({ shouldSend: false, message: "" });
});

it("reports only supplied expenses in ARS while the month totals remain USD", () => {
  const result = buildDailyAlert({
    ...base,
    todayTransactions: [{ amount_ars: 137, category: "Supermercado", emoji: "🛒" }],
  });
  expect(result.shouldSend).toBe(true);
  expect(result.message).toContain("Gastos de hoy (1)");
  expect(result.message).toContain("Supermercado:");
  expect(result.message).toContain("Total:");
  expect(result.message).toContain("Gastado: USD $74.23 | Ahorro: USD $928.27");
  expect(result.message).not.toContain("Ingresos:");
});
