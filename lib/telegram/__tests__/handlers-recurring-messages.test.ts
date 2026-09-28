jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      categories: { findFirst: jest.fn() },
      budgets: { findFirst: jest.fn() },
      monthly_settings: { findFirst: jest.fn() },
    },
    insert: jest.fn(() => ({
      values: jest.fn(() => ({ onConflictDoNothing: jest.fn().mockResolvedValue(undefined) })),
    })),
    select: jest.fn(),
    transaction: jest.fn(),
  },
}));

jest.mock("@/lib/telegram/financial-operation", () => ({
  runTelegramOperation: jest.fn(),
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
import { buildReceiptProposalMessage } from "../handlers";
import { handlePersonalCallback } from "../personal-callback-handler";
import { db } from "@/lib/db/client";
import { parseFinancialMessage } from "@/lib/ai/parse-message";
import { runTelegramOperation } from "@/lib/telegram/financial-operation";
import { createTelegramOperationContext } from "@/lib/telegram/operation-context";
import {
  confirmExecution,
  createMonthlyExecutions,
  getPendingExecutions,
  getRecurringStats,
  getUserRecurringExpenses,
  skipExecution,
} from "@/lib/db/recurring-queries";
import { setConversationState } from "../splits/conversation-state";

const mockParseFinancialMessage = parseFinancialMessage as jest.MockedFunction<typeof parseFinancialMessage>;
const mockConfirmExecution = confirmExecution as jest.MockedFunction<typeof confirmExecution>;
const mockGetUserRecurringExpenses = getUserRecurringExpenses as jest.MockedFunction<typeof getUserRecurringExpenses>;
const mockGetPendingExecutions = getPendingExecutions as jest.MockedFunction<typeof getPendingExecutions>;
const mockGetRecurringStats = getRecurringStats as jest.MockedFunction<typeof getRecurringStats>;
const mockCreateMonthlyExecutions = createMonthlyExecutions as jest.MockedFunction<typeof createMonthlyExecutions>;
const mockSkipExecution = skipExecution as jest.MockedFunction<typeof skipExecution>;
const mockDb = db as jest.Mocked<typeof db>;
const mockRunTelegramOperation = runTelegramOperation as jest.Mock;

const pendingExecution = {
  id: "exec-1",
  recurringExpenseId: "rec-1",
  transactionId: null,
  scheduledDate: "2026-08-20",
  executedAt: null,
  status: "pending" as const,
  amountArs: 10000,
  createdAt: 1,
  recurringExpense: {
    id: "rec-1",
    name: "Internet",
    amountArs: 10000,
    merchant: null,
    category: { id: "cat-1", name: "Servicios", emoji: "🌐", slug: "servicios" },
  },
};

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
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({
      id: "category-supermarket",
      name: "Supermercado",
      emoji: "🛒",
      slug: "supermercado",
    });
    (mockDb.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ exchange_rate: 1000 });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses the deterministic expense parser when Groq is unavailable", async () => {
    delete process.env.GROQ_API_KEY;

    const response = await handleTelegramMessage(
      {
        update_id: 987,
        message: {
          text: "Gasto de supermercado 1379",
          chat: { id: 10 },
          from: { id: 20 },
        },
      },
      "user-1",
      "group-1",
    );

    expect(response.text).toContain("$1.379");
    expect(response.text).toContain("Supermercado");
    expect(response.text).not.toContain("Por ahora usá el formato");
    expect(response.replyMarkup).toEqual({
      inline_keyboard: [
        [{ text: "💸 Sí, pedir reintegro", callback_data: "expense:confirm_reimbursement" }],
        [{ text: "✅ No, solo gasto", callback_data: "expense:confirm" }],
        [
          { text: "💰 Editar monto", callback_data: "expense:edit_amount" },
          { text: "📂 Editar categoría", callback_data: "expense:edit_category" },
        ],
        [
          { text: "🏪 Editar comercio", callback_data: "expense:edit_merchant" },
          { text: "❌ Cancelar", callback_data: "expense:cancel" },
        ],
      ],
    });
    expect(mockParseFinancialMessage).not.toHaveBeenCalled();
    expect(setConversationState).toHaveBeenCalledWith(
      "10",
      "20",
      expect.objectContaining({
        step: "expense_confirm",
        data: expect.objectContaining({
          category_id: "category-supermarket",
          amount_ars: 1379,
          user_id: "user-1",
          group_id: "group-1",
        }),
      }),
    );
  });

  it("does not claim a missing group category is available for /gasto", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({ where: jest.fn().mockResolvedValue([]) })),
    });

    const response = await handleTelegramMessage(
      {
        update_id: 988,
        message: {
          text: "/gasto 1379 supermercado",
          chat: { id: 10 },
          from: { id: 20 },
        },
      },
      "user-1",
      "group-1",
    );

    expect(response.text).toBe("Este grupo todavía no tiene categorías configuradas. Creá una desde la web y volvé a intentar.");
    expect(response.text).not.toContain("Categorías: supermercado");
  });

  it("routes /gasto through the shared draft and still waits for the user's choice", async () => {
    const response = await handleTelegramMessage({
      update_id: 989,
      message: { text: "/gasto 23971 supermercado Carrefour", chat: { id: 10 }, from: { id: 20 } },
    }, "user-1", "group-1");

    expect(response.text).toContain("¿Registramos este gasto?");
    expect(response.replyMarkup?.inline_keyboard?.slice(0, 2)).toEqual([
      [{ text: "💸 Sí, pedir reintegro", callback_data: "expense:confirm_reimbursement" }],
      [{ text: "✅ No, solo gasto", callback_data: "expense:confirm" }],
    ]);
    expect(setConversationState).toHaveBeenCalledWith("10", "20", expect.objectContaining({
      step: "expense_confirm",
      data: expect.objectContaining({ amount_ars: 23971, merchant: "Carrefour", requires_reimbursement: false }),
    }));
  });

  it("uses an income-specific confirmation without offering reimbursement", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({
      id: "category-income", name: "Ingresos", emoji: "💰", slug: "ingresos",
    });

    const response = await handleTelegramMessage({
      update_id: 991,
      message: { text: "/ingreso 300000 sueldo", chat: { id: 10 }, from: { id: 20 } },
    }, "user-1", "group-1");

    expect(response.text).toContain("¿Registramos este ingreso?");
    expect(response.replyMarkup?.inline_keyboard?.[0]).toEqual([
      { text: "✅ Registrar ingreso", callback_data: "expense:confirm" },
    ]);
    expect(response.replyMarkup?.inline_keyboard?.flat().some((button) => button.callback_data === "expense:confirm_reimbursement")).toBe(false);
  });

  it("creates the built-in income category on demand and asks before recording /ingreso", async () => {
    const incomeCategory = { id: "category-income", name: "Ingresos", emoji: "💵", slug: "ingresos" };
    (mockDb.query.categories.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(incomeCategory);

    const response = await handleTelegramMessage({
      update_id: 994,
      message: { text: "/ingreso 2000 sueldo", chat: { id: 10 }, from: { id: 20 } },
    }, "user-1", "group-1");

    expect(mockDb.insert).toHaveBeenCalled();
    const incomeInsert = mockDb.insert.mock.results[0]?.value;
    expect(incomeInsert.values).toHaveBeenCalledWith(expect.objectContaining({
      group_id: "group-1",
      slug: "ingresos",
      default_hard_limit: 0,
    }));
    expect(response.text).toContain("¿Registramos este ingreso?");
    expect(response.replyMarkup?.inline_keyboard?.[0]).toEqual([
      { text: "✅ Registrar ingreso", callback_data: "expense:confirm" },
    ]);
    expect(response.replyMarkup?.inline_keyboard?.flat().some((button) => button.callback_data.includes("reimbursement"))).toBe(false);
    expect(mockRunTelegramOperation).not.toHaveBeenCalled();
  });

  it("routes 'Ingreso 2000 sueldo' through the deterministic income path", async () => {
    const incomeCategory = { id: "category-income", name: "Ingresos", emoji: "💵", slug: "ingresos" };
    (mockDb.query.categories.findFirst as jest.Mock)
      .mockResolvedValue(incomeCategory)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(incomeCategory);

    const response = await handleTelegramMessage({
      update_id: 995,
      message: { text: "Ingreso 2000 sueldo", chat: { id: 10 }, from: { id: 20 } },
    }, "user-1", "group-1");

    expect(mockParseFinancialMessage).not.toHaveBeenCalled();
    expect(response.text).toContain("¿Registramos este ingreso?");
    expect(response.replyMarkup?.inline_keyboard?.[0]).toEqual([
      { text: "✅ Registrar ingreso", callback_data: "expense:confirm" },
    ]);
    expect(setConversationState).toHaveBeenCalledWith("10", "20", expect.objectContaining({
      step: "expense_confirm",
      data: expect.objectContaining({ amount_ars: 2000, is_income: true }),
    }));
    expect(mockRunTelegramOperation).not.toHaveBeenCalled();
  });

  it.each([
    ["Ticket con reintegro", "✅ Sí, pedir reintegro"],
    ["Ticket sin reintegro", "✅ Confirmar sin reintegro"],
  ])("uses the common reimbursement consent contract for receipt captions", (caption, expectedButton) => {
    const proposal = buildReceiptProposalMessage({
      amount_ars: 5000,
      categorySlug: "supermercado",
      categoryName: "Supermercado",
      categoryEmoji: "🛒",
      date: "2026-09-28",
      source: "ocr",
      caption,
    });

    const buttons = proposal.replyMarkup?.inline_keyboard?.flat() ?? [];
    expect(buttons.some((button) => button.text === expectedButton)).toBe(true);
    expect(buttons.some((button) => button.callback_data === "receipt:confirm")).toBe(true);
  });

  it("recognizes an unambiguous income in text without requiring Groq", async () => {
    delete process.env.GROQ_API_KEY;
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({
      id: "category-income", name: "Ingresos", emoji: "💰", slug: "ingresos",
    });

    const response = await handleTelegramMessage({
      update_id: 992,
      message: { text: "Cobré 300000 de sueldo", chat: { id: 10 }, from: { id: 20 } },
    }, "user-1", "group-1");

    expect(response.text).toContain("¿Registramos este ingreso?");
    expect(response.replyMarkup?.inline_keyboard?.[0]).toEqual([
      { text: "✅ Registrar ingreso", callback_data: "expense:confirm" },
    ]);
    expect(mockParseFinancialMessage).not.toHaveBeenCalled();
  });

  it("normalizes model intent but never persists an inferred reimbursement choice", async () => {
    mockParseFinancialMessage.mockResolvedValue({
      intent: "register_expense",
      amount_ars: 5000,
      category: "supermercado",
      merchant: null,
      description: null,
      needs_confirmation: true,
      requires_reimbursement: true,
      confidence: 0.95,
    });

    const response = await handleTelegramMessage({
      update_id: 990,
      message: { text: "Gasté 5000 en supermercado", chat: { id: 10 }, from: { id: 20 } },
    }, "user-1", "group-1");

    expect(response.replyMarkup?.inline_keyboard?.slice(0, 2)).toEqual([
      [{ text: "💸 Sí, pedir reintegro", callback_data: "expense:confirm_reimbursement" }],
      [{ text: "✅ No, solo gasto", callback_data: "expense:confirm" }],
    ]);
    expect(setConversationState).toHaveBeenCalledWith("10", "20", expect.objectContaining({
      step: "expense_confirm",
      data: expect.objectContaining({ requires_reimbursement: false, reimbursement_intent: "unknown" }),
    }));
  });

  it.each([
    {
      text: "Gasté 5000 en supermercado con reintegro",
      intent: "yes",
      requiresReimbursement: true,
      choices: [
        [{ text: "✅ Sí, pedir reintegro", callback_data: "expense:confirm_reimbursement" }],
        [{ text: "✅ No, solo gasto", callback_data: "expense:confirm" }],
      ],
    },
    {
      text: "Gasté 5000 en supermercado sin reintegro",
      intent: "no",
      requiresReimbursement: false,
      choices: [
        [{ text: "✅ Confirmar sin reintegro", callback_data: "expense:confirm" }],
      ],
    },
    {
      text: "Gasté 5000 en supermercado",
      intent: "unknown",
      requiresReimbursement: false,
      choices: [
        [{ text: "💸 Sí, pedir reintegro", callback_data: "expense:confirm_reimbursement" }],
        [{ text: "✅ No, solo gasto", callback_data: "expense:confirm" }],
      ],
    },
  ])("shows the explicit reimbursement choice for '$text' without writing", async ({ text, intent, requiresReimbursement, choices }) => {
    mockParseFinancialMessage.mockResolvedValue({
      intent: "register_expense",
      amount_ars: 5000,
      category: "supermercado",
      merchant: null,
      description: null,
      needs_confirmation: true,
      requires_reimbursement: true,
      confidence: 0.95,
    });

    const response = await handleTelegramMessage({
      update_id: 993,
      message: { text, chat: { id: 10 }, from: { id: 20 } },
    }, "user-1", "group-1");

    expect(response.replyMarkup?.inline_keyboard?.slice(0, choices.length)).toEqual(choices);
    expect(setConversationState).toHaveBeenCalledWith("10", "20", expect.objectContaining({
      step: "expense_confirm",
      data: expect.objectContaining({
        reimbursement_intent: intent,
        requires_reimbursement: requiresReimbursement,
      }),
    }));
    expect(mockRunTelegramOperation).not.toHaveBeenCalled();
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

  it("routes 'Recurrentes' to list_recurring even when the AI returns unknown", async () => {
    mockParseFinancialMessage.mockResolvedValue({
      intent: "unknown",
      confidence: 0,
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
    ]);

    const response = await handleTelegramMessage(
      {
        update_id: 1,
        message: { text: "Recurrentes", chat: { id: 10 }, from: { id: 20 } },
      },
      "user-1",
      "group-1",
    );

    expect(response.text).toContain("Gastos Recurrentes");
    expect(response.text).toContain("Netflix");
    expect(response.text).not.toContain("No pude interpretar");
  });

  it("routes 'Pendientes' to pending_recurring even when the AI returns unknown", async () => {
    mockParseFinancialMessage.mockResolvedValue({
      intent: "unknown",
      confidence: 0,
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
    ]);

    const response = await handleTelegramMessage(
      {
        update_id: 1,
        message: { text: "Pendientes", chat: { id: 10 }, from: { id: 20 } },
      },
      "user-1",
      "group-1",
    );

    expect(response.text).toContain("🌐 Internet - $10.000");
    expect(response.text).not.toContain("No pude interpretar");
  });

  it("passes the real Telegram user when confirming by natural language", async () => {
    mockParseFinancialMessage.mockResolvedValue({
      intent: "confirm_recurring",
      recurring_name: "Internet",
      confidence: 0.95,
      needs_confirmation: false,
      requires_reimbursement: false,
    });
    mockGetPendingExecutions.mockResolvedValue([pendingExecution]);
    mockConfirmExecution.mockResolvedValue({ success: true, transactionId: "tx-1" });

    await handleTelegramMessage(
      {
        update_id: 1,
        message: { text: "confirmar internet", chat: { id: 10 }, from: { id: 20 } },
      },
      "user-real",
      "group-1",
    );

    expect(mockConfirmExecution).toHaveBeenCalledWith("exec-1", "user-real");
  });

  it("passes the real Telegram user when skipping by natural language", async () => {
    mockParseFinancialMessage.mockResolvedValue({
      intent: "skip_recurring",
      recurring_name: "Internet",
      confidence: 0.95,
      needs_confirmation: false,
      requires_reimbursement: false,
    });
    mockGetPendingExecutions.mockResolvedValue([pendingExecution]);
    mockSkipExecution.mockResolvedValue({ success: true });

    await handleTelegramMessage(
      {
        update_id: 1,
        message: { text: "saltar internet", chat: { id: 10 }, from: { id: 20 } },
      },
      "user-real",
      "group-1",
    );

    expect(mockSkipExecution).toHaveBeenCalledWith("exec-1", "user-real");
  });

  it("passes the real Telegram user when confirming from a callback", async () => {
    mockConfirmExecution.mockResolvedValue({ success: true, transactionId: "tx-1" });

    await handlePersonalCallback(
      "chat-1",
      "telegram-1",
      "user-real",
      "group-1",
      "recurring:confirm:exec-1",
    );

    expect(mockConfirmExecution).toHaveBeenCalledWith("exec-1", "user-real");
  });

  it("passes the real Telegram user when skipping from a callback", async () => {
    mockSkipExecution.mockResolvedValue({ success: true });

    await handlePersonalCallback(
      "chat-1",
      "telegram-1",
      "user-real",
      "group-1",
      "recurring:skip:exec-1",
    );

    expect(mockSkipExecution).toHaveBeenCalledWith("exec-1", "user-real");
  });

  it("passes the real Telegram user for every confirm-all callback", async () => {
    mockGetPendingExecutions.mockResolvedValue([
      pendingExecution,
      { ...pendingExecution, id: "exec-2", recurringExpenseId: "rec-2" },
    ]);
    mockConfirmExecution.mockResolvedValue({ success: true, transactionId: "tx-1" });

    await handlePersonalCallback(
      "chat-1",
      "telegram-1",
      "user-real",
      "group-1",
      "recurring:confirm_all",
    );

    expect(mockConfirmExecution).toHaveBeenNthCalledWith(1, "exec-1", "user-real");
    expect(mockConfirmExecution).toHaveBeenNthCalledWith(2, "exec-2", "user-real");
  });

  it("reports a partial confirm-all result instead of presenting full success", async () => {
    mockGetPendingExecutions.mockResolvedValue([
      pendingExecution,
      { ...pendingExecution, id: "exec-2", recurringExpenseId: "rec-2" },
    ]);
    mockConfirmExecution
      .mockResolvedValueOnce({ success: true, transactionId: "tx-1" })
      .mockResolvedValueOnce({ success: false, error: "Esta ejecución ya fue procesada" });

    const response = await handlePersonalCallback(
      "chat-1",
      "telegram-1",
      "user-real",
      "group-1",
      "recurring:confirm_all",
    );

    expect(response.text).toBe("⚠️ 1 gasto registrado; 1 no pudo registrarse.");
  });

  it("uses child operation identities and one durable batch response for confirm-all", async () => {
    mockGetPendingExecutions.mockResolvedValue([
      pendingExecution,
      { ...pendingExecution, id: "exec-2", recurringExpenseId: "rec-2" },
    ]);
    mockConfirmExecution.mockResolvedValue({ success: true, transactionId: "tx-1" });
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([
          { operationId: "child-1" },
          { operationId: "child-2" },
        ]),
      })),
    });
    const inserted: unknown[] = [];
    const transaction = {
      insert: jest.fn(() => ({
        values: jest.fn((value: unknown) => {
          inserted.push(value);
          return Promise.resolve();
        }),
      })),
    };
    (mockDb.transaction as jest.Mock).mockImplementation(
      async (work: (value: unknown) => Promise<unknown>) => work(transaction),
    );
    mockRunTelegramOperation.mockImplementation(async (
      _runner: unknown,
      input: { identity: { operationId: string }; operationKind: string },
      writer: (value: unknown) => Promise<{ resourceType: string; resourceId: string | null; result: unknown }>,
    ) => ({
      kind: "committed",
      operationId: input.identity.operationId,
      ...(await writer(transaction)),
      reused: false,
    }));
    const context = createTelegramOperationContext({
      botId: "bot-1",
      updateId: "update-1",
      chatId: "chat-1",
      callbackMessageId: 7,
      action: "personal.callback",
    });

    const response = await handlePersonalCallback(
      "chat-1",
      "telegram-1",
      "user-real",
      "group-1",
      "recurring:confirm_all",
      7,
      context,
    );

    expect(mockConfirmExecution).toHaveBeenNthCalledWith(
      1,
      "exec-1",
      "user-real",
      undefined,
      context,
      { enqueuePrimaryResponse: false },
    );
    expect(mockConfirmExecution).toHaveBeenNthCalledWith(
      2,
      "exec-2",
      "user-real",
      undefined,
      context,
      { enqueuePrimaryResponse: false },
    );
    expect(response).toEqual(expect.objectContaining({
      text: "✅ 2 gastos registrados.",
      deliveryOperationId: expect.stringMatching(/^tgop_v1_/),
      deliveryKey: expect.stringMatching(/^tgdel_v1_/),
    }));
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual(expect.objectContaining({
      action: "edit_message",
      message_id: 7,
      text: "✅ 2 gastos registrados.",
    }));
  });
});
