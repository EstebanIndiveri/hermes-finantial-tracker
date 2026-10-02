import { calculateMonthStatus, calculateCategoryStatus, calculateSavingsPercent } from "../rules";

test("GREEN when ahorro >= saving_goal_usd", () => {
  expect(calculateMonthStatus({ income_usd: 4814, total_spent_usd: 800, saving_goal_usd: 4000, saving_goal_yellow: 3800 })).toBe("GREEN");
});

test("YELLOW when ahorro >= saving_goal_yellow but < saving_goal_usd", () => {
  expect(calculateMonthStatus({ income_usd: 4814, total_spent_usd: 1014, saving_goal_usd: 4000, saving_goal_yellow: 3800 })).toBe("YELLOW");
});

test("RED when ahorro < saving_goal_yellow", () => {
  expect(calculateMonthStatus({ income_usd: 4814, total_spent_usd: 1200, saving_goal_usd: 4000, saving_goal_yellow: 3800 })).toBe("RED");
});

test("savings percentage uses the same persisted USD projection as the summary", () => {
  // A current ARS exchange rate must not revalue historical USD transactions.
  expect(calculateSavingsPercent({ income_usd: 100, ahorro_proyectado_usd: 50 })).toBe(50);
  expect(calculateSavingsPercent({ income_usd: 100, ahorro_proyectado_usd: 100 })).toBe(100);
  expect(calculateSavingsPercent({ income_usd: 100, ahorro_proyectado_usd: -20 })).toBe(-20);
  expect(calculateSavingsPercent({ income_usd: 0, ahorro_proyectado_usd: 0 })).toBe(0);
  expect(calculateSavingsPercent({ income_usd: 4826.5, ahorro_proyectado_usd: 4820.25 })).toBe(99.9);
  expect(calculateSavingsPercent({ income_usd: 100000, ahorro_proyectado_usd: 99999 })).toBe(99.9);
});

test("OK when budget_ars = 0 (unlimited)", () => {
  expect(calculateCategoryStatus({ gastado_ars: 999999, budget_ars: 0 })).toBe("OK");
});

test("OK when < 80% of budget", () => {
  expect(calculateCategoryStatus({ gastado_ars: 70000, budget_ars: 100000 })).toBe("OK");
});

test("WARNING when >= 80% and < 100%", () => {
  expect(calculateCategoryStatus({ gastado_ars: 85000, budget_ars: 100000 })).toBe("WARNING");
});

test("CLOSED when >= 100%", () => {
  expect(calculateCategoryStatus({ gastado_ars: 100000, budget_ars: 100000 })).toBe("CLOSED");
});
