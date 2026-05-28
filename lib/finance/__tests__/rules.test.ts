import { calculateMonthStatus, calculateCategoryStatus } from "../rules";

test("GREEN when ahorro >= saving_goal_usd", () => {
  expect(calculateMonthStatus({ income_usd: 4814, total_spent_usd: 800, saving_goal_usd: 4000, saving_goal_yellow: 3800 })).toBe("GREEN");
});

test("YELLOW when ahorro >= saving_goal_yellow but < saving_goal_usd", () => {
  expect(calculateMonthStatus({ income_usd: 4814, total_spent_usd: 1014, saving_goal_usd: 4000, saving_goal_yellow: 3800 })).toBe("YELLOW");
});

test("RED when ahorro < saving_goal_yellow", () => {
  expect(calculateMonthStatus({ income_usd: 4814, total_spent_usd: 1200, saving_goal_usd: 4000, saving_goal_yellow: 3800 })).toBe("RED");
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
