import { DELETE } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

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

describe("DELETE /api/transactions/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
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
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await DELETE(req, { params: Promise.resolve({ id: "tx-999" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Not found");
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
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await DELETE(req, { params: Promise.resolve({ id: "tx-1" }) });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Already deleted");
  });

  test("cannot delete transaction belonging to another user", async () => {
    (db.query.transactions.findFirst as jest.Mock).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/transactions/tx-1", {
      method: "DELETE",
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-456" : null)),
    });

    const response = await DELETE(req, { params: Promise.resolve({ id: "tx-1" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Not found");
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
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    await DELETE(req, { params: Promise.resolve({ id: "tx-1" }) });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "deleted",
        deleted_at: expect.any(Number),
      })
    );
  });
});
