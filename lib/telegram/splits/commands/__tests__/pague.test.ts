import { handlePague, handlePagueSelect, handlePaguePartialAmountInput } from "../pague";
import { db } from "@/lib/db/client";
import { calculateSessionBalances } from "@/lib/splits/balances";
import { setConversationState } from "../../conversation-state";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      split_sessions: { findFirst: jest.fn() },
      users: { findFirst: jest.fn() },
      splits: { findMany: jest.fn() },
      temp_users: { findFirst: jest.fn() },
    },
    select: jest.fn(),
  },
}));

jest.mock("@/lib/splits/balances", () => ({
  calculateSessionBalances: jest.fn(),
}));

jest.mock("../../conversation-state", () => ({
  setConversationState: jest.fn(),
}));

function makeSelectMock(result: unknown) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(result),
  };
}

describe("/pague flow", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows temp creditors in the debt list with temp callback ids", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({ id: "session-1", status: "open" });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "user-1", telegram_user_id: "telegram-1" });
    (db.query.splits.findMany as jest.Mock).mockResolvedValue([{ id: "split-1", session_id: "session-1", status: "active" }]);
    (db.select as jest.Mock)
      .mockReturnValueOnce(makeSelectMock([]))
      .mockReturnValueOnce(makeSelectMock([]))
      .mockReturnValueOnce(makeSelectMock([]))
      .mockReturnValueOnce(makeSelectMock([{ id: "temp-1", telegram_username: "sabri", first_name: "Sabri" }]));
    (calculateSessionBalances as jest.Mock).mockReturnValue({
      debts: [{ from: { userId: "user-1" }, to: { tempUserId: "temp-1" }, amount: 450 }],
      balances: [],
      isSettled: false,
    });

    const response = await handlePague("chat-1", "telegram-1");

    expect(response.text).toContain("@sabri");
    expect(response.replyMarkup?.inline_keyboard).toEqual([
      [{ text: "@sabri $450", callback_data: "pague_select:temp:temp-1" }],
    ]);
  });

  it("stores temp creditors in conversation state when selecting a debt", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({ id: "session-1", telegram_chat_id: "chat-1", status: "open" });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "user-1", telegram_user_id: "telegram-1" });
    (db.query.splits.findMany as jest.Mock).mockResolvedValue([{ id: "split-1", session_id: "session-1", status: "active" }]);
    (db.query.temp_users.findFirst as jest.Mock).mockResolvedValue({
      id: "temp-1",
      telegram_username: "sabri",
      first_name: "Sabri",
    });
    (db.select as jest.Mock)
      .mockReturnValueOnce(makeSelectMock([]))
      .mockReturnValueOnce(makeSelectMock([]))
      .mockReturnValueOnce(makeSelectMock([]));
    (calculateSessionBalances as jest.Mock).mockReturnValue({
      debts: [{ from: { userId: "user-1" }, to: { tempUserId: "temp-1" }, amount: 450 }],
      balances: [],
      isSettled: false,
    });

    const response = await handlePagueSelect("chat-1", "telegram-1", "pague_select:temp:temp-1");

    expect(setConversationState).toHaveBeenCalledWith("chat-1", "telegram-1", expect.objectContaining({
      step: "pague_payment_type",
      data: expect.objectContaining({
        step: "pague_payment_type",
        debt_amount: 450,
        creditor_user_id: undefined,
        creditor_temp_id: "temp-1",
        session_id: "session-1",
      }),
    }));
    expect(response.text).toContain("¿Cómo querés registrar este pago");
    expect(response.replyMarkup?.inline_keyboard).toEqual([
      [{ text: "💰 Pago total: $450", callback_data: "pague_confirm:full" }],
      [{ text: "📝 Pago parcial", callback_data: "pague_partial:start" }],
      [{ text: "❌ Cancelar", callback_data: "pague_confirm:cancel" }],
    ]);
  });

  it("offers a partial payment option after selecting a debt", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({ id: "session-1", telegram_chat_id: "chat-1", status: "open" });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "user-1", telegram_user_id: "telegram-1" });
    (db.query.splits.findMany as jest.Mock).mockResolvedValue([{ id: "split-1", session_id: "session-1", status: "active" }]);
    (db.query.temp_users.findFirst as jest.Mock).mockResolvedValue({
      id: "temp-1",
      telegram_username: "sabri",
      first_name: "Sabri",
    });
    (db.select as jest.Mock)
      .mockReturnValueOnce(makeSelectMock([]))
      .mockReturnValueOnce(makeSelectMock([]))
      .mockReturnValueOnce(makeSelectMock([]));
    (calculateSessionBalances as jest.Mock).mockReturnValue({
      debts: [{ from: { userId: "user-1" }, to: { tempUserId: "temp-1" }, amount: 4500 }],
      balances: [],
      isSettled: false,
    });

    const response = await handlePagueSelect("chat-1", "telegram-1", "pague_select:temp:temp-1");

    expect(response.text).toContain("¿Cómo querés registrar este pago");
    expect(response.replyMarkup?.inline_keyboard).toEqual([
      [{ text: "💰 Pago total: $4.500", callback_data: "pague_confirm:full" }],
      [{ text: "📝 Pago parcial", callback_data: "pague_partial:start" }],
      [{ text: "❌ Cancelar", callback_data: "pague_confirm:cancel" }],
    ]);
  });

  it("re-asks when partial amount is invalid", async () => {
    const response = await handlePaguePartialAmountInput("chat-1", "telegram-1", "5000", {
      step: "pague_partial_amount",
      debt_amount: 4500,
      creditor_name: "@sabri",
      creditor_temp_id: "temp-1",
      session_id: "session-1",
    });

    expect(setConversationState).not.toHaveBeenCalled();
    expect(response).toEqual({
      text: "❌ El monto debe ser mayor a 0 y no superar $4.500.\n\n¿Cuánto le pagaste a @sabri? (máximo: $4.500)",
    });
  });

  it("stores partial amount and shows remaining debt in confirmation", async () => {
    const response = await handlePaguePartialAmountInput("chat-1", "telegram-1", "2000", {
      step: "pague_partial_amount",
      debt_amount: 5000,
      creditor_name: "Maria",
      creditor_user_id: "user-2",
      session_id: "session-1",
    });

    expect(setConversationState).toHaveBeenCalledWith("chat-1", "telegram-1", {
      step: "pague_confirm",
      data: expect.objectContaining({
        debt_amount: 5000,
        payment_amount: 2000,
        remaining_amount: 3000,
      }),
    });
    expect(response.text).toContain("¿Confirmás que pagaste $2.000 a Maria? (Quedaría pendiente: $3.000)");
  });
});
