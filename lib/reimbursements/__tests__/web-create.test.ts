import { createVerifiedWebReimbursement } from "../requests";
import { db } from "@/lib/db/client";
import { telegram_delivery_outbox, telegram_operations } from "@/lib/db/schema";
import { resolveTelegramBotId } from "@/lib/telegram/update-inbox";
import { notifyGroupOfReimbursementRequest } from "@/lib/notifications/telegram";
import { sendPushToUser } from "@/lib/notifications/web-push";
import { dispatchTelegramDeliveriesForUpdate } from "@/lib/telegram/outbox-dispatcher";

jest.mock("nanoid", () => ({ nanoid: jest.fn(() => "new-request") }));
jest.mock("@/lib/db/client", () => ({ db: { transaction: jest.fn() } }));
jest.mock("@/lib/notifications/telegram", () => ({
  ...jest.requireActual("@/lib/notifications/telegram"),
  notifyGroupOfReimbursementRequest: jest.fn(),
}));
jest.mock("@/lib/notifications/web-push", () => ({ sendPushToUser: jest.fn() }));
jest.mock("@/lib/telegram/outbox-dispatcher", () => ({ dispatchTelegramDeliveriesForUpdate: jest.fn() }));

const expense = {
  userId: "user-1", groupId: "group-1", categoryId: "cat-1", amountArs: 2500,
  description: "Cena", status: "active", deletedAt: null,
};

function fakeTransaction(selectResults: unknown[][], options?: { failOutbox?: boolean }) {
  let selected = 0;
  const insertedValues: unknown[] = [];
  const insertedTables: unknown[] = [];
  const tx = {
    insertedValues,
    insertedTables,
    select: jest.fn(() => {
      const query = {
        where: jest.fn(async () => selectResults[selected++] ?? []),
        innerJoin: jest.fn(() => query),
      };
      return { from: jest.fn(() => query) };
    }),
    insert: jest.fn((table: unknown) => ({ values: jest.fn((values: unknown) => {
      insertedTables.push(table);
      insertedValues.push(values);
      const isOutbox = table === telegram_delivery_outbox;
      const builder = {
        onConflictDoNothing: jest.fn(() => builder),
        returning: jest.fn(async () => isOutbox
          ? (options?.failOutbox ? Promise.reject(new Error("simulated outbox insert failure")) : [])
          : [{ id: "new-request", transactionId: "tx-1", requesterId: "user-1", payerId: null, amount: 2500, status: "pending", paidAt: null, createdAt: 123 }]),
        then: (resolve: (value: undefined) => unknown, reject: (reason: unknown) => unknown) =>
          (isOutbox && options?.failOutbox
            ? Promise.reject(new Error("simulated outbox insert failure"))
            : Promise.resolve(undefined)).then(resolve, reject),
      };
      return builder;
    }) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ returning: jest.fn(async () => [{ operationId: "web-operation" }]) })) })) })),
  };
  (db.transaction as jest.Mock).mockImplementation(async (work: (value: typeof tx) => Promise<unknown>) => work(tx));
  return tx;
}

const originalEnvironment = {
  TELEGRAM_BOT_ID: process.env.TELEGRAM_BOT_ID,
  TELEGRAM_OUTBOX_ENABLED: process.env.TELEGRAM_OUTBOX_ENABLED,
  TELEGRAM_INBOX_ENABLED: process.env.TELEGRAM_INBOX_ENABLED,
  TELEGRAM_OUTBOX_WORKER_ENABLED: process.env.TELEGRAM_OUTBOX_WORKER_ENABLED,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  NOTIFICATIONS_ENABLED: process.env.NOTIFICATIONS_ENABLED,
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.TELEGRAM_BOT_ID;
  delete process.env.TELEGRAM_OUTBOX_ENABLED;
  delete process.env.TELEGRAM_INBOX_ENABLED;
  delete process.env.TELEGRAM_OUTBOX_WORKER_ENABLED;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.NOTIFICATIONS_ENABLED;
});

afterAll(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

it("rejects another user's expense before any write or notification", async () => {
  const tx = fakeTransaction([[{ ...expense, userId: "other" }]]);
  await expect(createVerifiedWebReimbursement("tx-1", "user-1", 2500)).resolves.toEqual({
    error: "El gasto no está activo o no pertenece al solicitante.",
  });
  expect(tx.insertedValues).toHaveLength(0);
  expect(tx.insertedTables).toHaveLength(0);
});

it("rejects a forged amount and a deleted expense", async () => {
  const tx = fakeTransaction([[expense]]);
  await expect(createVerifiedWebReimbursement("tx-1", "user-1", 2501)).resolves.toEqual({
    error: "El importe solicitado no coincide con el gasto en ARS.",
  });
  expect(tx.insertedValues).toHaveLength(0);
  fakeTransaction([[{ ...expense, deletedAt: 1 }]]);
  await expect(createVerifiedWebReimbursement("tx-1", "user-1", 2500)).resolves.toHaveProperty("error");
});

it("rejects an ex-member, a duplicate pending request and an outsider payer", async () => {
  let tx = fakeTransaction([[expense], []]);
  await expect(createVerifiedWebReimbursement("tx-1", "user-1", 2500)).resolves.toHaveProperty("error");
  expect(tx.insertedValues).toHaveLength(0);

  tx = fakeTransaction([[expense], [{ userId: "user-1" }], [{ id: "pending" }]]);
  await expect(createVerifiedWebReimbursement("tx-1", "user-1", 2500)).resolves.toEqual({
    error: "Ya existe un reintegro pendiente para este gasto.",
  });
  expect(tx.insertedValues).toHaveLength(0);

  tx = fakeTransaction([[expense], [{ userId: "user-1" }], [], []]);
  await expect(createVerifiedWebReimbursement("tx-1", "user-1", 2500, "outsider")).resolves.toEqual({
    error: "El pagador no pertenece al grupo del gasto.",
  });
  expect(tx.insertedValues).toHaveLength(0);
});

it("derives the ARS amount and enqueues Telegram delivery in the immediate transaction", async () => {
  process.env.TELEGRAM_BOT_ID = "beta-bot";
  process.env.TELEGRAM_BOT_TOKEN = "123456:synthetic-test-token";
  process.env.TELEGRAM_OUTBOX_ENABLED = "true";
  process.env.TELEGRAM_INBOX_ENABLED = "true";
  process.env.TELEGRAM_OUTBOX_WORKER_ENABLED = "true";
  const tx = fakeTransaction([
    [expense], [{ userId: "user-1" }], [], [{ partnerId: null }], [{ name: "Comida" }],
    [{ name: "Requester" }], [{ paymentMethod: "efectivo", value: null }],
    [{ userId: "user-1", telegramId: "requester-chat" }, { userId: "payer-1", telegramId: "payer-chat" }],
  ]);
  const result = await createVerifiedWebReimbursement("tx-1", "user-1");
  expect(result).toEqual(expect.objectContaining({ id: "new-request", amount: 2500 }));
  expect(tx.insertedValues).toEqual(expect.arrayContaining([
    expect.objectContaining({ amount: 2500, transactionId: "tx-1" }),
    expect.objectContaining({ operation_id: expect.any(String), operation_kind: "web.reimbursement.create" }),
    expect.objectContaining({ chat_id: "payer-chat", status: "pending", text: expect.stringContaining("ARS $2.500") }),
  ]));
  expect(tx.insertedValues.some((row) => (row as { chat_id?: string }).chat_id === "requester-chat")).toBe(false);
  expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), { behavior: "immediate" });
  expect(resolveTelegramBotId()).toBe("beta-bot");
  expect(dispatchTelegramDeliveriesForUpdate).toHaveBeenCalledWith({
    botId: "beta-bot",
    updateId: expect.stringMatching(/^web-reimbursement:/),
  });
});

it("queues financial reimbursement notices when proactive notifications are disabled", async () => {
  process.env.TELEGRAM_BOT_ID = "beta-bot";
  process.env.TELEGRAM_BOT_TOKEN = "123456:synthetic-test-token";
  process.env.TELEGRAM_OUTBOX_ENABLED = "true";
  process.env.TELEGRAM_INBOX_ENABLED = "true";
  process.env.TELEGRAM_OUTBOX_WORKER_ENABLED = "true";
  process.env.NOTIFICATIONS_ENABLED = "false";
  const tx = fakeTransaction([
    [expense], [{ userId: "user-1" }], [], [{ partnerId: null }], [{ name: "Comida" }],
    [{ name: "Requester" }], [{ paymentMethod: "efectivo", value: null }],
    [{ userId: "payer-1", telegramId: "payer-chat" }],
  ]);

  await expect(createVerifiedWebReimbursement("tx-1", "user-1")).resolves.toHaveProperty("id", "new-request");
  expect(tx.insertedValues).toEqual(expect.arrayContaining([
    expect.objectContaining({ operation_kind: "web.reimbursement.create" }),
    expect.objectContaining({ chat_id: "payer-chat", status: "pending" }),
  ]));
  expect(dispatchTelegramDeliveriesForUpdate).toHaveBeenCalledWith({
    botId: "beta-bot",
    updateId: expect.stringMatching(/^web-reimbursement:/),
  });
  expect(notifyGroupOfReimbursementRequest).not.toHaveBeenCalled();
});

it("rejects the transaction when the durable Telegram outbox insert fails", async () => {
  process.env.TELEGRAM_BOT_ID = "beta-bot";
  process.env.TELEGRAM_BOT_TOKEN = "123456:synthetic-test-token";
  process.env.TELEGRAM_OUTBOX_ENABLED = "true";
  process.env.TELEGRAM_INBOX_ENABLED = "true";
  process.env.TELEGRAM_OUTBOX_WORKER_ENABLED = "true";
  const tx = fakeTransaction([
    [expense], [{ userId: "user-1" }], [], [{ partnerId: null }], [{ name: "Comida" }],
    [{ name: "Requester" }], [{ paymentMethod: "efectivo", value: null }],
    [{ userId: "payer-1", telegramId: "payer-chat" }],
  ], { failOutbox: true });
  await expect(createVerifiedWebReimbursement("tx-1", "user-1")).rejects.toThrow("simulated outbox insert failure");
  expect(tx.insertedValues).toEqual(expect.arrayContaining([
    expect.objectContaining({ amount: 2500, transactionId: "tx-1" }),
  ]));
  expect(tx.insertedTables).toContain(telegram_delivery_outbox);
});

it("does not create another request when an HTTP retry finds an existing pending request", async () => {
  process.env.TELEGRAM_BOT_ID = "beta-bot";
  process.env.TELEGRAM_BOT_TOKEN = "123456:synthetic-test-token";
  process.env.TELEGRAM_OUTBOX_ENABLED = "true";
  process.env.TELEGRAM_INBOX_ENABLED = "true";
  process.env.TELEGRAM_OUTBOX_WORKER_ENABLED = "true";
  const tx = fakeTransaction([[expense], [{ userId: "user-1" }], [{ id: "pending-request" }]]);
  await expect(createVerifiedWebReimbursement("tx-1", "user-1")).resolves.toHaveProperty("error");
  expect(tx.insertedTables).toHaveLength(0);
});

it("preserves the legacy post-commit notification path when the worker lane is disabled", async () => {
  const tx = fakeTransaction([
    [expense], [{ userId: "user-1" }], [], [{ partnerId: null }], [{ name: "Comida" }],
  ]);
  await expect(createVerifiedWebReimbursement("tx-1", "user-1")).resolves.toHaveProperty("id", "new-request");
  expect(tx.insertedTables).not.toContain(telegram_operations);
  expect(tx.insertedTables).not.toContain(telegram_delivery_outbox);
  expect(notifyGroupOfReimbursementRequest).toHaveBeenCalledWith(
    "group-1", "user-1", "new-request", 2500, "Comida", "Cena",
  );
});

it("returns the committed request when inline Telegram dispatch throws", async () => {
  process.env.TELEGRAM_BOT_ID = "beta-bot";
  process.env.TELEGRAM_BOT_TOKEN = "123456:synthetic-test-token";
  process.env.TELEGRAM_OUTBOX_ENABLED = "true";
  process.env.TELEGRAM_INBOX_ENABLED = "true";
  process.env.TELEGRAM_OUTBOX_WORKER_ENABLED = "true";
  (dispatchTelegramDeliveriesForUpdate as jest.Mock).mockRejectedValueOnce(new Error("database unavailable"));
  fakeTransaction([
    [expense], [{ userId: "user-1" }], [], [{ partnerId: null }], [{ name: "Comida" }],
    [{ name: "Requester" }], [{ paymentMethod: "efectivo", value: null }],
    [{ userId: "payer-1", telegramId: "payer-chat" }],
  ]);
  await expect(createVerifiedWebReimbursement("tx-1", "user-1")).resolves.toEqual(
    expect.objectContaining({ id: "new-request", amount: 2500 }),
  );
});

it("returns the committed request when best-effort Web Push throws", async () => {
  process.env.TELEGRAM_BOT_ID = "beta-bot";
  process.env.TELEGRAM_BOT_TOKEN = "123456:synthetic-test-token";
  process.env.TELEGRAM_OUTBOX_ENABLED = "true";
  process.env.TELEGRAM_INBOX_ENABLED = "true";
  process.env.TELEGRAM_OUTBOX_WORKER_ENABLED = "true";
  (sendPushToUser as jest.Mock).mockRejectedValueOnce(new Error("push unavailable"));
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => undefined);
  fakeTransaction([
    [expense], [{ userId: "user-1" }], [], [{ partnerId: "payer-1" }], [{ userId: "payer-1" }],
    [{ name: "Comida" }], [{ name: "Requester" }], [{ paymentMethod: "efectivo", value: null }],
    [{ userId: "payer-1", telegramId: "payer-chat" }],
  ]);

  await expect(createVerifiedWebReimbursement("tx-1", "user-1")).resolves.toEqual(
    expect.objectContaining({ id: "new-request", amount: 2500 }),
  );
  expect(errorLog).toHaveBeenCalledWith("Web reimbursement push deferred", "Error");
  errorLog.mockRestore();
});
