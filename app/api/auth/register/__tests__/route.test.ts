import { POST } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      group_invitations: { findFirst: jest.fn() },
      users: { findFirst: jest.fn() },
    },
    insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
  },
}));
jest.mock("@/lib/utils/session", () => ({
  signSession: jest.fn().mockResolvedValue("test-session"),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require("@/lib/db/client");

const validInvite = {
  id: "inv-1",
  token: "valid-invite-token",
  group_id: "group-1",
  used_at: null,
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
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when name is missing", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    const res = await POST(makeReq({ username: "alice", password: "longpass123", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toMatch(/nombre/i);
  });

  it("returns 400 when password is shorter than 8 chars", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    const res = await POST(makeReq({ name: "Alice", username: "alice", password: "short", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toMatch(/8/);
  });

  it("returns 400 when username is missing", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    const res = await POST(makeReq({ name: "Alice", password: "validpass123", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toMatch(/usuario/i);
  });

  it("returns 400 when username has invalid characters (spaces)", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    const res = await POST(makeReq({ name: "Alice", username: "alice garcia", password: "validpass123", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toMatch(/usuario/i);
  });

  it("returns 409 when username is already taken", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    jest.mocked(db.query.users.findFirst).mockResolvedValue({ id: "other", username: "alice" } as any);
    const res = await POST(makeReq({ name: "Alice", username: "alice", password: "validpass123", invite_token: "valid-invite-token" }));
    expect(res.status).toBe(409);
  });

  it("returns 410 when invite_token is invalid or expired", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(undefined);
    const res = await POST(makeReq({ name: "Alice", username: "alice", password: "validpass123", invite_token: "bad-token" }));
    expect(res.status).toBe(410);
  });

  it("creates a personal group and sets active_group_id cookie on valid input", async () => {
    jest.mocked(db.query.group_invitations.findFirst).mockResolvedValue(validInvite as any);
    jest.mocked(db.query.users.findFirst).mockResolvedValue(undefined);

    const res = await POST(makeReq({
      name: "Alice",
      username: "alice",
      password: "validpass123",
      invite_token: "valid-invite-token",
    }));

    expect(res.status).toBe(200);

    // db.insert called 3 times: users, groups, group_members
    expect(db.insert).toHaveBeenCalledTimes(3);

    // Both cookies should be present
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("active_group_id=");
    expect(setCookie).toContain("hermes_session");
  });
});
