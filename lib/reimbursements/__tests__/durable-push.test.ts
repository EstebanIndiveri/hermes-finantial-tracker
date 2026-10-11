import { enqueueReimbursementPushDeliveries } from "../requests";
import { enqueuePushDelivery } from "@/lib/notifications/push-outbox";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({ db: { transaction: jest.fn() } }));
jest.mock("@/lib/notifications/telegram", () => ({
  buildReimbursementCancelledNotification: jest.fn(),
  buildReimbursementPaidNotification: jest.fn(),
  buildReimbursementRequestNotification: jest.fn(),
  getUserById: jest.fn(),
  notifyGroupOfReimbursementRequest: jest.fn().mockResolvedValue(undefined),
  notifyReimbursementPaid: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/notifications/push-outbox", () => ({
  enqueuePushDelivery: jest.fn().mockResolvedValue({}),
}));

const originalWebPush = process.env.WEB_PUSH_ENABLED;
const originalNotifications = process.env.NOTIFICATIONS_ENABLED;

afterEach(() => {
  if (originalWebPush === undefined) delete process.env.WEB_PUSH_ENABLED;
  else process.env.WEB_PUSH_ENABLED = originalWebPush;
  if (originalNotifications === undefined) delete process.env.NOTIFICATIONS_ENABLED;
  else process.env.NOTIFICATIONS_ENABLED = originalNotifications;
  jest.clearAllMocks();
});

function transactionWithSubscriptions(ids: string[]) {
  const query = {
    from: jest.fn(() => query),
    where: jest.fn(async () => ids.map((id) => ({ id }))),
  };
  return { select: jest.fn(() => query) };
}

function durableTransactionMock(selectResults: unknown[][], insertedRequest?: unknown, updated = true) {
  let selectIndex = 0;
  const tx = {
    select: jest.fn(() => {
      const query = {
        from: jest.fn(() => query),
        where: jest.fn(async () => selectResults[selectIndex++] ?? []),
      };
      return query;
    }),
    insert: jest.fn(() => ({ values: jest.fn(() => ({ returning: jest.fn(async () => [insertedRequest]) })) })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        returning: jest.fn(() => ({ where: jest.fn(async () => updated ? [{ id: "r-1" }] : []) })),
      })),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(async (work: (transaction: unknown) => Promise<unknown>) => work(tx));
  return tx;
}

it("requires both gates and does not read subscriptions when disabled", async () => {
  process.env.WEB_PUSH_ENABLED = "false";
  process.env.NOTIFICATIONS_ENABLED = "true";
  const transaction = transactionWithSubscriptions(["sub-1"]);

  await expect(enqueueReimbursementPushDeliveries(
    transaction as never,
    "operation-1",
    "reimbursement.requested",
    "request-1",
    "payer-1",
  )).resolves.toBe(false);
  expect(transaction.select).not.toHaveBeenCalled();
  expect(enqueuePushDelivery).not.toHaveBeenCalled();
});

it("enqueues one deterministic metadata-only intent per subscription", async () => {
  process.env.WEB_PUSH_ENABLED = "true";
  process.env.NOTIFICATIONS_ENABLED = "true";
  const transaction = transactionWithSubscriptions(["sub-1", "sub-2"]);

  await expect(enqueueReimbursementPushDeliveries(
    transaction as never,
    "operation-1",
    "reimbursement.paid",
    "request-1",
    "requester-1",
  )).resolves.toBe(true);

  expect(enqueuePushDelivery).toHaveBeenNthCalledWith(1, transaction, {
    operationId: "operation-1",
    deliveryKey: "operation-1:web-push:reimbursement.paid:sub-1",
    eventType: "reimbursement.paid",
    reimbursementId: "request-1",
    userId: "requester-1",
    subscriptionId: "sub-1",
  });
  expect(enqueuePushDelivery).toHaveBeenNthCalledWith(2, transaction, expect.objectContaining({
    deliveryKey: "operation-1:web-push:reimbursement.paid:sub-2",
  }));
});

it("uses the durable transaction for no-context create and suppresses inline push", async () => {
  process.env.WEB_PUSH_ENABLED = "true";
  process.env.NOTIFICATIONS_ENABLED = "true";
  const transaction = durableTransactionMock(
    [[{ description: "Cena", groupId: "group-1", categoryId: "cat-1", userId: "requester-1", status: "active", deletedAt: null }], [{ userId: "requester-1" }], [{ userId: "payer-1" }], [{ id: "sub-payer" }]],
    { id: "r-1", transactionId: "tx-1", requesterId: "requester-1", payerId: "payer-1", amount: 2500, status: "pending", paidAt: null, createdAt: 1 },
  );
  const { createReimbursementWithNotifications } = await import("../requests");
  const result = await createReimbursementWithNotifications("tx-1", "requester-1", 2500, "payer-1");
  expect(result).toMatchObject({ id: "r-1" });
  expect(db.transaction).toHaveBeenCalled();
  expect(transaction.update).not.toHaveBeenCalled();
  expect(enqueuePushDelivery).toHaveBeenCalledWith(transaction, expect.objectContaining({ eventType: "reimbursement.requested", userId: "payer-1" }));
});

it("uses the durable transaction for no-context pay", async () => {
  process.env.WEB_PUSH_ENABLED = "true";
  process.env.NOTIFICATIONS_ENABLED = "true";
  const transaction = durableTransactionMock(
    [[{ id: "r-1", transactionId: "tx-1", requesterId: "requester-1", payerId: "payer-1", amount: 2500, status: "pending" }], [{ groupId: "group-1", status: "active", deletedAt: null }], [{ userId: "payer-1" }], [{ id: "sub-requester" }], [{ name: "Payer" }]],
  );
  const { markReimbursementAsPaidWithNotifications } = await import("../requests");
  const result = await markReimbursementAsPaidWithNotifications("r-1", "payer-1");
  expect(result).toBe(true);
  expect(enqueuePushDelivery).toHaveBeenCalledWith(transaction, expect.objectContaining({ eventType: "reimbursement.paid", reimbursementId: "r-1", userId: "requester-1" }));
});

it.each([
  ["inactive expense", { status: "cancelled", deletedAt: null }, []],
  ["deleted expense", { status: "active", deletedAt: 123 }, []],
  ["groupless expense with explicit payer", { status: "active", deletedAt: null, groupId: null }, ["payer-1"]],
] as const)("rejects durable create for %s", async (_label, state, payerIds) => {
  process.env.WEB_PUSH_ENABLED = "true";
  process.env.NOTIFICATIONS_ENABLED = "true";
  const transaction = durableTransactionMock([[{
    description: "Cena", groupId: "group-1", categoryId: "cat-1", userId: "requester-1", ...state,
  }], ...([] as unknown[][])]);
  const { createReimbursementWithNotifications } = await import("../requests");
  await expect(createReimbursementWithNotifications("tx-1", "requester-1", 2500, payerIds[0])).resolves.toHaveProperty("error");
  expect(transaction.insert).not.toHaveBeenCalled();
  expect(enqueuePushDelivery).not.toHaveBeenCalled();
});

it("rejects durable create when the payer is not a current group member", async () => {
  process.env.WEB_PUSH_ENABLED = "true";
  process.env.NOTIFICATIONS_ENABLED = "true";
  const transaction = durableTransactionMock([
    [{ description: "Cena", groupId: "group-1", categoryId: "cat-1", userId: "requester-1", status: "active", deletedAt: null }],
    [{ userId: "requester-1" }],
    [],
  ]);
  const { createReimbursementWithNotifications } = await import("../requests");
  await expect(createReimbursementWithNotifications("tx-1", "requester-1", 2500, "outsider")).resolves.toEqual({ error: "El pagador no pertenece al grupo del gasto." });
  expect(transaction.insert).not.toHaveBeenCalled();
});

it.each([
  ["groupless", { groupId: null, status: "active", deletedAt: null }],
  ["inactive", { groupId: "group-1", status: "cancelled", deletedAt: null }],
  ["deleted", { groupId: "group-1", status: "active", deletedAt: 123 }],
] as const)("rejects durable pay for %s source transaction", async (_label, sourceState) => {
  process.env.WEB_PUSH_ENABLED = "true";
  process.env.NOTIFICATIONS_ENABLED = "true";
  const transaction = durableTransactionMock([
    [{ id: "r-1", transactionId: "tx-1", requesterId: "requester-1", payerId: "payer-1", amount: 2500, status: "pending" }],
    [sourceState],
  ]);
  const { markReimbursementAsPaidWithNotifications } = await import("../requests");
  await expect(markReimbursementAsPaidWithNotifications("r-1", "payer-1")).resolves.toBe(false);
  expect(transaction.update).not.toHaveBeenCalled();
  expect(enqueuePushDelivery).not.toHaveBeenCalled();
});
