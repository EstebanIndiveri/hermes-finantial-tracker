import { POST } from "../route";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      users: { findFirst: jest.fn() },
    },
  },
}));
jest.mock("@/lib/utils/session", () => ({
  signSession: jest.fn().mockResolvedValue("signed-session-token"),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require("@/lib/db/client");

function makeReq(body: object) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when username is missing", async () => {
    const res = await POST(makeReq({ password: "somepass" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(makeReq({ username: "alice" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when username not found", async () => {
    jest.mocked(db.query.users.findFirst).mockResolvedValue(undefined);
    const res = await POST(makeReq({ username: "notexist", password: "anypass" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when password does not match", async () => {
    const hash = await bcrypt.hash("correctpass", 10);
    jest.mocked(db.query.users.findFirst).mockResolvedValue({
      id: "user-1", name: "Alice", username: "alice", personal_token_hash: hash,
    } as any);
    const res = await POST(makeReq({ username: "alice", password: "wrongpass" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 and sets session cookie when credentials are correct", async () => {
    const hash = await bcrypt.hash("correctpass", 10);
    jest.mocked(db.query.users.findFirst).mockResolvedValue({
      id: "user-1", name: "Alice", username: "alice", personal_token_hash: hash,
    } as any);
    const res = await POST(makeReq({ username: "alice", password: "correctpass" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(res.headers.get("Set-Cookie")).toContain("hermes_session");
  });

  it("lookup is case-insensitive for username", async () => {
    const hash = await bcrypt.hash("mypass", 10);
    jest.mocked(db.query.users.findFirst).mockResolvedValue({
      id: "user-1", name: "Alice", username: "alice", personal_token_hash: hash,
    } as any);
    const res = await POST(makeReq({ username: "ALICE", password: "mypass" }));
    expect(res.status).toBe(200);
  });
});
