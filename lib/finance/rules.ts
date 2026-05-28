export type MonthStatus = "GREEN" | "YELLOW" | "RED";
export type CategoryStatus = "OK" | "WARNING" | "CLOSED";

interface MonthStatusInput {
  income_usd: number;
  total_spent_usd: number;
  saving_goal_usd: number;
  saving_goal_yellow: number;
}

export function calculateMonthStatus(input: MonthStatusInput): MonthStatus {
  const ahorro = input.income_usd - input.total_spent_usd;
  if (ahorro >= input.saving_goal_usd) return "GREEN";
  if (ahorro >= input.saving_goal_yellow) return "YELLOW";
  return "RED";
}

interface CategoryStatusInput {
  gastado_ars: number;
  budget_ars: number;
}

export function calculateCategoryStatus(input: CategoryStatusInput): CategoryStatus {
  const { gastado_ars, budget_ars } = input;
  if (budget_ars === 0) return "OK";
  const pct = (gastado_ars / budget_ars) * 100;
  if (pct >= 100) return "CLOSED";
  if (pct >= 80) return "WARNING";
  return "OK";
}
