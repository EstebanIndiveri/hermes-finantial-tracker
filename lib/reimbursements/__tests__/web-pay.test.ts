import { markReimbursementAsPaidWithNotifications } from "../requests";
import { db } from "@/lib/db/client";
import { telegram_delivery_outbox, telegram_operations } from "@/lib/db/schema";
import { notifyReimbursementPaid } from "@/lib/notifications/telegram";
import { dispatchTelegramDeliveriesForUpdate } from "@/lib/telegram/outbox-dispatcher";

jest.mock("@/lib/db/client", () => ({ db: { transaction: jest.fn() } }));
jest.mock("@/lib/notifications/telegram", () => ({
  ...jest.requireActual("@/lib/notifications/telegram"),
  notifyReimbursementPaid: jest.fn(),
}));
jest.mock("@/lib/telegram/outbox-dispatcher", () => ({ dispatchTelegramDeliveriesForUpdate: jest.fn() }));

const original = {
  TELEGRAM_BOT_ID: process.env.TELEGRAM_BOT_ID,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_INBOX_ENABLED: process.env.TELEGRAM_INBOX_ENABLED,
  TELEGRAM_OUTBOX_ENABLED: process.env.TELEGRAM_OUTBOX_ENABLED,
  TELEGRAM_OUTBOX_WORKER_ENABLED: process.env.TELEGRAM_OUTBOX_WORKER_ENABLED,
  WEB_PUSH_ENABLED: process.env.WEB_PUSH_ENABLED,
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TELEGRAM_BOT_ID = "beta-bot";
  process.env.TELEGRAM_BOT_TOKEN = "123456:synthetic-test-token";
  process.env.TELEGRAM_INBOX_ENABLED = "true";
  process.env.TELEGRAM_OUTBOX_ENABLED = "true";
  process.env.TELEGRAM_OUTBOX_WORKER_ENABLED = "true";
  process.env.WEB_PUSH_ENABLED = "false";
});

afterAll(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function fakeTransaction(options: { pending?: boolean; chat?: string | null; failOutbox?: boolean } = {}) {
  const inserted: Array<{ table: unknown; row: Record<string, unknown> }> = [];
  const selections = [
    options.pending === false ? [] : [{ id: "request-1", transactionId: "expense-1", requesterId: "requester-1", payerId: "payer-1", amount: 2500, status: "pending" }],
    [{ groupId: "group-1", status: "active", deletedAt: null }],
    [{ userId: "payer-1" }],
    [{ name: "Payer" }],
    [{ telegramId: options.chat === undefined ? "requester-chat" : options.chat }],
  ];
  let selection = 0;
  const tx = {
    insert: jest.fn((table: unknown) => ({ values: jest.fn((row: Record<string, unknown>) => {
      inserted.push({ table, row });
      return {
        onConflictDoNothing: jest.fn(async () => {
          if (table === telegram_delivery_outbox && options.failOutbox) throw new Error("outbox failed");
        }),
        then: (resolve: (value: undefined) => unknown, reject: (reason: unknown) => unknown) =>
          (table === telegram_delivery_outbox && options.failOutbox
            ? Promise.reject(new Error("outbox failed")) : Promise.resolve(undefined)).then(resolve, reject),
      };
    }) })),
    select: jest.fn(() => {
      const query = { where: jest.fn(async () => selections[selection++] ?? []) };
      return { from: jest.fn(() => query) };
    }),
    update: jest.fn(() => ({ set: jest.fn(() => ({ returning: jest.fn(() => ({ where: jest.fn(async () => [{ id: "request-1" }]) })) })) })),
  };
  (db.transaction as jest.Mock).mockImplementation(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx));
  return { tx, inserted };
}

it("commits a paid notice intent in the same transaction and dispatches by update", async () => {
  const { inserted } = fakeTransaction();
  await expect(markReimbursementAsPaidWithNotifications("request-1", "payer-1")).resolves.toBe(true);
  expect(inserted).toEqual(expect.arrayContaining([
    expect.objectContaining({ table: telegram_operations, row: expect.objectContaining({ operation_kind: "web.reimbursement.pay", resource_id: "request-1" }) }),
    expect.objectContaining({ table: telegram_delivery_outbox, row: expect.objectContaining({ chat_id: "requester-chat", status: "pending" }) }),
  ]));
  expect(dispatchTelegramDeliveriesForUpdate).toHaveBeenCalledWith({ botId: "beta-bot", updateId: "web-reimbursement-pay:request-1" });
  expect(notifyReimbursementPaid).not.toHaveBeenCalled();
});

it("does not create a second delivery for an already-paid request", async () => {
  const { inserted } = fakeTransaction({ pending: false });
  await expect(markReimbursementAsPaidWithNotifications("request-1", "payer-1")).resolves.toBe(false);
  expect(inserted).toHaveLength(0);
  expect(dispatchTelegramDeliveriesForUpdate).not.toHaveBeenCalled();
});

it("keeps a committed payment successful when inline dispatch is deferred", async () => {
  fakeTransaction();
  (dispatchTelegramDeliveriesForUpdate as jest.Mock).mockRejectedValueOnce(new Error("provider unavailable"));
  const originalError = console.error;
  console.error = jest.fn();
  try {
    await expect(markReimbursementAsPaidWithNotifications("request-1", "payer-1")).resolves.toBe(true);
  } finally {
    console.error = originalError;
  }
  expect(notifyReimbursementPaid).not.toHaveBeenCalled();
});

it("does not dispatch after a Telegram outbox insert failure", async () => {
  fakeTransaction({ failOutbox: true });
  await expect(markReimbursementAsPaidWithNotifications("request-1", "payer-1")).rejects.toThrow("outbox failed");
  expect(notifyReimbursementPaid).not.toHaveBeenCalled();
});

it("commits no Telegram delivery when the requester has no linked chat", async () => {
  const { inserted } = fakeTransaction({ chat: null });
  await expect(markReimbursementAsPaidWithNotifications("request-1", "payer-1")).resolves.toBe(true);
  expect(inserted.some(({ table }) => table === telegram_delivery_outbox)).toBe(false);
  expect(notifyReimbursementPaid).not.toHaveBeenCalled();
});
