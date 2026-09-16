/**
 * Slug of the built-in category that represents money coming IN (income),
 * not money going OUT (expense). Transactions in this category must ADD to the
 * projected savings / balance instead of being subtracted like a normal spend.
 */
export const INCOME_CATEGORY_SLUG = "ingresos";

/** True when the given category slug represents income rather than an expense. */
export function isIncomeCategory(slug: string | null | undefined): boolean {
  return slug === INCOME_CATEGORY_SLUG;
}

export interface CategoryAmount {
  slug: string;
  amount: number;
}

export interface IncomeExpenseSplit {
  /** Sum of real expense transactions (everything except the income category). */
  expense: number;
  /** Sum of income transactions (the income category). */
  income: number;
}

/**
 * Splits a list of per-category amounts into expenses and income, so income is
 * never counted as spend. Pure and side-effect free for straightforward testing.
 *
 * @param rows - Per-category amounts (already aggregated by category slug).
 * @returns The expense total and the income total.
 */
export function splitIncomeAndExpenses(rows: CategoryAmount[]): IncomeExpenseSplit {
  let expense = 0;
  let income = 0;
  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    if (isIncomeCategory(row.slug)) {
      income += amount;
    } else {
      expense += amount;
    }
  }
  return { expense, income };
}
