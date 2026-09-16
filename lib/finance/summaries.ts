import { db } from "@/lib/db/client";
import { transactions, budgets, monthly_settings, categories } from "@/lib/db/schema";
import { eq, and, sum } from "drizzle-orm";
import { calculateMonthStatus, calculateCategoryStatus } from "./rules";
import { splitIncomeAndExpenses, isIncomeCategory } from "./income";

export async function getMonthSummary(groupId: string, month: string) {
  const settings = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
  });
  if (!settings) return null;

  // Aggregate spend per category slug so income transactions can be separated
  // from real expenses (income must ADD to savings, not be subtracted).
  const rows = await db
    .select({ slug: categories.slug, total: sum(transactions.amount_usd) })
    .from(transactions)
    .innerJoin(categories, eq(transactions.category_id, categories.id))
    .where(and(
      eq(transactions.group_id, groupId),
      eq(transactions.month, month),
      eq(transactions.status, "active"),
    ))
    .groupBy(categories.slug);

  const { expense: total_spent_usd, income: extra_income_usd } = splitIncomeAndExpenses(
    rows.map((r) => ({ slug: r.slug, amount: Number(r.total ?? 0) })),
  );

  // Effective income = configured monthly income + income registered as transactions.
  const income_usd = settings.income_usd + extra_income_usd;
  const ahorro_proyectado_usd = income_usd - total_spent_usd;
  const status = calculateMonthStatus({
    income_usd,
    total_spent_usd,
    saving_goal_usd: settings.saving_goal_usd,
    saving_goal_yellow: settings.saving_goal_yellow,
  });

  return {
    income_usd,
    configured_income_usd: settings.income_usd,
    extra_income_usd,
    total_spent_usd,
    ahorro_proyectado_usd,
    exchange_rate: settings.exchange_rate,
    exchange_rate_source: settings.exchange_rate_source,
    exchange_rate_updated_at: settings.exchange_rate_updated_at,
    saving_goal_usd: settings.saving_goal_usd,
    saving_goal_yellow: settings.saving_goal_yellow,
    status,
  };
}

export async function getCategoryBreakdown(groupId: string, month: string) {
  const allCats = await db.query.categories.findMany({
    where: eq(categories.group_id, groupId),
    orderBy: (c, { asc }) => asc(c.sort_order),
  });

  const budgetRows = await db.query.budgets.findMany({
    where: and(eq(budgets.group_id, groupId), eq(budgets.month, month)),
  });
  const budgetMap = Object.fromEntries(budgetRows.map(b => [b.category_id, b]));

  const spentRows = await db
    .select({ category_id: transactions.category_id, total: sum(transactions.amount_ars) })
    .from(transactions)
    .where(and(
      eq(transactions.group_id, groupId),
      eq(transactions.month, month),
      eq(transactions.status, "active"),
    ))
    .groupBy(transactions.category_id);
  const spentMap = Object.fromEntries(spentRows.map(r => [r.category_id, Number(r.total ?? 0)]));

  return allCats.map(cat => {
    const budget = budgetMap[cat.id];
    const budget_ars = budget?.budget_ars ?? 0;
    const hard_limit = budget?.hard_limit ?? 1;
    const gastado_ars = spentMap[cat.id] ?? 0;
    const is_income = isIncomeCategory(cat.slug);
    const disponible_ars = budget_ars > 0 ? Math.max(0, budget_ars - gastado_ars) : null;
    // Income categories are never "over budget" — they represent money coming in.
    const status = is_income ? "OK" : calculateCategoryStatus({ gastado_ars, budget_ars });
    return { id: cat.id, slug: cat.slug, name: cat.name, emoji: cat.emoji, budget_ars, hard_limit, gastado_ars, disponible_ars, status, is_income };
  });
}
