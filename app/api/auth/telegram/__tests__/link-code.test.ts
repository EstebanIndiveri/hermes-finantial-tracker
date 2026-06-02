import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../link-code/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/session", () => ({ verifySession: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  },
}));

const { verifySession } = await import("@/lib/utils/session");
const { db } = await import("@/lib/db/client");

function makeReq() {
  return new NextRequest("http://localhost/api/auth/telegram/link-code", {
    method: "POST",
    headers: { cookie: "hermes_session=valid" },
  });
}

describe("POST /api/auth/telegram/link-code", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when session is invalid", async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 6-digit code and expires_at for authenticated user", async () => {
    vi.mocked(verifySession).mockResolvedValue("user-1");
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.code).toMatch(/^\d{6}$/);
    expect(data.expires_at).toBeGreaterThan(Date.now());
    expect(db.delete).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });
});
