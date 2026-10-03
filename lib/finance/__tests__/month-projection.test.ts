import { projectMonth } from "../month-projection";

describe("monthly projection by currency mode", () => {
  test("USD_ARS keeps income and goal in USD and sums persisted USD equivalents", () => {
    const result = projectMonth({
      mode: "USD_ARS",
      configuredIncome: 2_000,
      savingGoal: 500,
      transactions: [
        { kind: "income", categorySlug: "ingresos", amountArs: 100_000, amountUsd: 100 },
        { kind: "expense", categorySlug: "supermercado", amountArs: 30_000, amountUsd: 30 },
        { kind: "expense", categorySlug: "supermercado", amountArs: 20_000, amountUsd: 20 },
        { kind: "expense", categorySlug: "alquiler", amountArs: 800_000, amountUsd: 800 },
      ],
    });

    expect(result).toEqual({
      mode: "USD_ARS",
      accountingCurrency: "USD",
      configuredIncome: 2_000,
      extraIncome: 100,
      effectiveIncome: 2_100,
      totalExpenses: 850,
      projectedSavings: 1_250,
      savingGoal: 500,
      categoryExpensesArs: { supermercado: 50_000, alquiler: 800_000 },
    });
  });

  test("ARS_ARS projects entirely in ARS without USD amounts or an exchange rate", () => {
    const result = projectMonth({
      mode: "ARS_ARS",
      configuredIncome: 1_500_000,
      savingGoal: 200_000,
      transactions: [
        { kind: "income", categorySlug: "ingresos", amountArs: 250_000 },
        { kind: "expense", categorySlug: "supermercado", amountArs: 80_000 },
        { kind: "expense", categorySlug: "alquiler", amountArs: 900_000 },
      ],
    });

    expect(result).toEqual({
      mode: "ARS_ARS",
      accountingCurrency: "ARS",
      configuredIncome: 1_500_000,
      extraIncome: 250_000,
      effectiveIncome: 1_750_000,
      totalExpenses: 980_000,
      projectedSavings: 770_000,
      savingGoal: 200_000,
      categoryExpensesArs: { supermercado: 80_000, alquiler: 900_000 },
    });
  });

  test("type determines the sign; category slug is not financial authority", () => {
    const result = projectMonth({
      mode: "ARS_ARS",
      configuredIncome: 100,
      savingGoal: 0,
      transactions: [
        { kind: "income", categorySlug: "venta", amountArs: 50 },
        { kind: "expense", categorySlug: "ingresos", amountArs: 20 },
      ],
    });
    expect(result.effectiveIncome).toBe(150);
    expect(result.totalExpenses).toBe(20);
    expect(result.projectedSavings).toBe(130);
    expect(result.categoryExpensesArs).toEqual({ ingresos: 20 });
  });
});
