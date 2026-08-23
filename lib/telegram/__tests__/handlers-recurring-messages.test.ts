jest.mock("@/lib/db/client", () => ({
  db: {},
}));

jest.mock("@/lib/finance/summaries", () => ({
  getMonthSummary: jest.fn(),
  getCategoryBreakdown: jest.fn(),
}));

jest.mock("../ocr", () => ({
  ocrTelegramPhoto: jest.fn(),
  ocrTelegramDocument: jest.fn(),
}));

jest.mock("@/lib/ai/parse-receipt", () => ({
  parseReceiptText: jest.fn(),
}));

jest.mock("@/lib/ai/parse-message", () => ({
  parseFinancialMessage: jest.fn(),
}));

jest.mock("../send-message", () => ({
  sendTelegramMessage: jest.fn(),
  buildPersonalKeyboard: jest.fn((inline_keyboard: Array<Array<{ text: string; callback_data: string }>>) => ({
    inline_keyboard,
  })),
}));

jest.mock("../splits/conversation-state", () => ({
  setConversationState: jest.fn(),
  clearConversationState: jest.fn(),
}));

jest.mock("@/lib/reimbursements/requests", () => ({
  getReimbursementsByUser: jest.fn(),
  getOpenGroupReimbursements: jest.fn(),
}));

jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
  isAdminOrAbove: jest.fn(),
}));

jest.mock("@/lib/recurring/suggestions", () => ({
  findSuggestionByName: jest.fn(),
  RECURRING_SUGGESTIONS: {},
}));

jest.mock("@/lib/db/recurring-queries", () => ({
  getUserRecurringExpenses: jest.fn(),
  createRecurringExpense: jest.fn(),
  findRecurringByName: jest.fn(),
  toggleRecurringExpense: jest.fn(),
  getPendingExecutions: jest.fn(),
  confirmExecution: jest.fn(),
  skipExecution: jest.fn(),
  getRecurringStats: jest.fn(),
  createMonthlyExecutions: jest.fn(),
}));

jest.mock("@/lib/utils/dates", () => ({
  getActiveMonthArgentina: jest.fn(() => "2026-08"),
  getArgentinaDate: jest.fn(() => new Date("2026-08-18T03:00:00.000Z")),
}));

import { handleTelegramMessage } from "../handlers";
import { parseFinancialMessage } from "@/lib/ai/parse-message";
import {
  createMonthlyExecutions,
  getPendingExecutions,
  getRecurringStats,
  getUserRecurringExpenses,
} from "@/lib/db/recurring-queries";

const mockParseFinancialMessage = parseFinancialMessage as jest.MockedFunction<typeof parseFinancialMessage>;
const mockGetUserRecurringExpenses = getUserRecurringExpenses as jest.MockedFunction<typeof getUserRecurringExpenses>;
const mockGetPendingExecutions = getPendingExecutions as jest.MockedFunction<typeof getPendingExecutions>;
const mockGetRecurringStats = getRecurringStats as jest.MockedFunction<typeof getRecurringStats>;
const mockCreateMonthlyExecutions = createMonthlyExecutions as jest.MockedFunction<typeof createMonthlyExecutions>;

describe("telegram recurring messages", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, GROQ_API_KEY: "test-key" };
    mockGetRecurringStats.mockResolvedValue({
      totalMonthly: 20000,
      totalActive: 1,
      totalPaused: 1,
      pendingThisMonth: 3,
      confirmedThisMonth: 0,
      skippedThisMonth: 0,
      byCategory: [],
    });
    mockCreateMonthlyExecutions.mockResolvedValue([]);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("shows active and paused recurring expenses with status badges and payment day", async () => {
    mockParseFinancialMessage.mockResolvedValue({
      intent: "list_recurring",
      confidence: 0.95,
      needs_confirmation: false,
      requires_reimbursement: false,
    });
    mockGetUserRecurringExpenses.mockResolvedValue([
      {
        id: "rec-1",
        userId: "user-1",
        groupId: "group-1",
        name: "Netflix",
        amountArs: 12000,
        categoryId: "cat-1",
        merchant: null,
        frequency: "monthly",
        dayOfMonth: 5,
        isActive: true,
        autoConfirm: false,
        notes: null,
        createdAt: 1,
        updatedAt: 1,
        category: { id: "cat-1", name: "Streaming", emoji: "📺", slug: "streaming" },
      },
      {
        id: "rec-2",
        userId: "user-1",
        groupId: "group-1",
        name: "Gym",
        amountArs: 8000,
        categoryId: "cat-2",
        merchant: null,
        frequency: "monthly",
        dayOfMonth: 15,
        isActive: false,
        autoConfirm: false,
        notes: null,
        createdAt: 1,
        updatedAt: 1,
        category: { id: "cat-2", name: "Salud", emoji: "🏋️", slug: "salud" },
      },
    ]);

    const response = await handleTelegramMessage(
      {
        update_id: 1,
        message: {
          text: "/recurrentes",
          chat: { id: 10 },
          from: { id: 20 },
        },
      },
      "user-1",
      "group-1",
    );

    expect(response.text).toContain("🟢 📺 Netflix - $12.000 (día 5)");
    expect(response.text).toContain("⏸️ 🏋️ <s>Gym</s> - $8.000 (día 15)");
  });

  it("shows pending recurring executions with due status badges", async () => {
    mockParseFinancialMessage.mockResolvedValue({
      intent: "pending_recurring",
      confidence: 0.95,
      needs_confirmation: false,
      requires_reimbursement: false,
    });
    mockGetUserRecurringExpenses.mockResolvedValue([]);
    mockGetPendingExecutions.mockResolvedValue([
      {
        id: "exec-1",
        recurringExpenseId: "rec-1",
        transactionId: null,
        scheduledDate: "2026-08-20",
        executedAt: null,
        status: "pending",
        amountArs: 10000,
        createdAt: 1,
        recurringExpense: {
          id: "rec-1",
          name: "Internet",
          amountArs: 10000,
          merchant: null,
          category: { id: "cat-1", name: "Servicios", emoji: "🌐", slug: "servicios" },
        },
      },
      {
        id: "exec-2",
        recurringExpenseId: "rec-2",
        transactionId: null,
        scheduledDate: "2026-08-18",
        executedAt: null,
        status: "pending",
        amountArs: 20000,
        createdAt: 1,
        recurringExpense: {
          id: "rec-2",
          name: "Alquiler",
          amountArs: 20000,
          merchant: null,
          category: { id: "cat-2", name: "Vivienda", emoji: "🏠", slug: "vivienda" },
        },
      },
      {
        id: "exec-3",
        recurringExpenseId: "rec-3",
        transactionId: null,
        scheduledDate: "2026-08-15",
        executedAt: null,
        status: "pending",
        amountArs: 5000,
        createdAt: 1,
        recurringExpense: {
          id: "rec-3",
          name: "Spotify",
          amountArs: 5000,
          merchant: null,
          category: { id: "cat-3", name: "Streaming", emoji: "🎵", slug: "streaming" },
        },
      },
    ]);

    const response = await handleTelegramMessage(
      {
        update_id: 1,
        message: {
          text: "pendientes",
          chat: { id: 10 },
          from: { id: 20 },
        },
      },
      "user-1",
      "group-1",
    );

    expect(response.text).toContain("⏳ Pendiente • vence 20/08");
    expect(response.text).toContain("⚠️ Vence hoy • vence 18/08");
    expect(response.text).toContain("🚨 Vencido (3 días) • vencía 15/08");
    expect(response.text).toContain("🌐 Internet - $10.000");
    expect(response.text).toContain("🏠 Alquiler - $20.000");
    expect(response.text).toContain("🎵 Spotify - $5.000");
  });
});
