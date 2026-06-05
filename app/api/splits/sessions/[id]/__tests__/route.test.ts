// app/api/splits/sessions/[id]/__tests__/route.test.ts
import { GET, PATCH } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      split_sessions: { findFirst: jest.fn() },
      splits: { findMany: jest.fn() },
      split_session_members: { findMany: jest.fn(), findFirst: jest.fn() },
    },
    update: jest.fn(),
  },
}));

function makeReq(url: string, opts?: RequestInit) {
  const req = new NextRequest(url, opts);
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
  });
  return req;
}

const mockSession = {
  id: "s1", name: "Cena", owner_user_id: "user-123", status: "open", created_at: 1000,
};

describe("GET /api/splits/sessions/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when session not found", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await GET(makeReq("http://localhost"), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a member", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue(mockSession);
    (db.query.split_session_members.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await GET(makeReq("http://localhost"), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(403);
  });

  it("returns session with splits and members", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue(mockSession);
    (db.query.split_session_members.findFirst as jest.Mock).mockResolvedValue({ session_id: "s1", user_id: "user-123" });
    (db.query.splits.findMany as jest.Mock).mockResolvedValue([]);
    (db.query.split_session_members.findMany as jest.Mock).mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost"), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.id).toBe("s1");
  });
});

describe("PATCH /api/splits/sessions/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when user is not a member", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({
      ...mockSession, owner_user_id: "other-user",
    });
    (db.query.split_session_members.findFirst as jest.Mock).mockResolvedValue(null);
    const req = makeReq("http://localhost", {
      method: "PATCH", body: JSON.stringify({ status: "closed" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not owner", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({
      ...mockSession, owner_user_id: "other-user",
    });
    (db.query.split_session_members.findFirst as jest.Mock).mockResolvedValue({ session_id: "s1", user_id: "user-123" });
    const req = makeReq("http://localhost", {
      method: "PATCH", body: JSON.stringify({ status: "closed" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(403);
  });

  it("closes session when owner requests it", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue(mockSession);
    (db.query.split_session_members.findFirst as jest.Mock).mockResolvedValue({ session_id: "s1", user_id: "user-123" });
    const updateMock = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(undefined) };
    (db.update as jest.Mock).mockReturnValue(updateMock);
    const req = makeReq("http://localhost", {
      method: "PATCH", body: JSON.stringify({ status: "closed" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
  });
});
