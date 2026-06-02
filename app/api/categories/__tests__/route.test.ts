import { GET, POST } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      categories: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    },
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn(),
      })),
    })),
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => []),
      })),
    })),
  },
}));

jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
}));

const mockDb = db as jest.Mocked<typeof db>;

function makeReq(url: string, options?: RequestInit) {
  return new NextRequest(url, options);
}

function withUser(req: NextRequest, userId = "user-123", groupId = "group-123") {
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((key: string) => {
      if (key === "x-user-id") return userId;
      if (key === "x-group-id") return groupId;
      return null;
    }),
  });
  return req;
}

function mockInsertResult(created: Record<string, unknown>) {
  const returning = jest.fn().mockResolvedValue([created]);
  const values = jest.fn(() => ({ returning }));
  (mockDb.insert as jest.Mock).mockReturnValue({ values });
  return { values, returning };
}

describe("GET /api/categories", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getGroupMembership } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue({ group_id: "group-123", user_id: "user-123", role: "member" });
  });

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/categories");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns active categories by default", async () => {
    (mockDb.query.categories.findMany as jest.Mock).mockResolvedValue([
      { id: "1", name: "Comida", emoji: "🍕", slug: "comida", is_active: 1, sort_order: 1, default_hard_limit: 1 },
    ]);

    const req = withUser(makeReq("http://localhost/api/categories"));
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockDb.query.categories.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.query.categories.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
        orderBy: expect.any(Function),
      }),
    );
  });

  it("returns all categories when ?all=true", async () => {
    (mockDb.query.categories.findMany as jest.Mock).mockResolvedValue([]);

    const req = withUser(makeReq("http://localhost/api/categories?all=true"));
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockDb.query.categories.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.query.categories.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
        orderBy: expect.any(Function),
      }),
    );
  });
});

describe("POST /api/categories", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getGroupMembership } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue({ group_id: "group-123", user_id: "user-123", role: "member" });
  });

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Nueva", emoji: "🆕", sort_order: 10, default_hard_limit: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 422 when body is malformed JSON", async () => {
    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: "{",
    }));

    const res = await POST(req);

    expect(res.status).toBe(422);
  });

  it("returns 422 when name is missing", async () => {
    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ emoji: "🆕", sort_order: 10 }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 422 when emoji is missing", async () => {
    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Nueva", sort_order: 10 }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 422 when sort_order is out of range", async () => {
    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Nueva", emoji: "🆕", sort_order: 0 }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 422 when name cannot produce a slug", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue(null);
    mockInsertResult({ id: "new-id", slug: "", name: "💸", emoji: "💸", sort_order: 10, default_hard_limit: 1, is_active: 1 });

    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "💸", emoji: "💸", sort_order: 10 }),
    }));

    const res = await POST(req);

    expect(res.status).toBe(422);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("returns 422 when name only produces underscores", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue(null);
    mockInsertResult({ id: "new-id", slug: "_", name: "   ", emoji: "🪙", sort_order: 10, default_hard_limit: 1, is_active: 1 });

    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "   ", emoji: "🪙", sort_order: 10 }),
    }));

    const res = await POST(req);

    expect(res.status).toBe(422);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("returns 409 when slug already exists", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue({ id: "existing" });
    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Comida", emoji: "🍕", sort_order: 5 }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("returns 409 when UNIQUE constraint fails on insert (race condition)", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.insert as jest.Mock).mockReturnValue({
      values: jest.fn(() => ({
        returning: jest.fn().mockRejectedValue(new Error("UNIQUE constraint failed: categories.slug")),
      })),
    });
    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Comida", emoji: "🍕", sort_order: 5 }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "Ya existe una categoría con ese nombre." });
  });

  it("returns 500 when UNIQUE constraint fails on id", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.insert as jest.Mock).mockReturnValue({
      values: jest.fn(() => ({
        returning: jest.fn().mockRejectedValue(new Error("UNIQUE constraint failed: categories.id")),
      })),
    });
    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Comida", emoji: "🍕", sort_order: 5 }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("creates category and returns 201 when valid", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue(null);
    const created = { id: "new-id", slug: "nueva", name: "Nueva", emoji: "🆕", sort_order: 10, default_hard_limit: 1, is_active: 1 };
    const { values } = mockInsertResult(created);

    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Nueva", emoji: "🆕", sort_order: 10 }),
    }));
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "nueva",
        default_hard_limit: 1,
      }),
    );
    const data = await res.json();
    expect(data.slug).toBe("nueva");
  });

  it("stores default_hard_limit as 0 when false", async () => {
    (mockDb.query.categories.findFirst as jest.Mock).mockResolvedValue(null);
    const created = { id: "new-id", slug: "sin_limite", name: "Sin Límite", emoji: "🚫", sort_order: 11, default_hard_limit: 0, is_active: 1 };
    const { values } = mockInsertResult(created);

    const req = withUser(makeReq("http://localhost/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Sin Límite", emoji: "🚫", sort_order: 11, default_hard_limit: false }),
    }));
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "sin_limite",
        default_hard_limit: 0,
      }),
    );
  });
});
