import {
  INCOME_CATEGORY_SLUG,
  isIncomeCategory,
  splitIncomeAndExpenses,
} from "../income";

describe("isIncomeCategory", () => {
  it("recognizes the income category slug", () => {
    expect(isIncomeCategory(INCOME_CATEGORY_SLUG)).toBe(true);
    expect(isIncomeCategory("ingresos")).toBe(true);
  });

  it("treats every other category (and null) as expense", () => {
    expect(isIncomeCategory("supermercado")).toBe(false);
    expect(isIncomeCategory("verduleria")).toBe(false);
    expect(isIncomeCategory(null)).toBe(false);
    expect(isIncomeCategory(undefined)).toBe(false);
  });
});

describe("splitIncomeAndExpenses", () => {
  it("keeps income separate from expenses so it is never subtracted", () => {
    const result = splitIncomeAndExpenses([
      { slug: "supermercado", amount: 100 },
      { slug: "verduleria", amount: 50 },
      { slug: "ingresos", amount: 492900 },
    ]);
    expect(result.expense).toBe(150);
    expect(result.income).toBe(492900);
  });

  it("returns zeroes for an empty list", () => {
    expect(splitIncomeAndExpenses([])).toEqual({ expense: 0, income: 0 });
  });

  it("sums multiple income rows", () => {
    const result = splitIncomeAndExpenses([
      { slug: "ingresos", amount: 100 },
      { slug: "ingresos", amount: 200 },
      { slug: "restaurante", amount: 30 },
    ]);
    expect(result.income).toBe(300);
    expect(result.expense).toBe(30);
  });

  // Regression for the reported bug: registering income (alquiler caseros) as an
  // "ingresos" transaction must ADD to savings, not be subtracted like a spend.
  it("makes projected savings increase with income (regression)", () => {
    const configuredIncomeUsd = 4814;
    const rows = [
      { slug: "supermercado", amount: 200 },
      { slug: "ingresos", amount: 337 }, // 492900 ARS ≈ 337 USD
    ];
    const { expense, income } = splitIncomeAndExpenses(rows);
    const effectiveIncome = configuredIncomeUsd + income;
    const savings = effectiveIncome - expense;
    // Without the fix, savings would be 4814 - (200 + 337) = 4277 (income subtracted).
    // With the fix, income is added: 4814 + 337 - 200 = 4951.
    expect(savings).toBe(4951);
  });
});
