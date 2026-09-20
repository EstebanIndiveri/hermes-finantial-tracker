import {
  cancelReimbursementWithNotifications,
  createReimbursementWithNotifications,
  markReimbursementAsPaidWithNotifications,
} from "../requests";
import { db } from "@/lib/db/client";
import { createTelegramOperationContext } from "@/lib/telegram/operation-context";

jest.mock("nanoid", () => ({ nanoid: jest.fn(() => "reimbursement-id") }));

jest.mock("@/lib/db/client", () => ({
  db: { transaction: jest.fn() },
}));

jest.mock("@/lib/notifications/telegram", () => ({
  buildReimbursementRequestNotification: jest.fn(() => ({ text: "request message", replyMarkup: { inline_keyboard: [] } })),
  buildReimbursementPaidNotification: jest.fn(() => ({ text: "paid message" })),
  buildReimbursementCancelledNotification: jest.fn(() => ({ text: "cancelled message" })),
  getUserById: jest.fn(),
  notifyGroupOfReimbursementRequest: jest.fn(),
  notifyReimbursementPaid: jest.fn(),
}));

jest.mock("@/lib/notifications/web-push", () => ({ sendPushToUser: jest.fn() }));

const mockDb = db as jest.Mocked<typeof db>;

function operationContext(action: string) {
  return createTelegramOperationContext({
    botId: "bot-1",
    updateId: `update-${action}`,
    chatId: "chat-1",
    action,
  });
}

function fakeTransaction(selectResults: unknown[][], updateRows: unknown[] = [{ id: "r-1" }]) {
  const insertedValues: unknown[] = [];
  let insertIndex = 0;
  let selectIndex = 0;
  const tx = {
    insertedValues,
    insert: jest.fn(() => {
      const current = insertIndex++;
      return {
        values: jest.fn((values: unknown) => {
          insertedValues.push(values);
          return {
            returning: jest.fn().mockResolvedValue(
              current === 0
                ? [{ operationId: "claimed" }]
                : [{
                    id: "reimbursement-id",
                    transactionId: "tx-1",
                    requesterId: "user-1",
                    payerId: "user-2",
                    amount: 2500,
                    status: "pending",
                    paidAt: null,
                    createdAt: 123,
                  }],
            ),
            onConflictDoNothing: jest.fn(() => ({
              returning: jest.fn().mockResolvedValue([{ operationId: "claimed" }]),
            })),
          };
        }),
      };
    }),
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => Promise.resolve(selectResults[selectIndex++] ?? [])),
        innerJoin: jest.fn(() => ({
          where: jest.fn(() => Promise.resolve(selectResults[selectIndex++] ?? [])),
        })),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => {
        const chain: {
          where: jest.Mock;
          returning: jest.Mock;
          then: Promise<unknown[]>["then"];
        } = {
          where: jest.fn(() => chain),
          returning: jest.fn(() => chain),
          then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
            Promise.resolve(updateRows).then(resolve, reject),
        };
        return chain;
      }),
    })),
  };
  return tx;
}

describe("reimbursement operation-aware writers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates the reimbursement and one durable Telegram row per recipient atomically", async () => {
    const tx = fakeTransaction([
      [{ description: "Cena", groupId: "group-1", categoryId: "cat-1", userId: "user-1" }],
      [{ userId: "user-1" }],
      [{ name: "Comida" }],
      [{ name: "Ana" }],
      [{ paymentMethod: "alias", value: "ana@example" }],
      [
        { userId: "user-1", telegramId: "100" },
        { userId: "user-2", telegramId: "200" },
        { userId: "user-3", telegramId: null },
      ],
    ]);
    (mockDb.transaction as jest.Mock).mockImplementation(async (work: (value: unknown) => Promise<unknown>) => work(tx));

    const result = await createReimbursementWithNotifications(
      "tx-1", "user-1", 2500, "user-2", operationContext("create"),
    );

    expect(result).toEqual(expect.objectContaining({ id: "reimbursement-id" }));
    expect(tx.insertedValues).toHaveLength(4);
    expect(tx.insertedValues[1]).toEqual(expect.objectContaining({ operationId: expect.stringMatching(/^tgop_v1_/) }));
    expect(tx.insertedValues[2]).toEqual(expect.objectContaining({
      action: "send_message",
      chat_id: "chat-1",
      operation_id: expect.stringMatching(/^tgop_v1_/),
    }));
    expect(tx.insertedValues[3]).toEqual(expect.objectContaining({
      action: "send_message",
      chat_id: "200",
      operation_id: expect.stringMatching(/^tgop_v1_/),
    }));
  });

  it("rejects creation when the transaction is not owned by the requester", async () => {
    const tx = fakeTransaction([
      [{ description: "Cena", groupId: "group-1", categoryId: "cat-1", userId: "someone-else" }],
    ]);
    (mockDb.transaction as jest.Mock).mockImplementation(
      async (work: (value: unknown) => Promise<unknown>) => work(tx),
    );

    await expect(createReimbursementWithNotifications(
      "tx-1", "user-1", 2500, "user-2", operationContext("create-owner"),
    )).resolves.toEqual({ error: "El gasto no pertenece al solicitante." });
    expect(tx.insertedValues).toHaveLength(1);
  });

  it("pays once, queues the requester notification, and does not push again on reuse", async () => {
    const tx = fakeTransaction([
      [{ id: "r-1", transactionId: "tx-1", requesterId: "user-1", payerId: "user-2", amount: 4500, status: "pending" }],
      [{ groupId: "group-1" }],
      [{ userId: "user-2" }],
      [{ name: "Beto" }],
      [{ telegramId: "100" }],
    ]);
    (mockDb.transaction as jest.Mock).mockImplementation(async (work: (value: unknown) => Promise<unknown>) => work(tx));

    await expect(markReimbursementAsPaidWithNotifications("r-1", "user-2", operationContext("pay"))).resolves.toEqual(
      expect.objectContaining({ ok: true, deliveryOperationId: expect.stringMatching(/^tgop_v1_/) }),
    );
    expect(tx.insertedValues).toHaveLength(3);
    expect(tx.insertedValues[1]).toEqual(expect.objectContaining({ chat_id: "100", action: "send_message" }));
    expect(tx.insertedValues[2]).toEqual(expect.objectContaining({ chat_id: "chat-1", action: "send_message" }));
  });

  it("rejects payment when the payer is no longer a group member", async () => {
    const tx = fakeTransaction([
      [{ id: "r-1", transactionId: "tx-1", requesterId: "user-1", payerId: "user-2", amount: 4500, status: "pending" }],
      [{ groupId: "group-1" }],
      [],
    ]);
    (mockDb.transaction as jest.Mock).mockImplementation(
      async (work: (value: unknown) => Promise<unknown>) => work(tx),
    );

    await expect(markReimbursementAsPaidWithNotifications(
      "r-1", "user-2", operationContext("pay-removed"),
    )).resolves.toEqual({ ok: false });
    expect(tx.insertedValues).toHaveLength(1);
  });

  it("cancels and queues group notifications without calling Telegram directly", async () => {
    const tx = fakeTransaction([
      [{ id: "r-1", transactionId: "tx-1", requesterId: "user-1", payerId: null, amount: 1800, status: "pending" }],
      [{ groupId: "group-1" }],
      [{ userId: "user-1" }],
      [{ name: "Ana" }],
      [{ userId: "user-2", telegramId: "200" }],
    ]);
    (mockDb.transaction as jest.Mock).mockImplementation(async (work: (value: unknown) => Promise<unknown>) => work(tx));

    await expect(cancelReimbursementWithNotifications("r-1", "user-1", operationContext("cancel"))).resolves.toEqual(
      expect.objectContaining({ ok: true, deliveryOperationId: expect.stringMatching(/^tgop_v1_/) }),
    );
    expect(tx.insertedValues).toHaveLength(3);
    expect(tx.insertedValues[1]).toEqual(expect.objectContaining({ chat_id: "200", action: "send_message" }));
    expect(tx.insertedValues[2]).toEqual(expect.objectContaining({ chat_id: "chat-1", action: "send_message" }));
  });

  it("rejects cancellation when the requester is no longer a group member", async () => {
    const tx = fakeTransaction([
      [{ id: "r-1", transactionId: "tx-1", requesterId: "user-1", payerId: null, amount: 1800, status: "pending" }],
      [{ groupId: "group-1" }],
      [],
    ]);
    (mockDb.transaction as jest.Mock).mockImplementation(
      async (work: (value: unknown) => Promise<unknown>) => work(tx),
    );

    await expect(cancelReimbursementWithNotifications(
      "r-1", "user-1", operationContext("cancel-removed"),
    )).resolves.toEqual({ ok: false });
    expect(tx.insertedValues).toHaveLength(1);
  });
});
