import { handleSplitCallback } from "../callback-handler";
import { db } from "@/lib/db/client";
import { getConversationState, setConversationState, clearConversationState } from "../conversation-state";
import { splits, split_payers, split_items, split_payments } from "@/lib/db/schema";
import { handlePagueSelect, startPaguePartialAmount } from "../commands/pague";
import { notifySplitPaymentReceived } from "@/lib/notifications/telegram";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      users: { findFirst: jest.fn() },
      temp_users: { findFirst: jest.fn() },
      split_sessions: { findFirst: jest.fn() },
      split_session_members: { findMany: jest.fn() },
    },
    insert: jest.fn(),
    select: jest.fn(),
    transaction: jest.fn(),
  },
}));

jest.mock("../conversation-state", () => ({
  getConversationState: jest.fn(),
  setConversationState: jest.fn(),
  clearConversationState: jest.fn(),
}));

jest.mock("../commands/pague", () => ({
  handlePagueSelect: jest.fn(),
  handlePaguePartialAmountInput: jest.fn(),
  startPaguePartialAmount: jest.fn(),
}));

jest.mock("@/lib/notifications/telegram", () => ({
  notifySplitPaymentReceived: jest.fn(),
}));

function makeInsertMock() {
  return {
    values: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
  };
}

function makeSelectMock(result: unknown) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(result),
  };
}

describe("handleSplitCallback", () => {
  beforeEach(() => jest.clearAllMocks());

  it("accepts temp-user payers in the who-paid step", async () => {
    (getConversationState as jest.Mock).mockResolvedValue({
      step: "who_paid",
      data: {
        step: "who_paid",
        amount: 1500,
        description: "Sushi",
        session_id: "session-1",
      },
    });
    (db.query.temp_users.findFirst as jest.Mock).mockResolvedValue({
      id: "temp-1",
      telegram_username: "sabri",
      first_name: "Sabri",
    });

    const response = await handleSplitCallback("chat-1", "telegram-1", "paid_by:temp:temp-1");

    expect(setConversationState).toHaveBeenCalledWith("chat-1", "telegram-1", {
      step: "participants",
      data: expect.objectContaining({
        step: "participants",
        payer_user_id: undefined,
        payer_temp_user_id: "temp-1",
        payer_name: "@sabri",
      }),
    });
    expect(response).toEqual(expect.objectContaining({
      edit: true,
      text: expect.stringContaining("(Pagó: @sabri)"),
    }));
  });

  it("creates equal split items for Hermes and temp members and shows debts after creation", async () => {
    const memberInsert = makeInsertMock();
    const txInserts: Array<{ table: unknown; values: unknown }> = [];

    (getConversationState as jest.Mock).mockResolvedValue({
      step: "participants",
      data: {
        step: "participants",
        amount: 900,
        description: "Sushi",
        session_id: "session-1",
        payer_temp_user_id: "temp-payer",
        payer_name: "@sabri",
      },
    });
    (db.insert as jest.Mock).mockReturnValue(memberInsert);
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({ id: "session-1" });
    (db.query.split_session_members.findMany as jest.Mock).mockResolvedValue([
      { session_id: "session-1", user_id: "user-1", temp_user_id: null },
      { session_id: "session-1", user_id: null, temp_user_id: "temp-2" },
    ]);
    (db.select as jest.Mock)
      .mockReturnValueOnce(makeSelectMock([{ id: "user-1", username: "esteban", name: "Esteban" }]))
      .mockReturnValueOnce(makeSelectMock([
        { id: "temp-payer", telegram_username: "sabri", first_name: "Sabri" },
        { id: "temp-2", telegram_username: null, first_name: "Ana" },
      ]));
    (db.transaction as jest.Mock).mockImplementation(async (callback: (tx: any) => Promise<void>) => {
      const tx = {
        insert: jest.fn((table: unknown) => ({
          values: jest.fn(async (values: unknown) => {
            txInserts.push({ table, values });
          }),
        })),
      };
      await callback(tx);
    });

    const response = await handleSplitCallback("chat-1", "telegram-1", "participants:all");

    expect(clearConversationState).toHaveBeenCalledWith("chat-1", "telegram-1");
    expect(memberInsert.values).toHaveBeenCalledWith({
      session_id: "session-1",
      user_id: null,
      temp_user_id: "temp-payer",
      joined_at: expect.any(Number),
    });

    const splitInsert = txInserts.find(entry => entry.table === splits);
    expect(splitInsert?.values).toEqual(expect.objectContaining({
      session_id: "session-1",
      description: "Sushi",
      created_by_user_id: null,
      created_by_temp_id: "temp-payer",
    }));

    const payerInsert = txInserts.find(entry => entry.table === split_payers);
    expect(payerInsert?.values).toEqual(expect.objectContaining({
      user_id: null,
      temp_user_id: "temp-payer",
      amount_paid: 900,
    }));

    const itemEntries = txInserts.filter(entry => entry.table === split_items);
    const flattenedItems = itemEntries.flatMap(entry => Array.isArray(entry.values) ? entry.values : [entry.values]);
    expect(flattenedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ user_id: "user-1", temp_user_id: null, amount_owed: 300 }),
      expect.objectContaining({ user_id: null, temp_user_id: "temp-2", amount_owed: 300 }),
      expect.objectContaining({ user_id: null, temp_user_id: "temp-payer", amount_owed: 300 }),
    ]));

    expect(response).toEqual(expect.objectContaining({
      edit: true,
      text: expect.stringContaining("👥 Dividido entre 3: <b>$300 c/u</b>"),
    }));
    expect(response?.text).toContain("• esteban debe $300 a @sabri");
    expect(response?.text).toContain("• Ana debe $300 a @sabri");
  });

  it("records payments to temp creditors", async () => {
    const paymentInsert = makeInsertMock();
    (getConversationState as jest.Mock).mockResolvedValue({
      step: "pague_confirm",
      data: {
        step: "pague_confirm",
        debt_amount: 450,
        payment_amount: 450,
        remaining_amount: 0,
        creditor_temp_id: "temp-1",
        session_id: "session-1",
      },
    });
    (db.insert as jest.Mock).mockReturnValue(paymentInsert);
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: "user-1",
      telegram_user_id: "telegram-1",
      username: "esteban",
      name: "Esteban",
    });
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({ id: "session-1" });
    (db.query.temp_users.findFirst as jest.Mock).mockResolvedValue({
      id: "temp-1",
      telegram_username: "sabri",
      first_name: "Sabri",
    });

    const response = await handleSplitCallback("chat-1", "telegram-1", "pague_confirm:yes");

    expect(paymentInsert.values).toHaveBeenCalledWith(expect.objectContaining({
      session_id: "session-1",
      payer_user_id: "user-1",
      payer_temp_id: null,
      payee_user_id: null,
      payee_temp_id: "temp-1",
      amount: 450,
    }));
    expect(clearConversationState).toHaveBeenCalledWith("chat-1", "telegram-1");
    expect(response?.text).toContain("@sabri");
    expect(notifySplitPaymentReceived).not.toHaveBeenCalled();
  });

  it("delegates partial payment callback start to pague command handler", async () => {
    (getConversationState as jest.Mock).mockResolvedValue({
      step: "pague_payment_type",
      data: {
        step: "pague_payment_type",
        debt_amount: 450,
        creditor_temp_id: "temp-1",
        creditor_name: "@sabri",
        session_id: "session-1",
      },
    });
    (startPaguePartialAmount as jest.Mock).mockResolvedValue({ text: "ok" });

    await handleSplitCallback("chat-1", "telegram-1", "pague_partial:start");

    expect(startPaguePartialAmount).toHaveBeenCalledWith("chat-1", "telegram-1", expect.objectContaining({
      step: "pague_payment_type",
    }));
  });

  it("rejects partial payment callbacks when state is expired", async () => {
    (getConversationState as jest.Mock).mockResolvedValue(null);

    const response = await handleSplitCallback("chat-1", "telegram-1", "pague_partial:start");

    expect(response).toEqual({
      text: "⏱️ Esta conversación expiró o no es tuya. Usá /pague para comenzar.",
      edit: false,
    });
  });

  it("notifies Hermes creditors with remaining debt after payment", async () => {
    const paymentInsert = makeInsertMock();
    (getConversationState as jest.Mock).mockResolvedValue({
      step: "pague_confirm",
      data: {
        step: "pague_confirm",
        debt_amount: 5000,
        payment_amount: 2000,
        remaining_amount: 3000,
        creditor_user_id: "user-2",
        creditor_name: "Maria",
        session_id: "session-1",
      },
    });
    (db.insert as jest.Mock).mockReturnValue(paymentInsert);
    (db.query.users.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        id: "user-1",
        telegram_user_id: "telegram-1",
        username: "esteban",
        name: "Esteban",
      })
      .mockResolvedValueOnce({
        id: "user-2",
        telegram_user_id: "telegram-2",
        username: "maria",
        name: "Maria",
      });
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({ id: "session-1", name: "Viaje" });

    await handleSplitCallback("chat-1", "telegram-1", "pague_confirm:yes");

    expect(notifySplitPaymentReceived).toHaveBeenCalledWith("user-2", "esteban", 2000, 3000, "Viaje");
  });
});
