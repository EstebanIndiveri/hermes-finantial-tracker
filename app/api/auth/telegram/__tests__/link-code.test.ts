import { POST } from "../link-code/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/utils/session", () => ({ verifySession: jest.fn() }));
jest.mock("@/lib/db/client", () => ({
  db: {
    insert: jest.fn().mockReturnValue({ values: jest.fn().mockReturnValue({ onConflictDoUpdate: jest.fn().mockResolvedValue(undefined) }) }),
    delete: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
    query: { telegram_link_codes: { findFirst: jest.fn() } },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifySession } = require("@/lib/utils/session");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require("@/lib/db/client");

function makeReq(cookie = "valid-session") {
  return new NextRequest("http://localhost/api/auth/telegram/link-code", {
    method: "POST",
    headers: { cookie: `hermes_session=${cookie}` },
  });
}

describe("POST /api/auth/telegram/link-code", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when session is invalid", async () => {
    jest.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it("generates and returns a 6-digit code for authenticated user", async () => {
    jest.mocked(verifySession).mockResolvedValue("user-1");
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.code).toBeDefined();
    expect(String(data.code)).toMatch(/^\d{6}$/);
  });

  it("stores the code in db for the user", async () => {
    jest.mocked(verifySession).mockResolvedValue("user-1");
    await POST(makeReq());
    expect(db.insert).toHaveBeenCalled();
  });
});
