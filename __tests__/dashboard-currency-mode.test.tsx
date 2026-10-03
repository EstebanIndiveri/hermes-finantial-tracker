import { renderToStaticMarkup } from "react-dom/server";
import DashboardPage from "@/app/dashboard/(main)/page";
import { getAccountingMonthProjection, getCategoryBreakdown, getMonthSummary } from "@/lib/finance/summaries";
import { db } from "@/lib/db/client";

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue({
    get: jest.fn((name: string) => name === "x-user-id" ? "user-1" : name === "x-group-id" ? "group-1" : null),
  }),
}));
jest.mock("@/lib/finance/summaries", () => ({
  getAccountingMonthProjection: jest.fn(),
  getCategoryBreakdown: jest.fn(),
  getMonthSummary: jest.fn(),
}));
jest.mock("@/lib/db/client", () => ({
  db: { query: {
    monthly_settings: { findFirst: jest.fn() },
    transactions: { findMany: jest.fn() },
  } },
}));
jest.mock("@/lib/utils/dates", () => ({ getActiveMonthArgentina: () => "2026-10" }));
jest.mock("@/components/forms/HermesExpenseForm", () => ({ HermesExpenseForm: () => null }));
jest.mock("@/components/dashboard/SpendingChart", () => ({ SpendingChart: () => null }));
jest.mock("@/components/dashboard/CategoryDonut", () => ({ CategoryDonut: () => null }));
jest.mock("@/components/dashboard/MonthSelector", () => ({ MonthSelector: () => null }));
jest.mock("@/components/dashboard/TransactionList", () => ({ TransactionList: () => null }));
jest.mock("@/components/dashboard/ExportPanel", () => ({ ExportPanel: () => null }));

const settingsLookup = db.query.monthly_settings.findFirst as jest.Mock;
const transactionsLookup = db.query.transactions.findMany as jest.Mock;
const projectionLookup = getAccountingMonthProjection as jest.MockedFunction<typeof getAccountingMonthProjection>;
const categoryLookup = getCategoryBreakdown as jest.MockedFunction<typeof getCategoryBreakdown>;
const legacySummaryLookup = getMonthSummary as jest.MockedFunction<typeof getMonthSummary>;

async function renderDashboard(): Promise<string> {
  return renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({ month: "2026-10" }) }));
}

describe("dashboard accounting currency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    categoryLookup.mockResolvedValue([]);
    transactionsLookup.mockResolvedValue([]);
  });

  afterAll(() => { delete process.env.ACT05_ARS_MODE_ENABLED; });

  it("renders ARS-only income, saving goal and status without a false FX warning", async () => {
    settingsLookup.mockResolvedValue({ currency_mode: "ARS_ARS", saving_goal_yellow_ars: 70000 });
    projectionLookup.mockResolvedValue({
      mode: "ARS_ARS", accountingCurrency: "ARS", configuredIncome: 100000,
      extraIncome: 0, effectiveIncome: 100000, totalExpenses: 25000,
      projectedSavings: 75000, savingGoal: 80000, categoryExpensesArs: {},
    });

    const markup = await renderDashboard();

    expect(markup).toContain("Estado amarillo");
    expect(markup).toContain("ARS 75.000");
    expect(markup).toContain("meta: ARS 80.000");
    expect(markup).toContain("ARS 100.000");
    expect(markup).toContain("octubre de 2026");
    expect(markup).not.toContain("USD");
    expect(markup).not.toContain("Tipo de cambio ingresado manualmente");
    expect(legacySummaryLookup).not.toHaveBeenCalled();
  });

  it("does not present a missing ARS projection as zero savings", async () => {
    settingsLookup.mockResolvedValue({ currency_mode: "ARS_ARS", saving_goal_yellow_ars: 70000 });
    projectionLookup.mockResolvedValue(null);

    const markup = await renderDashboard();

    expect(markup).toContain("Datos contables no disponibles");
    expect(markup).not.toContain("USD 0");
    expect(markup).not.toContain("ARS 0");
    expect(markup).not.toContain("Tipo de cambio ingresado manualmente");
    expect(markup).toContain("El registro está pausado");
  });

  it("keeps an ARS-only month unavailable while its flag is off", async () => {
    process.env.ACT05_ARS_MODE_ENABLED = "false";
    settingsLookup.mockResolvedValue({ currency_mode: "ARS_ARS", saving_goal_yellow_ars: 70000 });

    const markup = await renderDashboard();

    expect(markup).toContain("Datos contables no disponibles");
    expect(projectionLookup).not.toHaveBeenCalled();
    expect(legacySummaryLookup).not.toHaveBeenCalled();
  });

  it("preserves mixed-mode USD income and saving labels", async () => {
    settingsLookup.mockResolvedValue({ currency_mode: "USD_ARS" });
    legacySummaryLookup.mockResolvedValue({
      income_usd: 1000, ahorro_proyectado_usd: 900, saving_goal_usd: 800,
      status: "GREEN", exchange_rate: 1600, exchange_rate_source: "manual",
    } as Awaited<ReturnType<typeof getMonthSummary>>);

    const markup = await renderDashboard();

    expect(markup).toContain("USD 900");
    expect(markup).toContain("meta: USD 800");
    expect(markup).toContain("Tipo de cambio ingresado manualmente");
    expect(projectionLookup).not.toHaveBeenCalled();
  });
});
