import { POST } from "../route";
import { DELETE } from "../[invId]/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/client", () => ({ db: {} }));
jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
  canManageMembers: jest.fn(),
}));
jest.mock("@/lib/db/schema", () => ({ group_invitations: {} }));

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
const invParams = { params: Promise.resolve({ id: "g-1", invId: "inv-1" }) };

describe("POST /api/groups/[id]/invitations", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without user", async () => {
    const req = makeReq("http://localhost/...", { method: "POST", body: JSON.stringify({ role: "member" }) });
    const res = await POST(req, groupParams);
    expect(res.status).toBe(401);
  });

  it("returns 403 when member (not owner/admin)", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ role: "member" });
    mockPerms.canManageMembers.mockReturnValue(false);
    const req = withUser(makeReq("http://localhost/...", { method: "POST", body: JSON.stringify({ role: "member" }) }));
    const res = await POST(req, groupParams);
    expect(res.status).toBe(403);
  });

  it("creates invitation link when admin", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ role: "admin" });
    mockPerms.canManageMembers.mockReturnValue(true);
    mockDb.insert = jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn().mockResolvedValue([{
          id: "inv-1", group_id: "g-1", token: "abc-token", role: "member",
          created_by: "user-1", expires_at: Date.now() + 86400000 * 7,
        }]),
      })),
    }));
    const req = withUser(makeReq("http://localhost/...", { method: "POST", body: JSON.stringify({ role: "member" }) }));
    const res = await POST(req, groupParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBeDefined();
  });
});

describe("DELETE /api/groups/[id]/invitations/[invId]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without user", async () => {
    const res = await DELETE(makeReq("http://localhost/..."), invParams);
    expect(res.status).toBe(401);
  });

  it("revokes invitation when admin", async () => {
    mockPerms.getGroupMembership.mockResolvedValue({ role: "admin" });
    mockPerms.canManageMembers.mockReturnValue(true);
    mockDb.query = { group_invitations: { findFirst: jest.fn().mockResolvedValue({ id: "inv-1", group_id: "g-1" }) } };
    mockDb.delete = jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) }));
    const res = await DELETE(withUser(makeReq("http://localhost/...")), invParams);
    expect(res.status).toBe(204);
  });
});
