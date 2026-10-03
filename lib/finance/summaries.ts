import { db } from "@/lib/db/client";
import { transactions, budgets, monthly_settings, categories } from "@/lib/db/schema";
import { eq, and, sum, count } from "drizzle-orm";
import { calculateMonthStatus, calculateCategoryStatus } from "./rules";
import { splitIncomeAndExpenses, isIncomeCategory } from "./income";
import { projectMonth, type MonthProjection } from "./month-projection";

/**
 * Mode-aware financial projection for a group/month. Unlike the legacy USD
 * summary, this never converts an ARS-only month or treats missing USD as zero.
 * Incomplete or cross-mode rows fail closed until corrected explicitly.
 */
export async function getAccountingMonthProjection(groupId: string, month: string): Promise<MonthProjection | null> {
  const settings = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
  });
  if (!settings) return null;
  const mode = settings.currency_mode ?? "USD_ARS";
  if (mode !== "USD_ARS" && mode !== "ARS_ARS") return null;
  if (mode === "ARS_ARS" && process.env.ACT05_ARS_MODE_ENABLED !== "true") return null;

  const rows = await db.select({
    amountArs: transactions.amount_ars,
    amountUsd: transactions.amount_usd,
    exchangeRateSnapshot: transactions.exchange_rate_snapshot,
    transactionMode: transactions.currency_mode,
    categorySlug: categories.slug,
    categoryGroupId: categories.group_id,
  }).from(transactions).leftJoin(categories, eq(transactions.category_id, categories.id)).where(and(
    eq(transactions.group_id, groupId),
    eq(transactions.month, month),
    eq(transactions.status, "active"),
  ));

  if (rows.some((row) =>
    row.categoryGroupId !== groupId || row.categorySlug == null || row.transactionMode !== mode ||
    !Number.isFinite(row.amountArs) || row.amountArs <= 0 ||
    (mode === "USD_ARS" && (row.amountUsd == null || !Number.isFinite(row.amountUsd))) ||
    (mode === "ARS_ARS" && (row.amountUsd != null || row.exchangeRateSnapshot != null))
  )) return null;

  if (mode === "ARS_ARS") {
    if (settings.income_ars == null || !Number.isFinite(settings.income_ars) ||
      settings.saving_goal_ars == null || !Number.isFinite(settings.saving_goal_ars)) return null;
    return projectMonth({
      mode,
      configuredIncome: settings.income_ars,
      savingGoal: settings.saving_goal_ars,
      transactions: rows.map((row) => ({
        kind: isIncomeCategory(row.categorySlug) ? "income" as const : "expense" as const,
        categorySlug: row.categorySlug!,
        amountArs: row.amountArs,
      })),
    });
  }

  if (settings.income_usd == null || !Number.isFinite(settings.income_usd) ||
    settings.saving_goal_usd == null || !Number.isFinite(settings.saving_goal_usd) ||
    settings.exchange_rate == null || !Number.isFinite(settings.exchange_rate) ||
    settings.exchange_rate <= 0) return null;
  return projectMonth({
    mode,
    configuredIncome: settings.income_usd,
    savingGoal: settings.saving_goal_usd,
    transactions: rows.map((row) => ({
      kind: isIncomeCategory(row.categorySlug) ? "income" as const : "expense" as const,
      categorySlug: row.categorySlug!,
      amountArs: row.amountArs,
      amountUsd: row.amountUsd!,
    })),
  });
}

export async function getMonthSummary(groupId: string, month: string) {
  const settings = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
  });
  if (!settings) return null;

  // This projection is explicitly USD-based. Until its callers understand both
  // modes, never run it for ARS-only settings or incomplete USD configuration.
  if (
    settings.currency_mode === "ARS_ARS" ||
    settings.income_usd == null ||
    settings.exchange_rate == null ||
    settings.exchange_rate <= 0 ||
    settings.saving_goal_usd == null ||
    settings.saving_goal_yellow == null
  ) return null;

  // Aggregate spend per category slug so income transactions can be separated
  // from real expenses (income must ADD to savings, not be subtracted).
  const rows = await db
    .select({
      slug: categories.slug,
      total: sum(transactions.amount_usd),
      transactionCount: count(transactions.id),
      usdAmountCount: count(transactions.amount_usd),
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.category_id, categories.id))
    .where(and(
      eq(transactions.group_id, groupId),
      eq(transactions.month, month),
      eq(transactions.status, "active"),
    ))
    .groupBy(categories.slug);

  // A NULL aggregate means at least one USD amount is missing. Do not silently
  // turn that into zero and publish a misleading balance.
  if (rows.some((row) =>
    row.total == null ||
    !Number.isFinite(Number(row.total)) ||
    row.transactionCount !== row.usdAmountCount
  )) return null;

  const { expense: total_spent_usd, income: extra_income_usd } = splitIncomeAndExpenses(
    rows.map((r) => ({ slug: r.slug, amount: Number(r.total) })),
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
