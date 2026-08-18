import {
  addPaymentInfo,
  deletePaymentInfo,
  getDefaultPaymentInfo,
  getUserPaymentInfo,
} from "../payment-info";
import { db } from "@/lib/db/client";

jest.mock("nanoid", () => ({
  nanoid: jest.fn(() => "payment-info-id"),
}));

jest.mock("@/lib/db/client", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

describe("payment info helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns user payment info mapped to the public shape", async () => {
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([
          {
            id: "pi-1",
            userId: "user-1",
            paymentMethod: "cbu",
            value: "123",
            isDefault: true,
          },
          {
            id: "pi-2",
            userId: "user-1",
            paymentMethod: "efectivo",
            value: null,
            isDefault: null,
          },
        ]),
      })),
    });

    await expect(getUserPaymentInfo("user-1")).resolves.toEqual([
      {
        id: "pi-1",
        userId: "user-1",
        paymentMethod: "cbu",
        value: "123",
        isDefault: true,
      },
      {
        id: "pi-2",
        userId: "user-1",
        paymentMethod: "efectivo",
        value: null,
        isDefault: false,
      },
    ]);
  });

  it("returns null when the user has no default payment info", async () => {
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([]),
      })),
    });

    await expect(getDefaultPaymentInfo("user-1")).resolves.toBeNull();
  });

  it("returns the default payment info when present", async () => {
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([
          {
            id: "pi-1",
            userId: "user-1",
            paymentMethod: "alias",
            value: "mi.alias",
            isDefault: true,
          },
        ]),
      })),
    });

    await expect(getDefaultPaymentInfo("user-1")).resolves.toEqual({
      id: "pi-1",
      userId: "user-1",
      paymentMethod: "alias",
      value: "mi.alias",
      isDefault: true,
    });
  });

  it("clears existing defaults before adding a new default payment info", async () => {
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn(() => ({ where }));
    const returning = jest.fn().mockResolvedValue([
      {
        id: "payment-info-id",
        userId: "user-1",
        paymentMethod: "cbu",
        value: "123",
        isDefault: true,
      },
    ]);
    const values = jest.fn(() => ({ returning }));
    const tx = {
      update: jest.fn(() => ({ set })),
      insert: jest.fn(() => ({ values })),
    };
    (mockDb.transaction as jest.Mock).mockImplementation(async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx));

    await expect(addPaymentInfo("user-1", "cbu", "123", true)).resolves.toEqual({
      id: "payment-info-id",
      userId: "user-1",
      paymentMethod: "cbu",
      value: "123",
      isDefault: true,
    });

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
    expect(tx.insert).toHaveBeenCalled();
  });

  it("does not clear defaults when adding a non-default payment info", async () => {
    const returning = jest.fn().mockResolvedValue([
      {
        id: "payment-info-id",
        userId: "user-1",
        paymentMethod: "efectivo",
        value: null,
        isDefault: false,
      },
    ]);
    const values = jest.fn(() => ({ returning }));
    const tx = {
      update: jest.fn(),
      insert: jest.fn(() => ({ values })),
    };
    (mockDb.transaction as jest.Mock).mockImplementation(async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx));

    await addPaymentInfo("user-1", "efectivo", null, false);

    expect(tx.update).not.toHaveBeenCalled();
  });

  it("returns true when a payment info row is deleted", async () => {
    (mockDb.delete as jest.Mock).mockReturnValue({
      where: jest.fn().mockResolvedValue([{ id: "pi-1" }]),
    });

    await expect(deletePaymentInfo("pi-1", "user-1")).resolves.toBe(true);
  });

  it("returns false when no payment info row is deleted", async () => {
    (mockDb.delete as jest.Mock).mockReturnValue({
      where: jest.fn().mockResolvedValue([]),
    });

    await expect(deletePaymentInfo("pi-1", "user-1")).resolves.toBe(false);
  });
});
