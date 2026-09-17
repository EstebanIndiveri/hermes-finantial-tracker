import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ExportPanel } from "@/components/dashboard/ExportPanel";
import DashboardPage from "@/app/dashboard/(main)/page";

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue({
    get: jest.fn((name: string) => (name === "x-user-id" ? "user-1" : null)),
  }),
}));

jest.mock("@/lib/finance/summaries", () => ({
  getMonthSummary: jest.fn().mockResolvedValue({
    income_usd: 0,
    exchange_rate: 1,
    ahorro_proyectado_usd: 0,
    saving_goal_usd: 0,
    status: "GREEN",
    exchange_rate_source: "manual",
  }),
  getCategoryBreakdown: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/db/client", () => ({
  db: { query: { transactions: { findMany: jest.fn().mockResolvedValue([]) } } },
}));

jest.mock("@/lib/utils/dates", () => ({
  getActiveMonthArgentina: () => "2026-05",
}));

jest.mock("@/components/forms/HermesExpenseForm", () => ({ HermesExpenseForm: () => null }));
jest.mock("@/components/dashboard/SpendingChart", () => ({ SpendingChart: () => null }));
jest.mock("@/components/dashboard/CategoryDonut", () => ({ CategoryDonut: () => null }));
jest.mock("@/components/dashboard/MonthSelector", () => ({ MonthSelector: () => null }));
jest.mock("@/components/dashboard/TransactionList", () => ({ TransactionList: () => null }));

describe("ExportPanel", () => {
  it("renders the selected month and export buttons", () => {
    const markup = renderToStaticMarkup(<ExportPanel month="2026-05" />);

    expect(markup).toContain("Exportar mes");
    expect(markup).toContain('type="month"');
    expect(markup).toContain('value="2026-05"');
    expect(markup).toContain('max="2026-05"');
    expect(markup).toContain("CSV");
    expect(markup).toContain("Excel");
    expect(markup).toContain("Descargar CSV");
    expect(markup).toContain("Descargar Excel");
  });
});

describe("export panel styles", () => {
  it("includes the export panel selectors and spinner animation", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "app/hermes.css"), "utf8");

    expect(css).toContain(".h-export-panel");
    expect(css).toContain(".h-export-month-input");
    expect(css).toContain(".h-export-btn-xl");
    expect(css).toContain("@keyframes h-spin");
  });
});

describe("dashboard export integration", () => {
  it("renders the export card for the selected dashboard month", async () => {
    const markup = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({ month: "2026-05" }) }));

    expect(markup).toContain("Exportar movimientos");
    expect(markup).toContain('value="2026-05"');
    expect(markup).toContain("Descargar CSV");
  });
});
