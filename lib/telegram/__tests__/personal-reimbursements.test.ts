import { handleTelegramMessage } from "../handlers";
import { handlePersonalCallback } from "../personal-callback-handler";
import { buildReceiptProposalMessage } from "../handlers";
import { db } from "@/lib/db/client";
import {
  createReimbursementWithNotifications,
  getReimbursementByTransactionId,
  getReimbursementsByUser,
  markReimbursementAsPaidWithNotifications,
} from "@/lib/reimbursements/requests";
import { getAccountingMonthProjection, getMonthSummary } from "@/lib/finance/summaries";
import { clearConversationState, getConversationState, setConversationState } from "../splits/conversation-state";
import { createTelegramOperationContext } from "../operation-context";
import * as telegramFinancialOperation from "../financial-operation";

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
  getAccountingMonthProjection: jest.fn(),
  getMonthSummary: jest.fn(),
  getCategoryBreakdown: jest.fn(),
}));

jest.mock("@/lib/notifications/web-push", () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
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
const mockGetAccountingMonthProjection = getAccountingMonthProjection as jest.MockedFunction<typeof getAccountingMonthProjection>;
const mockGetConversationState = getConversationState as jest.MockedFunction<typeof getConversationState>;
const mockSetConversationState = setConversationState as jest.MockedFunction<typeof setConversationState>;
const mockClearConversationState = clearConversationState as jest.MockedFunction<typeof clearConversationState>;
const { getGroupMembership } = jest.requireMock("@/lib/groups/permissions") as { getGroupMembership: jest.Mock };

describe("telegram reimbursements", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ACT05_ARS_MODE_ENABLED;
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

  it("does not infer or request reimbursement after a plain-expense confirmation", async () => {
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
        requires_reimbursement: true,
      },
    });
    (mockDb.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ exchange_rate: 1000, income_usd: 1000, saving_goal_usd: 0 });
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

    expect(mockClearConversationState).toHaveBeenCalledWith("chat-1", "telegram-1");
    expect(mockSetConversationState).toHaveBeenCalledTimes(1);
    expect(mockSetConversationState.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ step: "expense_processing" }));
    expect(mockCreateReimbursement).not.toHaveBeenCalled();
    expect(response.text).toContain("Registrado:");
    expect(response.text).not.toContain("automáticamente");
    expect(response.replyMarkup).toBeUndefined();
  });

  it("offers the same explicit reimbursement choice in receipt proposals", () => {
    const proposal = buildReceiptProposalMessage({
      amount_ars: 5000,
      categoryName: "Supermercado",
      categoryEmoji: "🛒",
      date: "2026-09-27",
      source: "ocr",
    });

    expect(proposal.replyMarkup).toEqual({
      inline_keyboard: [
        [{ text: "💸 Sí, pedir reintegro", callback_data: "receipt:confirm_reimbursement" }],
        [{ text: "✅ No, solo gasto", callback_data: "receipt:confirm" }],
        [
          { text: "💰 Editar monto", callback_data: "receipt:edit_amount" },
          { text: "📂 Editar categoría", callback_data: "receipt:edit_category" },
        ],
        [
          { text: "🏪 Editar comercio", callback_data: "receipt:edit_merchant" },
          { text: "❌ Cancelar", callback_data: "receipt:cancel" },
        ],
      ],
    });
  });

  it("fails closed instead of partially writing a reimbursement without durable operation context", async () => {
    const pendingReceipt = {
      id: "receipt-1",
      parsed_amount_ars: 5000,
      parsed_category_slug: "supermercado",
      parsed_merchant: "Almacén",
    };
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([pendingReceipt]) })),
        })),
      })),
    });
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-1", slug: "supermercado" });

    const response = await handlePersonalCallback(
      "chat-1",
      "telegram-1",
      "user-1",
      "group-1",
      "receipt:confirm_reimbursement",
    );

    expect(response.text).toContain("de forma segura");
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("persists a reimbursable expense, request, and group delivery in one durable transaction", async () => {
    mockGetConversationState.mockResolvedValue({
      step: "expense_confirm",
      data: {
        step: "expense_confirm",
        category_id: "cat-1",
        category_name: "Supermercado",
        category_emoji: "🛒",
        amount_ars: 5000,
        merchant: "Almacén",
        group_id: "group-1",
        user_id: "user-1",
        is_exception: false,
      },
    });

    const selectResults: unknown[][] = [
      [{ userId: "user-1" }],
      [{ exchange_rate: 1000, income_usd: 1000, saving_goal_usd: 0 }],
      [{ userId: "user-1" }],
      [{ partnerId: "user-2" }],
      [{ slug: "supermercado" }],
      [{ partnerId: "user-2" }],
      [{ name: "QA" }],
      [],
      [{ name: "Supermercado" }],
      [
        { userId: "user-1", telegramId: "telegram-1" },
        { userId: "user-2", telegramId: "telegram-2" },
        { userId: "user-3", telegramId: null },
        { userId: "user-4", telegramId: "telegram-4" },
      ],
      [],
      [{ total: 5000 }],
      [{ name: "Supermercado", emoji: "🛒", slug: "supermercado" }],
    ];
    const insertValues: Array<{ table: unknown; values: unknown }> = [];
    const transaction = {
      select: jest.fn(() => ({
        from: jest.fn(() => {
          const rows = selectResults.shift() ?? [];
          const result = Object.assign(Promise.resolve(rows), {
            limit: jest.fn().mockResolvedValue(rows),
          });
          return {
            where: jest.fn(() => result),
            innerJoin: jest.fn(() => ({ where: jest.fn().mockResolvedValue(rows) })),
          };
        }),
      })),
      insert: jest.fn((table: unknown) => ({
        values: jest.fn((values: unknown) => {
          insertValues.push({ table, values });
          return {
            returning: jest.fn().mockImplementation(async () => [{ id: (values as { id?: string }).id ?? "reimbursement-1" }]),
            onConflictDoNothing: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([{ operationId: "claimed" }]) })),
          };
        }),
      })),
    };
    const operationSpy = jest.spyOn(telegramFinancialOperation, "runTelegramOperation");
    const committedResults = new Map<string, unknown>();
    let financialWriteCount = 0;
    (operationSpy as unknown as jest.Mock).mockImplementation(async (_runner, input, write) => {
      const priorResult = committedResults.get(input.identity.operationId);
      if (priorResult) {
        return {
          kind: "committed",
          operationId: input.identity.operationId,
          reused: true,
          result: priorResult,
        };
      }
      financialWriteCount += 1;
      const writeResult = await write(transaction);
      committedResults.set(input.identity.operationId, writeResult.result);
      return {
        kind: "committed",
        operationId: input.identity.operationId,
        reused: false,
        ...writeResult,
      };
    });

    try {
      const operationContext = createTelegramOperationContext({
        botId: "bot-1",
        updateId: "expense-reimbursement-update",
        chatId: "chat-1",
        callbackMessageId: 77,
        action: "personal.callback",
      });
      const response = await handlePersonalCallback(
        "chat-1",
        "telegram-1",
        "user-1",
        "group-1",
        "expense:confirm_reimbursement",
        77,
        operationContext,
      );
      const repeatedResponse = await handlePersonalCallback(
        "chat-1",
        "telegram-1",
        "user-1",
        "group-1",
        "expense:confirm_reimbursement",
        77,
        operationContext,
      );

      const transactionRow = insertValues.find(({ values }) =>
        !!values && typeof values === "object" && "requiresReimbursement" in values,
      )?.values as Record<string, unknown> | undefined;
      const reimbursementRow = insertValues.find(({ values }) =>
        !!values && typeof values === "object" && "transactionId" in values,
      )?.values as Record<string, unknown> | undefined;
      const deliveries = insertValues.map(({ values }) => values as Record<string, unknown>);

      expect(transactionRow).toEqual(expect.objectContaining({ requiresReimbursement: true }));
      expect(reimbursementRow).toEqual(expect.objectContaining({
        id: expect.any(String),
        transactionId: transactionRow?.id,
        requesterId: "user-1",
        payerId: "user-2",
        amount: 5000,
        status: "pending",
      }));
      const groupDeliveries = deliveries.filter((delivery) =>
        typeof delivery.delivery_key === "string" && delivery.chat_id !== "chat-1",
      );
      expect(groupDeliveries.map((delivery) => delivery.chat_id).sort()).toEqual([
        "telegram-2",
        "telegram-4",
      ]);
      expect(groupDeliveries.map((delivery) => delivery.delivery_key)).toEqual([
        expect.any(String),
        expect.any(String),
      ]);
      expect(new Set(groupDeliveries.map((delivery) => delivery.delivery_key)).size).toBe(2);
      expect(response.text).toContain("Reintegro solicitado. Ya avisamos al grupo.");
      expect(repeatedResponse.text).toBe(response.text);
      expect(financialWriteCount).toBe(1);
      expect(insertValues).toHaveLength(5);
      expect(mockCreateReimbursement).not.toHaveBeenCalled();
    } finally {
      operationSpy.mockRestore();
    }
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
      [{ exchange_rate: 1000, income_usd: 1000, saving_goal_usd: 0 }],
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
      currency_mode: "USD_ARS",
      exchange_rate_snapshot: 1000,
    }));
    expect(outboxInsertValues[0]).toEqual(expect.objectContaining({
      operation_id: response.deliveryOperationId,
      text: expect.not.stringContaining("Ahorro proyectado"),
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

  it("fails closed when legacy USD settings have a null exchange rate", async () => {
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
    (mockDb.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      exchange_rate: null,
      income_usd: null,
      saving_goal_usd: null,
    });

    const response = await handlePersonalCallback("chat-1", "telegram-1", "user-1", "group-1", "expense:confirm");

    expect(response.text).toContain("configuración USD/ARS válida");
    expect(mockDb.insert).not.toHaveBeenCalled();
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
    (mockDb.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ exchange_rate: 1000, income_usd: 1000, saving_goal_usd: 0 });
    getGroupMembership
      .mockResolvedValueOnce({ group_id: "group-1", user_id: "user-1", role: "member" })
      .mockResolvedValueOnce(null);

    const response = await handlePersonalCallback("chat-1", "telegram-1", "user-1", "group-1", "expense:confirm");

    expect(response.text).toContain("Ya no tenés acceso");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("writes ARS_ARS without USD or an FX snapshot and formats the ARS projection", async () => {
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    mockGetConversationState.mockResolvedValue({
      step: "expense_confirm",
      data: { step: "expense_confirm", category_id: "cat-1", category_name: "Comida", category_emoji: "🍝", amount_ars: 5000, group_id: "group-1", user_id: "user-1", is_exception: false },
    });
    (mockDb.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "ARS_ARS", exchange_rate: null, income_ars: 100000, saving_goal_ars: 20000 });
    (mockDb.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-1", name: "Comida", emoji: "🍝", slug: "food" });
    (mockDb.select as jest.Mock).mockReturnValue({ from: jest.fn(() => ({ where: jest.fn().mockResolvedValue([{ total: 5000 }]) })) });
    const inserted: unknown[] = [];
    (mockDb.insert as jest.Mock).mockReturnValue({ values: jest.fn((values: unknown) => { inserted.push(values); return Promise.resolve(); }) });
    mockGetAccountingMonthProjection.mockResolvedValue({
      mode: "ARS_ARS", accountingCurrency: "ARS", configuredIncome: 100000,
      extraIncome: 0, effectiveIncome: 100000, totalExpenses: 5000,
      projectedSavings: 95000, savingGoal: 20000, categoryExpensesArs: { food: 5000 },
    });

    const response = await handlePersonalCallback("chat-1", "telegram-1", "user-1", "group-1", "expense:confirm");

    expect(inserted[0]).toEqual(expect.objectContaining({ amount_usd: null, currency_mode: "ARS_ARS", exchange_rate_snapshot: null }));
    expect(response.text).toContain("Ahorro proyectado:");
    expect(response.text).toContain("95.000");
    expect(mockGetMonthSummary).not.toHaveBeenCalled();
  });

  it("keeps a committed ARS transaction successful when its projection fails", async () => {
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    mockGetConversationState.mockResolvedValue({
      step: "expense_confirm",
      data: { step: "expense_confirm", category_id: "cat-1", category_name: "Comida", category_emoji: "🍝", amount_ars: 5000, group_id: "group-1", user_id: "user-1", is_exception: false },
    });
    (mockDb.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "ARS_ARS", income_ars: 100000, saving_goal_ars: 20000 });
    (mockDb.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-1", name: "Comida", emoji: "🍝", slug: "food" });
    (mockDb.select as jest.Mock).mockReturnValue({ from: jest.fn(() => ({ where: jest.fn().mockResolvedValue([{ total: 5000 }]) })) });
    (mockDb.insert as jest.Mock).mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) });
    mockGetAccountingMonthProjection.mockRejectedValue(new Error("projection unavailable"));

    const response = await handlePersonalCallback("chat-1", "telegram-1", "user-1", "group-1", "expense:confirm");

    expect(response.text).toContain("Registrado:");
    expect(response.text).not.toContain("Ahorro proyectado");
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("does not write ARS_ARS when the feature flag is off", async () => {
    mockGetConversationState.mockResolvedValue({
      step: "expense_confirm",
      data: { step: "expense_confirm", category_id: "cat-1", category_name: "Comida", category_emoji: "🍝", amount_ars: 5000, group_id: "group-1", user_id: "user-1", is_exception: false },
    });
    (mockDb.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "ARS_ARS", income_ars: 100000, saving_goal_ars: 20000 });

    const response = await handlePersonalCallback("chat-1", "telegram-1", "user-1", "group-1", "expense:confirm");

    expect(response.text).toContain("modo ARS está deshabilitado");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("rejects incomplete ARS_ARS settings without a USD configuration error", async () => {
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    mockGetConversationState.mockResolvedValue({
      step: "expense_confirm",
      data: { step: "expense_confirm", category_id: "cat-1", category_name: "Comida", category_emoji: "🍝", amount_ars: 5000, group_id: "group-1", user_id: "user-1", is_exception: false },
    });
    (mockDb.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "ARS_ARS", income_ars: null, saving_goal_ars: null });

    const response = await handlePersonalCallback("chat-1", "telegram-1", "user-1", "group-1", "expense:confirm");

    expect(response.text).toContain("configuración ARS válida");
    expect(response.text).not.toContain("configuración USD/ARS");
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
      [{ exchange_rate: 1000, income_usd: 1000, saving_goal_usd: 0 }],
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

  it("persists ARS_ARS transaction and savings-free outbox in the operation transaction", async () => {
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    mockGetConversationState.mockResolvedValue({
      step: "expense_confirm",
      data: { step: "expense_confirm", category_id: "cat-1", category_name: "Comida", category_emoji: "🍝", amount_ars: 5000, group_id: "group-1", user_id: "user-1", is_exception: false },
    });
    mockGetAccountingMonthProjection.mockResolvedValue({
      mode: "ARS_ARS", accountingCurrency: "ARS", configuredIncome: 100000,
      extraIncome: 0, effectiveIncome: 100000, totalExpenses: 5000,
      projectedSavings: 95000, savingGoal: 20000, categoryExpensesArs: { food: 5000 },
    });
    const transactionValues: unknown[] = [];
    const outboxValues: unknown[] = [];
    const selectResults = [
      [{ userId: "user-1" }],
      [{ currency_mode: "ARS_ARS", income_ars: 100000, saving_goal_ars: 20000 }],
      [{ userId: "user-1" }],
      [],
      [{ total: 5000 }],
      [{ name: "Comida", emoji: "🍝", slug: "food" }],
    ];
    let insertNumber = 0;
    const tx = {
      insert: jest.fn(() => ({
        values: jest.fn((values: unknown) => {
          insertNumber += 1;
          if (insertNumber === 2) transactionValues.push(values);
          if (insertNumber === 3) outboxValues.push(values);
          return { onConflictDoNothing: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([{ operationId: "claimed" }]) })) };
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
      "chat-1", "telegram-1", "user-1", "group-1", "expense:confirm", 77,
      createTelegramOperationContext({ botId: "bot-1", updateId: "ars-update", chatId: "chat-1", callbackMessageId: 77, action: "callback" }),
    );

    expect(transactionValues[0]).toEqual(expect.objectContaining({ amount_usd: null, currency_mode: "ARS_ARS", exchange_rate_snapshot: null }));
    expect(outboxValues[0]).toEqual(expect.objectContaining({ text: expect.not.stringContaining("Ahorro proyectado") }));
    expect(response.text).toContain("95.000");
    expect(response.deliveryOperationId).toMatch(/^tgop_v1_/);
  });
});
