import { createVerifiedWebReimbursement } from "../requests";
import { db } from "@/lib/db/client";
import { notifyGroupOfReimbursementRequest } from "@/lib/notifications/telegram";

jest.mock("nanoid", () => ({ nanoid: jest.fn(() => "new-request") }));
jest.mock("@/lib/db/client", () => ({ db: { transaction: jest.fn() } }));
jest.mock("@/lib/notifications/telegram", () => ({
  notifyGroupOfReimbursementRequest: jest.fn(),
}));
jest.mock("@/lib/notifications/web-push", () => ({ sendPushToUser: jest.fn() }));

const expense = {
  userId: "user-1", groupId: "group-1", categoryId: "cat-1", amountArs: 2500,
  description: "Cena", status: "active", deletedAt: null,
};

function fakeTransaction(selectResults: unknown[][]) {
  let selected = 0;
  const insertedValues: unknown[] = [];
  const tx = {
    insertedValues,
    select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(async () => selectResults[selected++] ?? []) })) })),
    insert: jest.fn(() => ({ values: jest.fn((values: unknown) => {
      insertedValues.push(values);
      return { returning: jest.fn(async () => [{
        id: "new-request", transactionId: "tx-1", requesterId: "user-1",
        payerId: null, amount: 2500, status: "pending", paidAt: null, createdAt: 123,
      }]) };
    }) })),
  };
  (db.transaction as jest.Mock).mockImplementation(async (work: (value: typeof tx) => Promise<unknown>) => work(tx));
  return tx;
}

beforeEach(() => jest.clearAllMocks());

it("rejects another user's expense before any write or notification", async () => {
  const tx = fakeTransaction([[{ ...expense, userId: "other" }]]);
  await expect(createVerifiedWebReimbursement("tx-1", "user-1", 2500)).resolves.toEqual({
    error: "El gasto no está activo o no pertenece al solicitante.",
  });
  expect(tx.insertedValues).toHaveLength(0);
  expect(notifyGroupOfReimbursementRequest).not.toHaveBeenCalled();
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

it("derives the ARS amount and notifies only after the immediate transaction commits", async () => {
  const tx = fakeTransaction([
    [expense], [{ userId: "user-1" }], [], [{ partnerId: null }], [{ name: "Comida" }],
  ]);
  const result = await createVerifiedWebReimbursement("tx-1", "user-1");
  expect(result).toEqual(expect.objectContaining({ id: "new-request", amount: 2500 }));
  expect(tx.insertedValues).toEqual([expect.objectContaining({ amount: 2500, transactionId: "tx-1" })]);
  expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), { behavior: "immediate" });
  expect(notifyGroupOfReimbursementRequest).toHaveBeenCalledWith(
    "group-1", "user-1", "new-request", 2500, "Comida", "Cena",
  );
});
