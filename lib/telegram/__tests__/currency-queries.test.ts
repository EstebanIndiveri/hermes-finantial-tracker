import { handleTelegramMessage } from "../handlers";
import { db } from "@/lib/db/client";
import { getAccountingMonthProjection, getCategoryBreakdown, getMonthSummary } from "@/lib/finance/summaries";
import { parseFinancialMessage } from "@/lib/ai/parse-message";
import type { ParsedMessage } from "@/lib/ai/parse-message";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      monthly_settings: { findFirst: jest.fn() },
      categories: { findFirst: jest.fn(), findMany: jest.fn() },
    },
  },
}));

jest.mock("@/lib/finance/summaries", () => ({
  getAccountingMonthProjection: jest.fn(),
  getCategoryBreakdown: jest.fn(),
  getMonthSummary: jest.fn(),
}));

jest.mock("@/lib/utils/dates", () => ({ getActiveMonthArgentina: jest.fn(() => "2026-10") }));
jest.mock("@/lib/ai/parse-message", () => ({ parseFinancialMessage: jest.fn() }));

const mockDb = db as unknown as {
  query: {
    monthly_settings: { findFirst: jest.Mock };
    categories: { findFirst: jest.Mock; findMany: jest.Mock };
  };
};
const mockProjection = getAccountingMonthProjection as jest.MockedFunction<typeof getAccountingMonthProjection>;
const mockBreakdown = getCategoryBreakdown as jest.MockedFunction<typeof getCategoryBreakdown>;
const mockUsdSummary = getMonthSummary as jest.MockedFunction<typeof getMonthSummary>;
const mockParser = parseFinancialMessage as jest.MockedFunction<typeof parseFinancialMessage>;

const category = {
  id: "category-super",
  slug: "supermercado",
  name: "Supermercado",
  emoji: "🛒",
  budget_ars: 30000,
  gastado_ars: 12000,
  disponible_ars: 18000,
  status: "OK",
};

function queryResult(intent: ParsedMessage["intent"], fields: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    intent,
    confidence: 0.95,
    needs_confirmation: false,
    requires_reimbursement: false,
    ...fields,
  };
}

function message(text: string) {
  return handleTelegramMessage({
    update_id: 1,
    message: { text, chat: { id: 123 }, from: { id: 456 } },
  }, "user-1", "group-1");
}

describe("Telegram queries in ARS_ARS mode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    process.env.GROQ_API_KEY = "test-key";
    mockDb.query.monthly_settings.findFirst.mockResolvedValue({
      currency_mode: "ARS_ARS",
      saving_goal_yellow_ars: 5000,
    });
    mockProjection.mockResolvedValue({
      mode: "ARS_ARS",
      accountingCurrency: "ARS",
      configuredIncome: 50000,
      extraIncome: 0,
      effectiveIncome: 50000,
      totalExpenses: 12000,
      projectedSavings: 38000,
      savingGoal: 10000,
      categoryExpensesArs: { supermercado: 12000 },
    });
    mockBreakdown.mockResolvedValue([category]);
    mockDb.query.categories.findFirst.mockResolvedValue(category);
    mockUsdSummary.mockResolvedValue(null);
  });

  afterAll(() => {
    delete process.env.ACT05_ARS_MODE_ENABLED;
    delete process.env.GROQ_API_KEY;
  });

  it("returns the monthly summary in ARS for /resumen and a natural-language summary", async () => {
    const command = await message("/resumen");
    expect(command.text).toContain("Ingreso: ARS");
    expect(command.text).toContain("Ahorro proyectado: ARS");
    expect(command.text).not.toContain("USD");
    expect(command.text).not.toContain("Tipo de cambio");

    mockParser.mockResolvedValue(queryResult("query_summary"));
    const natural = await message("dame el resumen del mes");
    expect(natural.text).toContain("Ingreso: ARS");
    expect(natural.text).not.toContain("USD");
    expect(mockUsdSummary).not.toHaveBeenCalled();
  });

  it("returns category availability in ARS for /disponible and natural language", async () => {
    const command = await message("/disponible supermercado");
    expect(command.text).toContain("Presupuesto: ARS");
    expect(command.text).toContain("Gastado: ARS");

    mockParser.mockResolvedValue(queryResult("query_available", { category: "supermercado" }));
    const natural = await message("cuanto me queda en supermercado");
    expect(natural.text).toContain("Disponible: ARS");
  });

  it("simulates spending in ARS for /puedo and natural language using the configured yellow threshold", async () => {
    const command = await message("/puedo 5000 supermercado");
    expect(command.text).toContain("¿Podés gastar ARS");
    expect(command.text).toContain("Antes: ARS");
    expect(command.text).not.toContain("USD");

    mockParser.mockResolvedValue(queryResult("simulate_expense", {
      amount_ars: 5000,
      category: "supermercado",
    }));
    const natural = await message("puedo gastar 5000 en supermercado");
    expect(natural.text).toContain("Meta: ARS");
    expect(natural.text).not.toContain("USD");
  });

  it("uses the configured ARS yellow threshold rather than half the goal", async () => {
    mockDb.query.monthly_settings.findFirst.mockResolvedValue({
      currency_mode: "ARS_ARS", saving_goal_yellow_ars: 8000,
    });
    mockProjection.mockResolvedValue({
      mode: "ARS_ARS", accountingCurrency: "ARS", configuredIncome: 20000,
      extraIncome: 0, effectiveIncome: 20000, totalExpenses: 8000,
      projectedSavings: 12000, savingGoal: 10000,
      categoryExpensesArs: { supermercado: 8000 },
    });

    const response = await message("/puedo 5000 supermercado");

    expect(response.text).toContain("pondría tu ahorro en rojo");
    expect(response.text).not.toContain("USD");
  });

  it("fails closed when ARS mode is disabled for command and parsed queries", async () => {
    process.env.ACT05_ARS_MODE_ENABLED = "false";
    const command = await message("/resumen");
    expect(command.text).toContain("modo ARS está desactivado");
    expect(mockProjection).not.toHaveBeenCalled();

    mockParser.mockResolvedValue(queryResult("query_summary"));
    const natural = await message("dame el resumen del mes");
    expect(natural.text).toContain("modo ARS está desactivado");
    expect(mockUsdSummary).not.toHaveBeenCalled();
  });
});
