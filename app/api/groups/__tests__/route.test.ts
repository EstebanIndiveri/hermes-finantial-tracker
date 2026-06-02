import { GET, POST } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn(),
      })),
    })),
    query: {
      group_members: {
        findMany: jest.fn(),
      },
    },
  },
}));

jest.mock("@/lib/groups/permissions", () => ({
  getUserGroups: jest.fn(),
  countOwnedGroups: jest.fn(),
  MAX_OWNED_GROUPS: 2,
}));

const mockDb = db as jest.Mocked<typeof db>;

function makeReq(url: string, options?: RequestInit) {
  return new NextRequest(url, options);
}

function withUser(req: NextRequest, userId = "user-1") {
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((key: string) => (key === "x-user-id" ? userId : null)),
  });
  return req;
}

function mockInsertResult(created: Record<string, unknown>) {
  const returning = jest.fn().mockResolvedValue([created]);
  const values = jest.fn(() => ({ returning }));
  (mockDb.insert as jest.Mock).mockReturnValue({ values });
  return { values, returning };
}

describe("GET /api/groups", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/groups");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns list of groups for user", async () => {
    const { getUserGroups } = require("@/lib/groups/permissions");
    const mockGroups = [
      { group_id: "g1", role: "owner", group: { id: "g1", name: "Personal", owner_id: "user-1", created_at: 123 } },
      { group_id: "g2", role: "member", group: { id: "g2", name: "Shared", owner_id: "user-2", created_at: 456 } },
    ];
    getUserGroups.mockResolvedValue(mockGroups);

    const req = withUser(makeReq("http://localhost/api/groups"));
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(getUserGroups).toHaveBeenCalledWith("user-1");
    const data = await res.json();
    expect(data).toEqual(mockGroups);
  });
});

describe("POST /api/groups", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/groups", {
      method: "POST",
      body: JSON.stringify({ name: "Mi Grupo" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 422 when name is missing", async () => {
    const req = withUser(makeReq("http://localhost/api/groups", {
      method: "POST",
      body: JSON.stringify({}),
    }));
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 422 when name exceeds max length", async () => {
    const req = withUser(makeReq("http://localhost/api/groups", {
      method: "POST",
      body: JSON.stringify({ name: "a".repeat(51) }),
    }));
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 422 with code MAX_GROUPS_REACHED when user has max groups", async () => {
    const { countOwnedGroups } = require("@/lib/groups/permissions");
    countOwnedGroups.mockResolvedValue(2);

    const req = withUser(makeReq("http://localhost/api/groups", {
      method: "POST",
      body: JSON.stringify({ name: "Mi Grupo" }),
    }));
    const res = await POST(req);

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.code).toBe("MAX_GROUPS_REACHED");
    expect(data.error).toContain("Podés crear hasta 2 grupos");
  });

  it("creates group and returns 201 on success", async () => {
    const { countOwnedGroups } = require("@/lib/groups/permissions");
    countOwnedGroups.mockResolvedValue(0);

    const created = { id: "g-uuid", name: "Mi Grupo", owner_id: "user-1", created_at: 123 };
    const { values: mockValues } = mockInsertResult(created);

    const req = withUser(makeReq("http://localhost/api/groups", {
      method: "POST",
      body: JSON.stringify({ name: "Mi Grupo" }),
    }));
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(mockDb.insert).toHaveBeenCalled();
    const data = await res.json();
    expect(data.name).toBe("Mi Grupo");
    expect(data.owner_id).toBe("user-1");
  });

  it("inserts group member record with owner role", async () => {
    const { countOwnedGroups } = require("@/lib/groups/permissions");
    countOwnedGroups.mockResolvedValue(0);

    const created = { id: "g-uuid", name: "Mi Grupo", owner_id: "user-1", created_at: 123 };
    mockInsertResult(created);

    const req = withUser(makeReq("http://localhost/api/groups", {
      method: "POST",
      body: JSON.stringify({ name: "Mi Grupo" }),
    }));
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });
});
