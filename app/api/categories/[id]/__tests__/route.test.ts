import { PATCH, DELETE } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      categories: { findFirst: jest.fn() },
    },
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn(),
        })),
      })),
    })),
    delete: jest.fn(() => ({
      where: jest.fn(),
    })),
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => []),
      })),
    })),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

function makeReq(url: string, options?: RequestInit) {
  return new NextRequest(url, options);
}

function withUser(req: NextRequest, userId = "user-123") {
  req.headers.set("x-user-id", userId);
  return req;
}

const params = { params: Promise.resolve({ id: "cat-123" }) };

function getReferencedColumnNames(sqlNode: unknown): string[] {
  const names = new Set<string>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const record = node as {
      name?: unknown;
      queryChunks?: unknown[];
      value?: unknown[];
      table?: unknown;
      columnType?: unknown;
    };

    if (typeof record.name === "string" && record.table && typeof record.columnType === "string") {
      names.add(record.name);
    }

    if (Array.isArray(record.queryChunks)) record.queryChunks.forEach(visit);
    if (Array.isArray(record.value)) record.value.forEach(visit);
  };

  visit(sqlNode);
  return [...names];
}

describe("PATCH /api/categories/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/categories/cat-123", {
      method: "PATCH",
      body: JSON.stringify({ name: "Nuevo nombre" }),
    });
    const res = await PATCH(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 404 when category does not exist", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue(null);
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", {
      method: "PATCH",
      body: JSON.stringify({ name: "Nuevo nombre" }),
    }));
    const res = await PATCH(req, params);
    expect(res.status).toBe(404);
  });

  it("returns 422 when name exceeds 40 chars", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123" });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", {
      method: "PATCH",
      body: JSON.stringify({ name: "a".repeat(41) }),
    }));
    const res = await PATCH(req, params);
    expect(res.status).toBe(422);
  });

  it("returns 422 when patch body is malformed JSON", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123" });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", {
      method: "PATCH",
      body: "{",
    }));
    const res = await PATCH(req, params);
    expect(res.status).toBe(422);
  });

  it("returns 422 when no fields are provided", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123" });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", {
      method: "PATCH",
      body: JSON.stringify({}),
    }));
    const res = await PATCH(req, params);
    expect(res.status).toBe(422);
  });

  it("returns 200 and updated category on valid patch", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123", slug: "comida" });
    const updated = { id: "cat-123", name: "Comida Updated", emoji: "🍕", sort_order: 1, default_hard_limit: 1, is_active: 1, slug: "comida" };
    (mockDb.update as jest.Mock).mockReturnValue({
      set: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([updated]) })),
      })),
    });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", {
      method: "PATCH",
      body: JSON.stringify({ name: "Comida Updated" }),
    }));
    const res = await PATCH(req, params);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Comida Updated");
  });

  it("returns 404 when update affects no rows (concurrent delete)", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123" });
    (mockDb.update as jest.Mock).mockReturnValue({
      set: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([]) })),
      })),
    });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", {
      method: "PATCH",
      body: JSON.stringify({ name: "Test" }),
    }));
    const res = await PATCH(req, params);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/categories/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/categories/cat-123", { method: "DELETE" });
    const res = await DELETE(req, params);
    expect(res.status).toBe(401);
  });

  it("returns 404 when category does not exist", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue(null);
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", { method: "DELETE" }));
    const res = await DELETE(req, params);
    expect(res.status).toBe(404);
  });

  it("returns 409 when category has active transactions", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123" });
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn(() => [{ value: 1 }]),
      })),
    });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", { method: "DELETE" }));
    const res = await DELETE(req, params);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.count).toBe(1);
  });

  it("checks all referencing transactions, including soft-deleted ones", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123" });
    const txWhere = jest.fn(() => [{ value: 0 }]);
    (mockDb.select as jest.Mock)
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: txWhere,
        })),
      })
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn(() => [{ value: 0 }]),
        })),
      });
    (mockDb.delete as jest.Mock).mockReturnValue({
      where: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([{ id: "cat-123" }]) })),
    });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", { method: "DELETE" }));
    const res = await DELETE(req, params);
    expect(res.status).toBe(200);
    const txGuardColumns = getReferencedColumnNames(txWhere.mock.calls[0][0]);
    expect(txGuardColumns).toContain("category_id");
    expect(txGuardColumns).not.toContain("status");
  });

  it("returns 409 when category has budgets", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123" });
    (mockDb.select as jest.Mock)
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn(() => [{ value: 0 }]),
        })),
      })
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn(() => [{ value: 2 }]),
        })),
      });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", { method: "DELETE" }));
    const res = await DELETE(req, params);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.count).toBe(2);
  });

  it("returns 404 when delete affects no rows after validation", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123" });
    (mockDb.select as jest.Mock)
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn(() => [{ value: 0 }]),
        })),
      })
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn(() => [{ value: 0 }]),
        })),
      });
    (mockDb.delete as jest.Mock).mockReturnValue({
      where: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([]) })),
    });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", { method: "DELETE" }));
    const res = await DELETE(req, params);
    expect(res.status).toBe(404);
  });

  it("returns 409 when delete hits FK constraint after validation", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123" });
    (mockDb.select as jest.Mock)
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn(() => [{ value: 0 }]),
        })),
      })
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn(() => [{ value: 0 }]),
        })),
      });
    (mockDb.delete as jest.Mock).mockReturnValue({
      where: jest.fn(() => ({
        returning: jest.fn().mockRejectedValue(new Error("SQLITE_CONSTRAINT: FOREIGN KEY constraint failed")),
      })),
    });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", { method: "DELETE" }));
    const res = await DELETE(req, params);
    expect(res.status).toBe(409);
  });

  it("returns 200 when category has no active transactions or budgets", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "cat-123" });
    (mockDb.select as jest.Mock)
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn(() => [{ value: 0 }]),
        })),
      })
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn(() => [{ value: 0 }]),
        })),
      });
    (mockDb.delete as jest.Mock).mockReturnValue({
      where: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([{ id: "cat-123" }]) })),
    });
    const req = withUser(makeReq("http://localhost/api/categories/cat-123", { method: "DELETE" }));
    const res = await DELETE(req, params);
    expect(res.status).toBe(200);
  });
});
