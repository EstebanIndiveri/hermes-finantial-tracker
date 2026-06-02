import { GET, POST } from "../[token]/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/client", () => ({ db: {} }));
jest.mock("@/lib/db/schema", () => ({ group_invitations: {}, group_members: {}, groups: {} }));

import { db } from "@/lib/db/client";
const mockDb = db as any;

function makeReq(url: string, options?: RequestInit) { return new NextRequest(url, options); }
function withUser(req: NextRequest, userId = "user-2") {
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((k: string) => k === "x-user-id" ? userId : null),
  });
  return req;
}

const tokenParams = { params: Promise.resolve({ token: "abc-token" }) };
const futureExpiry = Date.now() + 86400000;
const pastExpiry = Date.now() - 1000;

describe("GET /api/join/[token]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when token not found", async () => {
    mockDb.query = { group_invitations: { findFirst: jest.fn().mockResolvedValue(null) } };
    const res = await GET(makeReq("http://localhost/api/join/abc-token"), tokenParams);
    expect(res.status).toBe(404);
  });

  it("returns 410 when token expired", async () => {
    mockDb.query = {
      group_invitations: { findFirst: jest.fn().mockResolvedValue({ token: "abc-token", expires_at: pastExpiry, used_at: null }) },
    };
    const res = await GET(makeReq("http://localhost/api/join/abc-token"), tokenParams);
    expect(res.status).toBe(410);
  });

  it("returns 409 when token already used", async () => {
    mockDb.query = {
      group_invitations: { findFirst: jest.fn().mockResolvedValue({ token: "abc-token", expires_at: futureExpiry, used_at: Date.now() - 1000 }) },
    };
    const res = await GET(makeReq("http://localhost/api/join/abc-token"), tokenParams);
    expect(res.status).toBe(409);
  });

  it("returns group info when token is valid", async () => {
    mockDb.query = {
      group_invitations: {
        findFirst: jest.fn().mockResolvedValue({
          token: "abc-token", expires_at: futureExpiry, used_at: null,
          role: "member", group: { id: "g-1", name: "Hogar" },
          creator: { id: "user-1", name: "Esteban" },
        }),
      },
    };
    const res = await GET(makeReq("http://localhost/api/join/abc-token"), tokenParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.group.name).toBe("Hogar");
    expect(body.role).toBe("member");
  });
});

describe("POST /api/join/[token]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without user", async () => {
    const res = await POST(makeReq("http://localhost/api/join/abc-token", { method: "POST" }), tokenParams);
    expect(res.status).toBe(401);
  });

  it("returns 404 when token not found", async () => {
    mockDb.query = { group_invitations: { findFirst: jest.fn().mockResolvedValue(null) } };
    const res = await POST(withUser(makeReq("http://localhost/...", { method: "POST" })), tokenParams);
    expect(res.status).toBe(404);
  });

  it("returns 410 when token expired", async () => {
    mockDb.query = {
      group_invitations: { findFirst: jest.fn().mockResolvedValue({ token: "abc-token", expires_at: pastExpiry, used_at: null }) },
    };
    const res = await POST(withUser(makeReq("http://localhost/...", { method: "POST" })), tokenParams);
    expect(res.status).toBe(410);
  });

  it("returns 409 when token already used", async () => {
    mockDb.query = {
      group_invitations: { findFirst: jest.fn().mockResolvedValue({ token: "abc-token", expires_at: futureExpiry, used_at: Date.now() - 1000 }) },
    };
    const res = await POST(withUser(makeReq("http://localhost/...", { method: "POST" })), tokenParams);
    expect(res.status).toBe(409);
  });

  it("returns 409 when user already member", async () => {
    mockDb.query = {
      group_invitations: { findFirst: jest.fn().mockResolvedValue({ id: "inv-1", token: "abc-token", expires_at: futureExpiry, used_at: null, group_id: "g-1", role: "member" }) },
      group_members: { findFirst: jest.fn().mockResolvedValue({ group_id: "g-1", user_id: "user-2" }) },
    };
    const res = await POST(withUser(makeReq("http://localhost/...", { method: "POST" })), tokenParams);
    expect(res.status).toBe(409);
  });

  it("joins group and marks token used on success", async () => {
    mockDb.query = {
      group_invitations: { findFirst: jest.fn().mockResolvedValue({ id: "inv-1", token: "abc-token", expires_at: futureExpiry, used_at: null, group_id: "g-1", role: "member" }) },
      group_members: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    mockDb.insert = jest.fn(() => ({ values: jest.fn().mockResolvedValue([]) }));
    mockDb.update = jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue([]) })) }));
    const res = await POST(withUser(makeReq("http://localhost/...", { method: "POST" })), tokenParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.group_id).toBe("g-1");
    expect(body.role).toBe("member");
  });
});
