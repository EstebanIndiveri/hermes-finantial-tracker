import { DELETE } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { getGroupMembership } from "@/lib/groups/permissions";
import { and, eq } from "drizzle-orm";

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    and: jest.fn(actual.and),
    eq: jest.fn(actual.eq),
  };
});

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      transactions: {
        findFirst: jest.fn(),
      },
    },
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(),
      })),
    })),
  },
}));

jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
}));

const mockGetGroupMembership = getGroupMembership as jest.MockedFunction<typeof getGroupMembership>;
const mockAnd = and as jest.MockedFunction<typeof and>;
const mockEq = eq as jest.MockedFunction<typeof eq>;

function makeRequest(userId = "user-123", groupId = "group-123"): NextRequest {
  return new NextRequest("http://localhost:3000/api/transactions/tx-1", {
    method: "DELETE",
    headers: {
      "x-user-id": userId,
      "x-group-id": groupId,
    },
  });
}

describe("DELETE /api/transactions/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGroupMembership.mockResolvedValue({
      group_id: "group-123",
      user_id: "user-123",
      role: "member",
    });
  });

  test("returns 401 when x-user-id header is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/transactions/tx-1", {
      method: "DELETE",
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn(() => null),
    });

    const response = await DELETE(req, { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(401);
    expect(db.update).not.toHaveBeenCalled();
  });

  test("soft-deletes transaction successfully", async () => {
    (db.query.transactions.findFirst as jest.Mock).mockResolvedValue({
      id: "tx-1",
      user_id: "user-123",
      status: "active",
    });

    const req = new NextRequest("http://localhost:3000/api/transactions/tx-1", {
      method: "DELETE",
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const response = await DELETE(req, { params: Promise.resolve({ id: "tx-1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(db.update).toHaveBeenCalled();
  });

  test("returns 404 when transaction not found", async () => {
    (db.query.transactions.findFirst as jest.Mock).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/transactions/tx-999", {
      method: "DELETE",
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const response = await DELETE(req, { params: Promise.resolve({ id: "tx-999" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Not found");
    expect(db.update).not.toHaveBeenCalled();
  });

  test("returns 409 when transaction already deleted", async () => {
    (db.query.transactions.findFirst as jest.Mock).mockResolvedValue({
      id: "tx-1",
      user_id: "user-123",
      status: "deleted",
    });

    const req = new NextRequest("http://localhost:3000/api/transactions/tx-1", {
      method: "DELETE",
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const response = await DELETE(req, { params: Promise.resolve({ id: "tx-1" }) });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Already deleted");
    expect(db.update).not.toHaveBeenCalled();
  });

  test("member cannot delete another user's transaction in the same group", async () => {
    (db.query.transactions.findFirst as jest.Mock).mockResolvedValue({
      id: "tx-1",
      group_id: "group-123",
      user_id: "user-456",
      status: "active",
    });

    const response = await DELETE(makeRequest(), { params: Promise.resolve({ id: "tx-1" }) });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
    expect(db.update).not.toHaveBeenCalled();
  });

  test("member receives 403 for another user's deleted transaction", async () => {
    (db.query.transactions.findFirst as jest.Mock).mockResolvedValue({
      id: "tx-1",
      group_id: "group-123",
      user_id: "user-456",
      status: "deleted",
    });

    const response = await DELETE(makeRequest(), { params: Promise.resolve({ id: "tx-1" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(db.update).not.toHaveBeenCalled();
  });

  test.each(["owner", "admin"] as const)(
    "%s can delete another user's transaction in the same group",
    async (role) => {
      mockGetGroupMembership.mockResolvedValue({
        group_id: "group-123",
        user_id: "user-123",
        role,
      });
      (db.query.transactions.findFirst as jest.Mock).mockResolvedValue({
        id: "tx-1",
        group_id: "group-123",
        user_id: "user-456",
        status: "active",
      });

      const response = await DELETE(makeRequest(), { params: Promise.resolve({ id: "tx-1" }) });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(db.update).toHaveBeenCalledTimes(1);
    },
  );

  test("returns 403 without membership and does not query or update transactions", async () => {
    mockGetGroupMembership.mockResolvedValue(null);

    const response = await DELETE(makeRequest(), { params: Promise.resolve({ id: "tx-1" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(db.query.transactions.findFirst).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  test.each([
    ["a transaction from another group", "tx-other-group"],
    ["a transaction that does not exist", "tx-missing"],
  ])("does not reveal whether %s exists", async (_scenario, transactionId) => {
    (db.query.transactions.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: transactionId }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
    expect(db.update).not.toHaveBeenCalled();
  });

  test("sets status to deleted and deleted_at timestamp", async () => {
    (db.query.transactions.findFirst as jest.Mock).mockResolvedValue({
      id: "tx-1",
      user_id: "user-123",
      status: "active",
    });

    const setMock = jest.fn(() => ({
      where: jest.fn(),
    }));

    (db.update as jest.Mock).mockReturnValue({
      set: setMock,
    });

    const req = new NextRequest("http://localhost:3000/api/transactions/tx-1", {
      method: "DELETE",
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    await DELETE(req, { params: Promise.resolve({ id: "tx-1" }) });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "deleted",
        deleted_at: expect.any(Number),
      })
    );
  });

  test("scopes both the lookup and update predicates by transaction and group", async () => {
    (db.query.transactions.findFirst as jest.Mock).mockResolvedValue({
      id: "tx-1",
      group_id: "group-123",
      user_id: "user-123",
      status: "active",
    });
    const updateWhere = jest.fn();
    (db.update as jest.Mock).mockReturnValue({
      set: jest.fn(() => ({ where: updateWhere })),
    });

    const response = await DELETE(makeRequest(), { params: Promise.resolve({ id: "tx-1" }) });

    expect(response.status).toBe(200);
    expect(mockEq).toHaveBeenCalledTimes(4);
    expect(mockEq).toHaveBeenNthCalledWith(1, transactions.id, "tx-1");
    expect(mockEq).toHaveBeenNthCalledWith(2, transactions.group_id, "group-123");
    expect(mockEq).toHaveBeenNthCalledWith(3, transactions.id, "tx-1");
    expect(mockEq).toHaveBeenNthCalledWith(4, transactions.group_id, "group-123");

    const lookupId = mockEq.mock.results[0].value;
    const lookupGroup = mockEq.mock.results[1].value;
    const updateId = mockEq.mock.results[2].value;
    const updateGroup = mockEq.mock.results[3].value;
    expect(mockAnd).toHaveBeenNthCalledWith(1, lookupId, lookupGroup);
    expect(mockAnd).toHaveBeenNthCalledWith(2, updateId, updateGroup);

    const lookupPredicate = mockAnd.mock.results[0].value;
    const updatePredicate = mockAnd.mock.results[1].value;
    expect(db.query.transactions.findFirst).toHaveBeenCalledWith({ where: lookupPredicate });
    expect(updateWhere).toHaveBeenCalledWith(updatePredicate);
  });
});
