import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/client", () => ({
  db: {
    query: {
      group_invitations: { findFirst: vi.fn() },
    },
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  },
}));
vi.mock("@/lib/utils/session", () => ({ signSession: vi.fn().mockResolvedValue("test-session") }));

const { db } = await import("@/lib/db/client");

const validInvite = {
  id: "inv-1",
  token: "valid-invite-token",
  group_id: "group-1",
  used: 0,
  expires_at: Date.now() + 3600000,
  role: "member",
};

function makeReq(body: object) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when name is missing", async () => {
    vi.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    const res = await POST(makeReq({ token: "longtoken123", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toMatch(/nombre/i);
  });

  it("returns 400 when token is shorter than 8 chars", async () => {
    vi.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    const res = await POST(makeReq({ name: "Alice", token: "short", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toMatch(/8/);
  });

  it("returns 410 when invite_token is invalid", async () => {
    vi.mocked(db.query.group_invitations.findFirst).mockResolvedValue(undefined);
    const res = await POST(makeReq({ name: "Alice", token: "validtoken123", invite_token: "bad-token" }));
    expect(res.status).toBe(410);
  });

  it("creates user and returns group_id on valid input", async () => {
    vi.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    const res = await POST(makeReq({ name: "Alice", token: "validtoken123", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.group_id).toBe("group-1");
    expect(data.user_id).toBeDefined();
    expect(res.headers.get("Set-Cookie")).toContain("hermes_session");
  });
});
