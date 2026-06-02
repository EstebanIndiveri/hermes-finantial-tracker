import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

vi.mock("@/lib/db/client", () => ({ db: { query: { users: { findMany: vi.fn() } } } }));
vi.mock("@/lib/utils/session", () => ({ signSession: vi.fn().mockResolvedValue("signed-session-token") }));

const { db } = await import("@/lib/db/client");

function makeReq(body: object) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when token is missing", async () => {
    vi.mocked(db.query.users.findMany).mockResolvedValue([]);
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("authenticates user by bcrypt token hash", async () => {
    const hash = await bcrypt.hash("mysecrettoken", 10);
    vi.mocked(db.query.users.findMany).mockResolvedValue([
      { id: "user-1", name: "Alice", personal_token_hash: hash, telegram_user_id: null, active_telegram_group_id: null, created_at: 0 },
    ] as any);
    const res = await POST(makeReq({ token: "mysecrettoken" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("returns 401 when token does not match any user hash", async () => {
    const hash = await bcrypt.hash("correcttoken", 10);
    vi.mocked(db.query.users.findMany).mockResolvedValue([
      { id: "user-1", name: "Alice", personal_token_hash: hash, telegram_user_id: null, active_telegram_group_id: null, created_at: 0 },
    ] as any);
    const res = await POST(makeReq({ token: "wrongtoken" }));
    expect(res.status).toBe(401);
  });

  it("falls back to WEB_ACCESS_TOKEN env var for legacy user with null hash", async () => {
    process.env.WEB_ACCESS_TOKEN = "legacy-env-token";
    vi.mocked(db.query.users.findMany).mockResolvedValue([
      { id: "owner-1", name: "Owner", personal_token_hash: null, telegram_user_id: null, active_telegram_group_id: null, created_at: 0 },
    ] as any);
    const res = await POST(makeReq({ token: "legacy-env-token" }));
    expect(res.status).toBe(200);
    delete process.env.WEB_ACCESS_TOKEN;
  });

  it("returns 401 when legacy token does not match env var", async () => {
    process.env.WEB_ACCESS_TOKEN = "correct-env-token";
    vi.mocked(db.query.users.findMany).mockResolvedValue([
      { id: "owner-1", name: "Owner", personal_token_hash: null, telegram_user_id: null, active_telegram_group_id: null, created_at: 0 },
    ] as any);
    const res = await POST(makeReq({ token: "wrong-token" }));
    expect(res.status).toBe(401);
    delete process.env.WEB_ACCESS_TOKEN;
  });
});
