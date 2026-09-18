import { GET } from "../route";
import { PATCH, DELETE } from "../[userId]/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/client", () => ({ db: {} }));
jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
  isOwner: jest.fn(),
  canManageMembers: jest.fn(),
}));
jest.mock("@/lib/db/schema", () => ({
  group_members: { group_id: "group_members.group_id", user_id: "group_members.user_id" },
  users: { id: "users.id", active_telegram_group_id: "users.active_telegram_group_id" },
}));
jest.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ type: "and", conditions }),
  eq: (column: unknown, value: unknown) => ({ type: "eq", column, value }),
}));

import * as perms from "@/lib/groups/permissions";
import { db } from "@/lib/db/client";

const mockPerms = perms as jest.Mocked<typeof perms>;
const mockDb = db as any;

function makeReq(url: string, options?: RequestInit) { return new NextRequest(url, options); }
function withUser(req: NextRequest, userId = "user-1") {
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((k: string) => k === "x-user-id" ? userId : null),
  });
  return req;
}

const groupParams = { params: Promise.resolve({ id: "g-1" }) };
const memberParams = { params: Promise.resolve({ id: "g-1", userId: "user-2" }) };

describe("GET /api/groups/[id]/members", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without user", async () => {
    const res = await GET(makeReq("http://localhost/api/groups/g-1/members"), groupParams);
    expect(res.status).toBe(401);
  });

  it("returns 403 when not member", async () => {
    mockPerms.getGroupMembership.mockResolvedValue(null);
    const res = await GET(withUser(makeReq("http://localhost/api/groups/g-1/members")), groupParams);
    expect(res.status).toBe(403);
  });

  it("returns members list", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ group_id: "g-1", user_id: "user-1", role: "owner" });
    mockDb.query = {
      group_members: {
        findMany: jest.fn().mockResolvedValue([
          { group_id: "g-1", user_id: "user-1", role: "owner", joined_at: 0, user: { id: "user-1", name: "Esteban" } },
        ]),
      },
    };
    const res = await GET(withUser(makeReq("http://localhost/api/groups/g-1/members")), groupParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe("PATCH /api/groups/[id]/members/[userId]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when not owner", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ role: "admin" });
    mockPerms.isOwner.mockReturnValue(false);
    const req = withUser(makeReq("http://localhost/...", { method: "PATCH", body: JSON.stringify({ role: "member" }) }));
    const res = await PATCH(req, memberParams);
    expect(res.status).toBe(403);
  });

  it("returns 400 when trying to change own role as owner", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ group_id: "g-1", user_id: "user-1", role: "owner" });
    mockPerms.isOwner.mockReturnValue(true);
    const req = withUser(makeReq("http://localhost/...", { method: "PATCH", body: JSON.stringify({ role: "admin" }) }));
    const sameUserParams = { params: Promise.resolve({ id: "g-1", userId: "user-1" }) };
    const res = await PATCH(req, sameUserParams);
    expect(res.status).toBe(400);
  });

  it("returns 401 without user", async () => {
    const req = makeReq("http://localhost/...", { method: "PATCH", body: JSON.stringify({ role: "member" }) });
    const res = await PATCH(req, memberParams);
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/groups/[id]/members/[userId]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.transaction = jest.fn(async (callback: (tx: {
      delete: jest.Mock;
      update: jest.Mock;
    }) => Promise<void>) => callback({
      delete: mockDb.delete,
      update: mockDb.update,
    }));
  });

  it("returns 400 when owner tries to leave", async () => {
    mockPerms.getGroupMembership
      .mockResolvedValueOnce({ group_id: "g-1", user_id: "user-1", role: "owner" })
      .mockResolvedValueOnce({ group_id: "g-1", user_id: "user-1", role: "owner" });
    mockPerms.isOwner.mockReturnValue(true);
    const sameUserParams = { params: Promise.resolve({ id: "g-1", userId: "user-1" }) };
    const res = await DELETE(withUser(makeReq("http://localhost/...")), sameUserParams);
    expect(res.status).toBe(400);
  });

  it("removes member when owner requests", async () => {
    mockPerms.getGroupMembership
      .mockResolvedValueOnce({ group_id: "g-1", user_id: "user-1", role: "owner" })
      .mockResolvedValueOnce({ group_id: "g-1", user_id: "user-2", role: "member" });
    mockPerms.isOwner.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mockDb.delete = jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) }));
    mockDb.update = jest.fn(() => ({
      set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })),
    }));
    const res = await DELETE(withUser(makeReq("http://localhost/...")), memberParams);
    expect(res.status).toBe(204);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.update).toHaveBeenCalledWith(expect.anything());
  });

  it("clears only the removed group's active Telegram context", async () => {
    mockPerms.getGroupMembership
      .mockResolvedValueOnce({ group_id: "g-1", user_id: "user-1", role: "owner" })
      .mockResolvedValueOnce({ group_id: "g-1", user_id: "user-2", role: "member" });
    mockPerms.isOwner.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const deleteWhere = jest.fn().mockResolvedValue(undefined);
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn(() => ({ where: updateWhere }));
    mockDb.delete = jest.fn(() => ({ where: deleteWhere }));
    mockDb.update = jest.fn(() => ({ set }));

    const res = await DELETE(withUser(makeReq("http://localhost/...")), memberParams);

    expect(res.status).toBe(204);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.delete).toHaveBeenCalled();
    expect(mockDb.update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({ active_telegram_group_id: null });
    expect(updateWhere).toHaveBeenCalledWith({
      type: "and",
      conditions: [
        { type: "eq", column: "users.id", value: "user-2" },
        { type: "eq", column: "users.active_telegram_group_id", value: "g-1" },
      ],
    });
  });

  it("returns 401 without user", async () => {
    const res = await DELETE(makeReq("http://localhost/..."), memberParams);
    expect(res.status).toBe(401);
  });
});
