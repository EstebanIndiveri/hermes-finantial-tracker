/** Currency policy for one group and one accounting month. */
export type CurrencyMode = "USD_ARS" | "ARS_ARS";

// Historical rows have no mode column and must retain their existing meaning.
export const LEGACY_CURRENCY_MODE: CurrencyMode = "USD_ARS";

export type CurrencyModeContract = Readonly<{
  mode: CurrencyMode;
  accountingCurrency: "USD" | "ARS";
  movementCurrency: "ARS";
  categoryBudgetCurrency: "ARS";
  requiresExchangeRate: boolean;
}>;

export function getCurrencyModeContract(mode: CurrencyMode): CurrencyModeContract {
  switch (mode) {
    case "USD_ARS":
      return {
        mode,
        accountingCurrency: "USD",
        movementCurrency: "ARS",
        categoryBudgetCurrency: "ARS",
        requiresExchangeRate: true,
      };
    case "ARS_ARS":
      return {
        mode,
        accountingCurrency: "ARS",
        movementCurrency: "ARS",
        categoryBudgetCurrency: "ARS",
        requiresExchangeRate: false,
      };
  }
}

/** A mode is immutable once its group/month has any movement, including a deleted one. */
export function canChangeCurrencyMode(
  currentMode: CurrencyMode,
  nextMode: CurrencyMode,
  hasAnyMovement: boolean,
): boolean {
  return currentMode === nextMode || !hasAnyMovement;
}
