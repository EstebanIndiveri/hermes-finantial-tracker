import {
  cancelReimbursement,
  createReimbursementWithNotifications,
  createReimbursementRequest,
  getPendingReimbursementsForPayer,
  getReimbursementById,
  getReimbursementsByUser,
  markReimbursementAsPaidWithNotifications,
  markReimbursementAsPaid,
} from "../requests";
import { db } from "@/lib/db/client";

jest.mock("nanoid", () => ({
  nanoid: jest.fn(() => "reimbursement-id"),
}));

jest.mock("@/lib/db/client", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock("@/lib/notifications/telegram", () => ({
  getUserById: jest.fn(),
  notifyGroupOfReimbursementRequest: jest.fn(),
  notifyReimbursementPaid: jest.fn(),
}));

jest.mock("@/lib/notifications/web-push", () => ({
  sendPushToUser: jest.fn(),
}));

const mockDb = db as jest.Mocked<typeof db>;
const {
  getUserById,
  notifyGroupOfReimbursementRequest,
  notifyReimbursementPaid,
} = require("@/lib/notifications/telegram");
const { sendPushToUser } = require("@/lib/notifications/web-push");

describe("reimbursement requests helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a pending reimbursement request mapped to the public shape", async () => {
    const returning = jest.fn().mockResolvedValue([
      {
        id: "reimbursement-id",
        transactionId: "tx-1",
        requesterId: "user-1",
        payerId: null,
        amount: 2500,
        status: "pending",
        paidAt: null,
        createdAt: 123456,
      },
    ]);
    const values = jest.fn(() => ({ returning }));
    (mockDb.insert as jest.Mock).mockReturnValue({ values });

    await expect(createReimbursementRequest("tx-1", "user-1", 2500)).resolves.toEqual({
      id: "reimbursement-id",
      transactionId: "tx-1",
      requesterId: "user-1",
      payerId: null,
      amount: 2500,
      status: "pending",
      paidAt: null,
      createdAt: 123456,
    });
  });

  it("creates a reimbursement and notifies the group and assigned payer", async () => {
    const returning = jest.fn().mockResolvedValue([
      {
        id: "reimbursement-id",
        transactionId: "tx-1",
        requesterId: "user-1",
        payerId: "user-2",
        amount: 2500,
        status: "pending",
        paidAt: null,
        createdAt: 123456,
      },
    ]);
    const values = jest.fn(() => ({ returning }));
    (mockDb.insert as jest.Mock).mockReturnValue({ values });
    (mockDb.select as jest.Mock)
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn().mockResolvedValue([
            { description: "Cena", groupId: "group-1", categoryId: "cat-1" },
          ]),
        })),
      })
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn().mockResolvedValue([{ name: "Comida" }]),
        })),
      });

    await expect(
      createReimbursementWithNotifications("tx-1", "user-1", 2500, "user-2"),
    ).resolves.toEqual({
      id: "reimbursement-id",
      transactionId: "tx-1",
      requesterId: "user-1",
      payerId: "user-2",
      amount: 2500,
      status: "pending",
      paidAt: null,
      createdAt: 123456,
    });

    expect(notifyGroupOfReimbursementRequest).toHaveBeenCalledWith(
      "group-1",
      "user-1",
      2500,
      "Comida",
      "Cena",
    );
    expect(sendPushToUser).toHaveBeenCalledWith("user-2", {
      title: "💸 Solicitud de Reintegro",
      body: "Te han solicitado $2.500",
      url: "/dashboard/reimbursements",
    });
  });

  it("returns the reimbursement without notifications when the transaction has no group", async () => {
    const returning = jest.fn().mockResolvedValue([
      {
        id: "reimbursement-id",
        transactionId: "tx-1",
        requesterId: "user-1",
        payerId: "user-2",
        amount: 2500,
        status: "pending",
        paidAt: null,
        createdAt: 123456,
      },
    ]);
    const values = jest.fn(() => ({ returning }));
    (mockDb.insert as jest.Mock).mockReturnValue({ values });
    (mockDb.select as jest.Mock).mockReturnValueOnce({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([{ description: "Cena", groupId: null, categoryId: "cat-1" }]),
      })),
    });

    await expect(
      createReimbursementWithNotifications("tx-1", "user-1", 2500, "user-2"),
    ).resolves.toEqual({
      id: "reimbursement-id",
      transactionId: "tx-1",
      requesterId: "user-1",
      payerId: "user-2",
      amount: 2500,
      status: "pending",
      paidAt: null,
      createdAt: 123456,
    });

    expect(notifyGroupOfReimbursementRequest).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("marks a reimbursement as paid and notifies the requester", async () => {
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([
          {
            id: "r-1",
            transactionId: "tx-1",
            requesterId: "user-1",
            payerId: "user-2",
            amount: 4500,
            status: "pending",
            paidAt: null,
            createdAt: 321,
          },
        ]),
      })),
    });
    const where = jest.fn().mockResolvedValue([{ id: "r-1" }]);
    const returning = jest.fn(() => ({ where }));
    const set = jest.fn(() => ({ returning }));
    (mockDb.update as jest.Mock).mockReturnValue({ set });
    getUserById.mockResolvedValue({ name: "Beto" });

    await expect(markReimbursementAsPaidWithNotifications("r-1", "user-2")).resolves.toBe(true);

    expect(notifyReimbursementPaid).toHaveBeenCalledWith("user-1", "Beto", 4500);
    expect(sendPushToUser).toHaveBeenCalledWith("user-1", {
      title: "✅ Reintegro Pagado",
      body: "Beto te pagó $4.500",
      url: "/dashboard/reimbursements",
    });
  });

  it("fails to pay an already cancelled reimbursement", async () => {
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([
          {
            id: "r-1",
            transactionId: "tx-1",
            requesterId: "user-1",
            payerId: "user-2",
            amount: 4500,
            status: "cancelled",
            paidAt: null,
            createdAt: 321,
          },
        ]),
      })),
    });

    await expect(markReimbursementAsPaidWithNotifications("r-1", "user-2")).resolves.toBe(false);

    expect(mockDb.update).not.toHaveBeenCalled();
    expect(notifyReimbursementPaid).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("returns reimbursements involving the user ordered by creation date", async () => {
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn().mockResolvedValue([
            {
              id: "r-2",
              transactionId: "tx-2",
              requesterId: "user-1",
              payerId: "user-2",
              amount: 1400,
              status: "paid",
              paidAt: "2026-08-18T00:00:00.000Z",
              createdAt: 200,
            },
            {
              id: "r-1",
              transactionId: "tx-1",
              requesterId: "user-3",
              payerId: "user-1",
              amount: 900,
              status: "pending",
              paidAt: null,
              createdAt: 100,
            },
          ]),
        })),
      })),
    });

    await expect(getReimbursementsByUser("user-1")).resolves.toEqual([
      {
        id: "r-2",
        transactionId: "tx-2",
        requesterId: "user-1",
        payerId: "user-2",
        amount: 1400,
        status: "paid",
        paidAt: "2026-08-18T00:00:00.000Z",
        createdAt: 200,
      },
      {
        id: "r-1",
        transactionId: "tx-1",
        requesterId: "user-3",
        payerId: "user-1",
        amount: 900,
        status: "pending",
        paidAt: null,
        createdAt: 100,
      },
    ]);
  });

  it("returns an empty list when the user has no reimbursements", async () => {
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn().mockResolvedValue([]),
        })),
      })),
    });

    await expect(getReimbursementsByUser("user-1")).resolves.toEqual([]);
  });

  it("returns pending reimbursements for a payer", async () => {
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn().mockResolvedValue([
            {
              id: "r-1",
              transactionId: "tx-1",
              requesterId: "user-2",
              payerId: "user-1",
              amount: 600,
              status: "pending",
              paidAt: null,
              createdAt: 150,
            },
          ]),
        })),
      })),
    });

    await expect(getPendingReimbursementsForPayer("user-1")).resolves.toEqual([
      {
        id: "r-1",
        transactionId: "tx-1",
        requesterId: "user-2",
        payerId: "user-1",
        amount: 600,
        status: "pending",
        paidAt: null,
        createdAt: 150,
      },
    ]);
  });

  it("marks a reimbursement as paid when the payer owns it", async () => {
    const where = jest.fn().mockResolvedValue([{ id: "r-1" }]);
    const returning = jest.fn(() => ({ where }));
    const set = jest.fn(() => ({ returning }));
    (mockDb.update as jest.Mock).mockReturnValue({ set });

    await expect(markReimbursementAsPaid("r-1", "user-1")).resolves.toBe(true);

    expect(where).toHaveBeenCalledWith(expect.anything());
  });

  it("returns false when no reimbursement is updated as paid", async () => {
    const where = jest.fn().mockResolvedValue([]);
    const returning = jest.fn(() => ({ where }));
    const set = jest.fn(() => ({ returning }));
    (mockDb.update as jest.Mock).mockReturnValue({ set });

    await expect(markReimbursementAsPaid("missing", "user-1")).resolves.toBe(false);
  });

  it("cancels a reimbursement when the requester owns it", async () => {
    const where = jest.fn().mockResolvedValue([{ id: "r-1" }]);
    const returning = jest.fn(() => ({ where }));
    const set = jest.fn(() => ({ returning }));
    (mockDb.update as jest.Mock).mockReturnValue({ set });

    await expect(cancelReimbursement("r-1", "user-1")).resolves.toBe(true);

    expect(where).toHaveBeenCalledWith(expect.anything());
  });

  it("fails to cancel an already paid reimbursement", async () => {
    const where = jest.fn().mockResolvedValue([]);
    const returning = jest.fn(() => ({ where }));
    const set = jest.fn(() => ({ returning }));
    (mockDb.update as jest.Mock).mockReturnValue({ set });

    await expect(cancelReimbursement("r-1", "user-1")).resolves.toBe(false);

    expect(notifyReimbursementPaid).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("returns false when no reimbursement is cancelled", async () => {
    const where = jest.fn().mockResolvedValue([]);
    const returning = jest.fn(() => ({ where }));
    const set = jest.fn(() => ({ returning }));
    (mockDb.update as jest.Mock).mockReturnValue({ set });

    await expect(cancelReimbursement("missing", "user-1")).resolves.toBe(false);
  });

  it("returns null when a reimbursement does not exist", async () => {
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([]),
      })),
    });

    await expect(getReimbursementById("missing")).resolves.toBeNull();
  });

  it("returns a reimbursement by id mapped to the public shape", async () => {
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([
          {
            id: "r-1",
            transactionId: "tx-1",
            requesterId: "user-1",
            payerId: "user-2",
            amount: 450,
            status: "cancelled",
            paidAt: null,
            createdAt: 321,
          },
        ]),
      })),
    });

    await expect(getReimbursementById("r-1")).resolves.toEqual({
      id: "r-1",
      transactionId: "tx-1",
      requesterId: "user-1",
      payerId: "user-2",
      amount: 450,
      status: "cancelled",
      paidAt: null,
      createdAt: 321,
    });
  });
});
