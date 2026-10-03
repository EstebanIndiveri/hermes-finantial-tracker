import type { CurrencyMode } from "./currency-mode";

type TransactionBase = Readonly<{
  kind: "income" | "expense";
  categorySlug: string;
  amountArs: number;
}>;

export type UsdArsProjectionInput = Readonly<{
  mode: "USD_ARS";
  configuredIncome: number;
  savingGoal: number;
  transactions: readonly (TransactionBase & Readonly<{ amountUsd: number }>)[];
}>;

export type ArsArsProjectionInput = Readonly<{
  mode: "ARS_ARS";
  configuredIncome: number;
  savingGoal: number;
  // USD values and exchange rates are intentionally absent in ARS-only months.
  transactions: readonly (TransactionBase & Readonly<{ amountUsd?: never }>)[];
}>;

export type MonthProjectionInput = UsdArsProjectionInput | ArsArsProjectionInput;

type MonthProjectionBase = Readonly<{
  mode: CurrencyMode;
  accountingCurrency: "USD" | "ARS";
  configuredIncome: number;
  extraIncome: number;
  effectiveIncome: number;
  totalExpenses: number;
  projectedSavings: number;
  savingGoal: number;
  /** ARS spent by category; income-category rows are excluded. */
  categoryExpensesArs: Readonly<Record<string, number>>;
}>;

export type MonthProjection =
  | (MonthProjectionBase & Readonly<{ mode: "USD_ARS"; accountingCurrency: "USD" }>)
  | (MonthProjectionBase & Readonly<{ mode: "ARS_ARS"; accountingCurrency: "ARS" }>);

/**
 * Projects one month using the amounts persisted for that month's currency mode.
 * USD_ARS amounts are already converted and persisted in USD; ARS_ARS never
 * reads, derives, or fabricates a USD amount or exchange rate.
 */
export function projectMonth(input: MonthProjectionInput): MonthProjection {
  const categoryExpensesArs: Record<string, number> = {};
  let extraIncome = 0;
  let totalExpenses = 0;

  const addTransaction = (transaction: TransactionBase, accountingAmount: number) => {
    if (transaction.kind === "income") {
      extraIncome += accountingAmount;
      return;
    }

    totalExpenses += accountingAmount;
    categoryExpensesArs[transaction.categorySlug] =
      (categoryExpensesArs[transaction.categorySlug] ?? 0) + transaction.amountArs;
  };

  if (input.mode === "USD_ARS") {
    for (const transaction of input.transactions) {
      addTransaction(transaction, transaction.amountUsd);
    }
  } else {
    for (const transaction of input.transactions) {
      addTransaction(transaction, transaction.amountArs);
    }
  }

  const effectiveIncome = input.configuredIncome + extraIncome;
  const projectedSavings = effectiveIncome - totalExpenses;

  const projection = {
    configuredIncome: input.configuredIncome,
    extraIncome,
    effectiveIncome,
    totalExpenses,
    projectedSavings,
    savingGoal: input.savingGoal,
    categoryExpensesArs,
  };

  if (input.mode === "USD_ARS") {
    return { ...projection, mode: input.mode, accountingCurrency: "USD" };
  }
  return { ...projection, mode: input.mode, accountingCurrency: "ARS" };
}
