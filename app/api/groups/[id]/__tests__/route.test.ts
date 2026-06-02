import { GET, PATCH, DELETE } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      groups: {
        findFirst: jest.fn(),
      },
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
  },
}));

jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
  isOwner: jest.fn(),
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

describe("GET /api/groups/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/groups/g1");
    const res = await GET(req, { params: Promise.resolve({ id: "g1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a member", async () => {
    const { getGroupMembership } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue(null);

    const req = withUser(makeReq("http://localhost/api/groups/g1"));
    const res = await GET(req, { params: Promise.resolve({ id: "g1" }) });

    expect(res.status).toBe(403);
  });

  it("returns 404 when group not found", async () => {
    const { getGroupMembership } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue({ group_id: "g1", user_id: "user-1", role: "member" });
    (mockDb.query.groups.findFirst as jest.Mock).mockResolvedValue(null);

    const req = withUser(makeReq("http://localhost/api/groups/g1"));
    const res = await GET(req, { params: Promise.resolve({ id: "g1" }) });

    expect(res.status).toBe(404);
  });

  it("returns group with role for member", async () => {
    const { getGroupMembership } = require("@/lib/groups/permissions");
    const membership = { group_id: "g1", user_id: "user-1", role: "member" };
    getGroupMembership.mockResolvedValue(membership);

    const group = { id: "g1", name: "Shared Group", owner_id: "user-2", created_at: 123 };
    (mockDb.query.groups.findFirst as jest.Mock).mockResolvedValue(group);

    const req = withUser(makeReq("http://localhost/api/groups/g1"));
    const res = await GET(req, { params: Promise.resolve({ id: "g1" }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("g1");
    expect(data.role).toBe("member");
  });
});

describe("PATCH /api/groups/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/groups/g1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Nueva" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "g1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a member", async () => {
    const { getGroupMembership } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue(null);

    const req = withUser(makeReq("http://localhost/api/groups/g1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Nueva" }),
    }));
    const res = await PATCH(req, { params: Promise.resolve({ id: "g1" }) });

    expect(res.status).toBe(403);
  });

  it("returns 403 when user is member (not owner)", async () => {
    const { getGroupMembership, isOwner } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue({ group_id: "g1", user_id: "user-1", role: "member" });
    isOwner.mockReturnValue(false);

    const req = withUser(makeReq("http://localhost/api/groups/g1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Nueva" }),
    }));
    const res = await PATCH(req, { params: Promise.resolve({ id: "g1" }) });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("owner");
  });

  it("returns 422 when name is missing", async () => {
    const { getGroupMembership, isOwner } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue({ group_id: "g1", user_id: "user-1", role: "owner" });
    isOwner.mockReturnValue(true);

    const req = withUser(makeReq("http://localhost/api/groups/g1", {
      method: "PATCH",
      body: JSON.stringify({}),
    }));
    const res = await PATCH(req, { params: Promise.resolve({ id: "g1" }) });

    expect(res.status).toBe(422);
  });

  it("renames group and returns 200", async () => {
    const { getGroupMembership, isOwner } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue({ group_id: "g1", user_id: "user-1", role: "owner" });
    isOwner.mockReturnValue(true);

    const updated = { id: "g1", name: "Nuevo Nombre", owner_id: "user-1", created_at: 123 };
    const mockReturning = jest.fn().mockResolvedValue([updated]);
    const mockWhere = jest.fn(() => ({ returning: mockReturning }));
    const mockSet = jest.fn(() => ({ where: mockWhere }));
    (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

    const req = withUser(makeReq("http://localhost/api/groups/g1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Nuevo Nombre" }),
    }));
    const res = await PATCH(req, { params: Promise.resolve({ id: "g1" }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Nuevo Nombre");
  });
});

describe("DELETE /api/groups/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no x-user-id", async () => {
    const req = makeReq("http://localhost/api/groups/g1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "g1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a member", async () => {
    const { getGroupMembership } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue(null);

    const req = withUser(makeReq("http://localhost/api/groups/g1", {
      method: "DELETE",
    }));
    const res = await DELETE(req, { params: Promise.resolve({ id: "g1" }) });

    expect(res.status).toBe(403);
  });

  it("returns 403 when user is admin (not owner)", async () => {
    const { getGroupMembership, isOwner } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue({ group_id: "g1", user_id: "user-1", role: "admin" });
    isOwner.mockReturnValue(false);

    const req = withUser(makeReq("http://localhost/api/groups/g1", {
      method: "DELETE",
    }));
    const res = await DELETE(req, { params: Promise.resolve({ id: "g1" }) });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("owner");
  });

  it("deletes group and returns 204", async () => {
    const { getGroupMembership, isOwner } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue({ group_id: "g1", user_id: "user-1", role: "owner" });
    isOwner.mockReturnValue(true);

    const mockWhere = jest.fn().mockResolvedValue(undefined);
    (mockDb.delete as jest.Mock).mockReturnValue({ where: mockWhere });

    const req = withUser(makeReq("http://localhost/api/groups/g1", {
      method: "DELETE",
    }));
    const res = await DELETE(req, { params: Promise.resolve({ id: "g1" }) });

    expect(res.status).toBe(204);
  });
});
