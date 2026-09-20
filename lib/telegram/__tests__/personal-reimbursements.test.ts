import { handleTelegramMessage } from "../handlers";
import { handlePersonalCallback } from "../personal-callback-handler";
import { db } from "@/lib/db/client";
import {
  createReimbursementWithNotifications,
  getReimbursementByTransactionId,
  getReimbursementsByUser,
  markReimbursementAsPaidWithNotifications,
} from "@/lib/reimbursements/requests";
import { getMonthSummary } from "@/lib/finance/summaries";
import { clearConversationState, getConversationState, setConversationState } from "../splits/conversation-state";
import { createTelegramOperationContext } from "../operation-context";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      categories: { findFirst: jest.fn(), findMany: jest.fn() },
      budgets: { findFirst: jest.fn() },
      monthly_settings: { findFirst: jest.fn() },
      transactions: { findFirst: jest.fn() },
    },
    select: jest.fn(),
    insert: jest.fn(() => ({ values: jest.fn().mockResolvedValue(undefined) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue([{ id: "tx-1" }]) })) })),
    transaction: jest.fn(),
  },
}));

jest.mock("@/lib/finance/summaries", () => ({
  getMonthSummary: jest.fn(),
  getCategoryBreakdown: jest.fn(),
}));

jest.mock("@/lib/utils/dates", () => ({
  getActiveMonthArgentina: jest.fn(() => "2026-08"),
  getArgentinaDate: jest.fn(() => new Date("2026-08-18T03:00:00.000Z")),
}));

jest.mock("@/lib/reimbursements/requests", () => ({
  getReimbursementsByUser: jest.fn(),
  getOpenGroupReimbursements: jest.fn().mockResolvedValue([]),
  getReimbursementByTransactionId: jest.fn(),
  markReimbursementAsPaidWithNotifications: jest.fn(),
  createReimbursementWithNotifications: jest.fn(),
}));

jest.mock("../splits/conversation-state", () => ({
  getConversationState: jest.fn(),
  setConversationState: jest.fn(),
  clearConversationState: jest.fn(),
}));

jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn().mockResolvedValue({ group_id: "group-1", user_id: "user-1", role: "member" }),
  isAdminOrAbove: jest.fn(),
}));

const mockDb = db as jest.Mocked<typeof db>;
const mockGetReimbursementsByUser = getReimbursementsByUser as jest.MockedFunction<typeof getReimbursementsByUser>;
const mockGetReimbursementByTransactionId = getReimbursementByTransactionId as jest.MockedFunction<typeof getReimbursementByTransactionId>;
const mockMarkPaid = markReimbursementAsPaidWithNotifications as jest.MockedFunction<typeof markReimbursementAsPaidWithNotifications>;
const mockCreateReimbursement = createReimbursementWithNotifications as jest.MockedFunction<typeof createReimbursementWithNotifications>;
const mockGetMonthSummary = getMonthSummary as jest.MockedFunction<typeof getMonthSummary>;
const mockGetConversationState = getConversationState as jest.MockedFunction<typeof getConversationState>;
const mockSetConversationState = setConversationState as jest.MockedFunction<typeof setConversationState>;
const mockClearConversationState = clearConversationState as jest.MockedFunction<typeof clearConversationState>;
const { getGroupMembership } = jest.requireMock("@/lib/groups/permissions") as { getGroupMembership: jest.Mock };

describe("telegram reimbursements", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMonthSummary.mockResolvedValue({ ahorro_proyectado_usd: 1200 } as Awaited<ReturnType<typeof getMonthSummary>>);
    mockGetReimbursementByTransactionId.mockResolvedValue(null);
  });

  it("lists reimbursements to pay and requested reimbursements with pay buttons", async () => {
    mockGetReimbursementsByUser.mockResolvedValue([
      {
        id: "r-pay",
        transactionId: "tx-1",
        requesterId: "user-2",
        payerId: "user-1",
        amount: 2500,
        status: "pending",
        paidAt: null,
        createdAt: 1723939200000,
      },
      {
        id: "r-requested",
        transactionId: "tx-2",
        requesterId: "user-1",
        payerId: "user-3",
        amount: 1800,
        status: "pending",
        paidAt: null,
        createdAt: 1723852800000,
      },
    ] as Awaited<ReturnType<typeof getReimbursementsByUser>>);

    const response = await handleTelegramMessage({
      update_id: 1,
      message: {
        text: "/reintegros",
        chat: { id: 10 },
        from: { id: 20 },
      },
    }, "user-1", "group-1");

    expect(response.text).toContain("💸 <b>Reintegros por pagar</b>");
    expect(response.text).toContain("$2.500");
    expect(response.text).toContain("🙋 <b>Reintegros solicitados</b>");
    expect(response.text).toContain("$1.800");
    expect(response.replyMarkup).toEqual({
      inline_keyboard: [
        [{ text: "✅ Pagar $2.500", callback_data: "pay_reimbursement:r-pay" }],
        [{ text: "❌ Cancelar $1.800", callback_data: "cancel_reimbursement:r-requested" }],
      ],
    });
  });

  it("marks reimbursements as paid from callbacks and updates the message", async () => {
    mockMarkPaid.mockResolvedValue(true);

    const response = await handlePersonalCallback(
      "chat-1",
      "telegram-1",
      "user-1",
      "group-1",
      "pay_reimbursement:r-1",
      55,
    );

    expect(mockMarkPaid).toHaveBeenCalledWith("r-1", "user-1");
    expect(response).toEqual({
      text: "✅ Reintegro marcado como pagado.",
      edit: true,
    });
  });

  it("asks whether reimbursement is needed after confirming an expense", async () => {
    mockGetConversationState.mockResolvedValue({
      step: "expense_confirm",
      data: {
        step: "expense_confirm",
        category_id: "cat-1",
        category_name: "Comida",
        category_emoji: "🍝",
        amount_ars: 5000,
        merchant: "Cena",
        group_id: "group-1",
        user_id: "user-1",
        is_exception: false,
      },
    });
    (mockDb.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ exchange_rate: 1000 });
    (mockDb.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-1", name: "Comida", emoji: "🍝" });
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([{ total: 5000 }]),
      })),
    });

    const response = await handlePersonalCallback(
      "chat-1",
      "telegram-1",
      "user-1",
      "group-1",
      "expense:confirm",
      77,
    );

    expect(mockClearConversationState).not.toHaveBeenCalled();
    expect(mockSetConversationState).toHaveBeenCalledWith("chat-1", "telegram-1", {
      step: "expense_reimbursement_confirm",
      data: expect.objectContaining({
        transaction_id: expect.any(String),
        amount_ars: 5000,
        user_id: "user-1",
        group_id: "group-1",
      }),
    });
    expect(response.text).toContain("¿Necesitás reintegro de este gasto?");
    expect(response.replyMarkup).toEqual({
      inline_keyboard: [[
        { text: "💸 Sí", callback_data: expect.stringMatching(/^expense:reimbursement_yes:/) },
        { text: "❌ No", callback_data: expect.stringMatching(/^expense:reimbursement_no:/) },
      ]],
    });
  });

  it.each([
    ["expense:confirm", "Gasto registrado"],
    ["exception:confirm", "Excepción registrada"],
  ])("recovers the durable confirmation for a retried %s callback", async (callbackData, text) => {
    mockGetConversationState.mockResolvedValue({
      step: "expense_reimbursement_confirm",
      data: {
        step: "expense_reimbursement_confirm",
        transaction_id: "tx-committed",
        amount_ars: 5000,
        user_id: "user-1",
        group_id: "group-1",
        origin_update_id: "update-retry",
        confirmation_text: text,
        delivery_operation_id: "operation-committed",
        delivery_key: "delivery-committed",
      },
    });

    const response = await handlePersonalCallback(
      "chat-1",
      "telegram-1",
      "user-1",
      "group-1",
      callbackData,
      77,
      createTelegramOperationContext({
        botId: "bot-1",
        updateId: "update-retry",
        chatId: "chat-1",
        callbackMessageId: 77,
        action: "personal.callback",
      }),
    );

    expect(response).toEqual(expect.objectContaining({
      text,
      edit: true,
      deliveryOperationId: "operation-committed",
      deliveryKey: "delivery-committed",
    }));
    expect(response.replyMarkup).toEqual({
      inline_keyboard: [[
        { text: "💸 Sí", callback_data: "expense:reimbursement_yes:tx-committed" },
        { text: "❌ No", callback_data: "expense:reimbursement_no:tx-committed" },
      ]],
    });
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("confirms the receipt in the same operation transaction as its financial write", async () => {
    const pendingReceipt = {
      id: "receipt-1",
      user_id: "user-1",
      parsed_amount_ars: 5000,
      parsed_category_slug: "food",
      parsed_merchant: "Cena",
      status: "pending",
      created_at: 1,
    };
    const pendingLimit = jest.fn().mockResolvedValue([pendingReceipt]);
    (mockDb.select as jest.Mock).mockReturnValueOnce({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => ({ limit: pendingLimit })),
        })),
      })),
    });
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({
      id: "cat-1",
      name: "Comida",
      emoji: "🍝",
      slug: "food",
    });

    const operationInsertValues: unknown[] = [];
    const transactionInsertValues: unknown[] = [];
    const outboxInsertValues: unknown[] = [];
    const updateSets: unknown[] = [];
    const selectResults = [
      [{ userId: "user-1" }],
      [{ exchange_rate: 1000 }],
      [{ userId: "user-1" }],
      [],
      [{ total: 5000 }],
      [{ name: "Comida", emoji: "🍝", slug: "food" }],
    ];
    const tx = {
      insert: jest.fn(() => ({
        values: jest.fn((values: unknown) => {
          if (operationInsertValues.length === 0) operationInsertValues.push(values);
          else if (transactionInsertValues.length === 0) transactionInsertValues.push(values);
          else outboxInsertValues.push(values);
          return {
            onConflictDoNothing: jest.fn(() => ({
              returning: jest.fn().mockResolvedValue([{ operationId: "claimed" }]),
            })),
          };
        }),
      })),
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => {
            const rows = selectResults.shift() ?? [];
            const whereResult = Promise.resolve(rows) as unknown as { limit: jest.Mock };
            whereResult.limit = jest.fn().mockResolvedValue(rows);
            return whereResult;
          }),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn((values: unknown) => {
          updateSets.push(values);
          return {
            where: jest.fn(() => ({
              returning: jest.fn().mockResolvedValue([{ id: "receipt-1", operationId: "claimed" }]),
            })),
          };
        }),
      })),
    };
    (mockDb.transaction as jest.Mock).mockImplementation(
      async (work: (value: unknown) => Promise<unknown>) => work(tx),
    );

    const response = await handlePersonalCallback(
      "chat-1",
      "telegram-1",
      "user-1",
      "group-1",
      "receipt:confirm",
      77,
      createTelegramOperationContext({
        botId: "bot-1",
        updateId: "receipt-update",
        chatId: "chat-1",
        callbackMessageId: 77,
        action: "personal.callback",
      }),
    );

    expect(response.deliveryOperationId).toMatch(/^tgop_v1_/);
    expect(updateSets).toContainEqual(expect.objectContaining({
      status: "confirmed",
      transaction_id: expect.any(String),
    }));
    expect(transactionInsertValues[0]).toEqual(expect.objectContaining({
      operation_id: response.deliveryOperationId,
      source: "telegram",
    }));
    expect(outboxInsertValues[0]).toEqual(expect.objectContaining({
      operation_id: response.deliveryOperationId,
    }));
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("creates a reimbursement request when the user confirms they need it", async () => {
    mockGetConversationState.mockResolvedValue({
      step: "expense_reimbursement_confirm",
      data: {
        transaction_id: "tx-1",
        amount_ars: 5000,
        user_id: "user-1",
        group_id: "group-1",
      },
    });
    mockCreateReimbursement.mockResolvedValue({
      id: "reimb-1",
      transactionId: "tx-1",
      requesterId: "user-1",
      payerId: null,
      amount: 5000,
      status: "pending",
      paidAt: null,
      createdAt: 1,
    });

    const response = await handlePersonalCallback(
      "chat-1",
      "telegram-1",
      "user-1",
      "group-1",
      "expense:reimbursement_yes:tx-1",
    );

    expect(mockCreateReimbursement).toHaveBeenCalledWith("tx-1", "user-1", 5000, undefined);
    expect(mockClearConversationState).toHaveBeenCalledWith("chat-1", "telegram-1");
    expect(response.text).toContain("✅ Reintegro solicitado");
    expect(response.edit).toBe(true);
  });

  it("invalidates an expense confirmation from a different group before any financial write", async () => {
    mockGetConversationState.mockResolvedValue({
      step: "expense_confirm",
      data: {
        step: "expense_confirm",
        category_id: "cat-old",
        category_name: "Comida",
        category_emoji: "🍝",
        amount_ars: 5000,
        group_id: "group-old",
        user_id: "user-1",
        is_exception: false,
      },
    });

    const response = await handlePersonalCallback("chat-1", "telegram-1", "user-1", "group-current", "expense:confirm");

    expect(response.text).toContain("contexto cambiado");
    expect(mockClearConversationState).toHaveBeenCalledWith("chat-1", "telegram-1");
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.query.monthly_settings.findFirst).not.toHaveBeenCalled();
    expect(getGroupMembership).not.toHaveBeenCalled();
  });

  it("invalidates an exception confirmation from a different user before any financial write", async () => {
    mockGetConversationState.mockResolvedValue({
      step: "expense_confirm",
      data: {
        step: "expense_confirm",
        category_id: "cat-old",
        category_name: "Comida",
        category_emoji: "🍝",
        amount_ars: 5000,
        group_id: "group-current",
        user_id: "user-old",
        is_exception: true,
      },
    });

    const response = await handlePersonalCallback("chat-1", "telegram-1", "user-1", "group-current", "exception:confirm");

    expect(response.text).toContain("contexto cambiado");
    expect(mockClearConversationState).toHaveBeenCalledWith("chat-1", "telegram-1");
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.query.monthly_settings.findFirst).not.toHaveBeenCalled();
  });

  it("scopes an expired reimbursement fallback transaction to the current user and group", async () => {
    mockGetConversationState.mockResolvedValue(null);
    const where = jest.fn().mockResolvedValue([]);
    const from = jest.fn().mockReturnValue({ where });
    (mockDb.select as jest.Mock).mockReturnValue({ from });

    const response = await handlePersonalCallback(
      "chat-1",
      "telegram-1",
      "user-1",
      "group-current",
      "expense:reimbursement_yes:tx-foreign",
    );

    expect(response.text).toContain("Confirmación expirada");
    expect(where).toHaveBeenCalled();
    expect(mockCreateReimbursement).not.toHaveBeenCalled();
    expect(mockGetReimbursementByTransactionId).not.toHaveBeenCalled();
  });

  it("rechecks membership immediately before registering a transaction", async () => {
    mockGetConversationState.mockResolvedValue({
      step: "expense_confirm",
      data: {
        step: "expense_confirm",
        category_id: "cat-1",
        category_name: "Comida",
        category_emoji: "🍝",
        amount_ars: 5000,
        group_id: "group-1",
        user_id: "user-1",
        is_exception: false,
      },
    });
    (mockDb.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ exchange_rate: 1000 });
    getGroupMembership
      .mockResolvedValueOnce({ group_id: "group-1", user_id: "user-1", role: "member" })
      .mockResolvedValueOnce(null);

    const response = await handlePersonalCallback("chat-1", "telegram-1", "user-1", "group-1", "expense:confirm");

    expect(response.text).toContain("Ya no tenés acceso");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("uses the operation transaction and persists its fallback delivery row when context is supplied", async () => {
    mockGetConversationState.mockResolvedValue({
      step: "expense_confirm",
      data: {
        step: "expense_confirm",
        category_id: "cat-1",
        category_name: "Comida",
        category_emoji: "🍝",
        amount_ars: 5000,
        merchant: "Cena",
        group_id: "group-1",
        user_id: "user-1",
        is_exception: false,
      },
    });
    mockGetMonthSummary.mockResolvedValue({ ahorro_proyectado_usd: 1200 } as Awaited<ReturnType<typeof getMonthSummary>>);

    const operationInsertValues: unknown[] = [];
    const transactionInsertValues: unknown[] = [];
    const outboxInsertValues: unknown[] = [];
    const selectResults = [
      [{ userId: "user-1" }],
      [{ exchange_rate: 1000 }],
      [{ userId: "user-1" }],
      [],
      [{ total: 5000 }],
      [{ name: "Comida", emoji: "🍝", slug: "food" }],
    ];
    const tx = {
      insert: jest.fn(() => ({
        values: jest.fn((values: unknown) => {
          if (operationInsertValues.length === 0) operationInsertValues.push(values);
          else if (transactionInsertValues.length === 0) transactionInsertValues.push(values);
          else outboxInsertValues.push(values);
          return {
            onConflictDoNothing: jest.fn(() => ({
              returning: jest.fn().mockResolvedValue([{ operationId: "claimed" }]),
            })),
          };
        }),
      })),
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => {
            const rows = selectResults.shift() ?? [];
            const whereResult = Promise.resolve(rows) as unknown as { limit: jest.Mock };
            whereResult.limit = jest.fn().mockResolvedValue(rows);
            return whereResult;
          }),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn(() => ({
          where: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([{ operationId: "claimed" }]) })),
        })),
      })),
    };
    (mockDb.transaction as jest.Mock).mockImplementation(async (work: (value: unknown) => Promise<unknown>) => work(tx));

    const response = await handlePersonalCallback(
      "chat-1",
      "telegram-1",
      "user-1",
      "group-1",
      "expense:confirm",
      77,
      createTelegramOperationContext({
        botId: "bot-1",
        updateId: "update-1",
        chatId: "chat-1",
        callbackMessageId: 77,
        action: "callback",
      }),
    );

    expect(response.deliveryOperationId).toMatch(/^tgop_v1_/);
    expect(transactionInsertValues[0]).toEqual(expect.objectContaining({
      operation_id: response.deliveryOperationId,
      source: "telegram",
    }));
    expect(outboxInsertValues[0]).toEqual(expect.objectContaining({
      operation_id: response.deliveryOperationId,
      action: "edit_message",
      message_id: 77,
      status: "pending",
    }));
    expect(operationInsertValues[0]).toEqual(expect.objectContaining({
      operation_id: response.deliveryOperationId,
      operation_kind: "personal_transaction:expense",
    }));
  });
});
