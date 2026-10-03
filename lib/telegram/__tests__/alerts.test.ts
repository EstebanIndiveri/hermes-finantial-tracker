import { buildDailyAlert } from "../alerts";

const base = {
  month: "2026-09",
  accountingCurrency: "USD" as const,
  income: 1002.5,
  totalSpent: 74.23,
  projectedSavings: 928.27,
  savingGoal: 0,
  status: "GREEN",
  categories: [],
  todayTransactions: [],
  isMonday: false,
};

it("does not send a daily expense alert without expenses or a critical status", () => {
  expect(buildDailyAlert(base)).toEqual({ shouldSend: false, message: "" });
});

it("uses only ARS in an ARS-only alert and never prints fabricated USD", () => {
  const result = buildDailyAlert({
    ...base,
    accountingCurrency: "ARS",
    income: 100000,
    totalSpent: 25000,
    projectedSavings: 75000,
    savingGoal: 80000,
    todayTransactions: [{ amount_ars: 100, category: "Supermercado", emoji: "🛒" }],
  });
  expect(result.message.replaceAll("\u00a0", " ")).toContain("Gastado: ARS $ 25.000 | Ahorro: ARS $ 75.000");
  expect(result.message).not.toContain("USD");
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
