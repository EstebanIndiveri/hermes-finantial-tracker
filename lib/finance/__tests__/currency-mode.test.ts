import {
  canChangeCurrencyMode,
  getCurrencyModeContract,
  LEGACY_CURRENCY_MODE,
} from "../currency-mode";

describe("monthly group currency policy", () => {
  test("historical months preserve USD accounting and ARS movements/category limits", () => {
    expect(LEGACY_CURRENCY_MODE).toBe("USD_ARS");
    expect(getCurrencyModeContract(LEGACY_CURRENCY_MODE)).toEqual({
      mode: "USD_ARS",
      accountingCurrency: "USD",
      movementCurrency: "ARS",
      categoryBudgetCurrency: "ARS",
      requiresExchangeRate: true,
    });
  });

  test("ARS-only months do not require a USD conversion", () => {
    expect(getCurrencyModeContract("ARS_ARS")).toEqual({
      mode: "ARS_ARS",
      accountingCurrency: "ARS",
      movementCurrency: "ARS",
      categoryBudgetCurrency: "ARS",
      requiresExchangeRate: false,
    });
  });

  test("any persisted movement freezes mode, even when later soft-deleted", () => {
    expect(canChangeCurrencyMode("USD_ARS", "ARS_ARS", false)).toBe(true);
    expect(canChangeCurrencyMode("ARS_ARS", "USD_ARS", false)).toBe(true);
    expect(canChangeCurrencyMode("USD_ARS", "ARS_ARS", true)).toBe(false);
    expect(canChangeCurrencyMode("ARS_ARS", "USD_ARS", true)).toBe(false);
    expect(canChangeCurrencyMode("ARS_ARS", "ARS_ARS", true)).toBe(true);
  });
});
