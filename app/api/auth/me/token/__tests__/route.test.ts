import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "../route";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

vi.mock("@/lib/utils/session", () => ({ verifySession: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    query: { users: { findFirst: vi.fn() } },
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
  },
}));

const { verifySession } = await import("@/lib/utils/session");
const { db } = await import("@/lib/db/client");

function makeReq(body: object, cookie = "valid-cookie") {
  return new NextRequest("http://localhost/api/auth/me/token", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: `hermes_session=${cookie}` },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/auth/me/token", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when session is invalid", async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await PATCH(makeReq({ current_token: "old", new_token: "newtoken123" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when current_token does not match hash", async () => {
    vi.mocked(verifySession).mockResolvedValue("user-1");
    const hash = await bcrypt.hash("correct-token", 10);
    vi.mocked(db.query.users.findFirst).mockResolvedValue({ id: "user-1", personal_token_hash: hash } as any);
    const res = await PATCH(makeReq({ current_token: "wrong-token", new_token: "newtoken123" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when new_token is shorter than 8 chars", async () => {
    vi.mocked(verifySession).mockResolvedValue("user-1");
    const hash = await bcrypt.hash("correct-token", 10);
    vi.mocked(db.query.users.findFirst).mockResolvedValue({ id: "user-1", personal_token_hash: hash } as any);
    const res = await PATCH(makeReq({ current_token: "correct-token", new_token: "short" }));
    expect(res.status).toBe(400);
  });

  it("updates token hash when valid current_token provided (bcrypt)", async () => {
    vi.mocked(verifySession).mockResolvedValue("user-1");
    const hash = await bcrypt.hash("correct-token", 10);
    vi.mocked(db.query.users.findFirst).mockResolvedValue({ id: "user-1", personal_token_hash: hash } as any);
    const res = await PATCH(makeReq({ current_token: "correct-token", new_token: "newtoken123" }));
    expect(res.status).toBe(200);
  });

  it("falls back to WEB_ACCESS_TOKEN for legacy owner (null hash)", async () => {
    process.env.WEB_ACCESS_TOKEN = "legacy-token";
    vi.mocked(verifySession).mockResolvedValue("owner-1");
    vi.mocked(db.query.users.findFirst).mockResolvedValue({ id: "owner-1", personal_token_hash: null } as any);
    const res = await PATCH(makeReq({ current_token: "legacy-token", new_token: "newtoken123" }));
    expect(res.status).toBe(200);
    delete process.env.WEB_ACCESS_TOKEN;
  });
});
