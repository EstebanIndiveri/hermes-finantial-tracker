import { handleTelegramMessage } from "../handlers";
import { handlePersonalCallback } from "../personal-callback-handler";
import { db } from "@/lib/db/client";
import { getReimbursementsByUser, markReimbursementAsPaidWithNotifications, createReimbursementWithNotifications } from "@/lib/reimbursements/requests";
import { getMonthSummary } from "@/lib/finance/summaries";
import { getActiveMonthArgentina, getArgentinaDate } from "@/lib/utils/dates";
import { clearConversationState, getConversationState, setConversationState } from "../splits/conversation-state";

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
  markReimbursementAsPaidWithNotifications: jest.fn(),
  createReimbursementWithNotifications: jest.fn(),
}));

jest.mock("../splits/conversation-state", () => ({
  getConversationState: jest.fn(),
  setConversationState: jest.fn(),
  clearConversationState: jest.fn(),
}));

const mockDb = db as jest.Mocked<typeof db>;
const mockGetReimbursementsByUser = getReimbursementsByUser as jest.MockedFunction<typeof getReimbursementsByUser>;
const mockMarkPaid = markReimbursementAsPaidWithNotifications as jest.MockedFunction<typeof markReimbursementAsPaidWithNotifications>;
const mockCreateReimbursement = createReimbursementWithNotifications as jest.MockedFunction<typeof createReimbursementWithNotifications>;
const mockGetMonthSummary = getMonthSummary as jest.MockedFunction<typeof getMonthSummary>;
const mockGetConversationState = getConversationState as jest.MockedFunction<typeof getConversationState>;
const mockSetConversationState = setConversationState as jest.MockedFunction<typeof setConversationState>;
const mockClearConversationState = clearConversationState as jest.MockedFunction<typeof clearConversationState>;

describe("telegram reimbursements", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMonthSummary.mockResolvedValue({ ahorro_proyectado_usd: 1200 } as Awaited<ReturnType<typeof getMonthSummary>>);
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
    ] as any);

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
      inline_keyboard: [[{ text: "✅ Pagado", callback_data: "pay_reimbursement:r-pay" }]],
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
    } as any);
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

    expect(mockClearConversationState).toHaveBeenCalledWith("chat-1", "telegram-1");
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
        { text: "💸 Sí, necesito reintegro", callback_data: expect.stringMatching(/^expense:reimbursement_yes:/) },
        { text: "❌ No", callback_data: expect.stringMatching(/^expense:reimbursement_no:/) },
      ]],
    });
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
    } as any);
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
});
