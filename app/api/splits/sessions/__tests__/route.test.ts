// app/api/splits/sessions/__tests__/route.test.ts
import { GET, POST } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    query: { split_sessions: { findMany: jest.fn() } },
  },
}));

function makeReq(url: string, opts?: RequestInit, overrides?: Record<string, string | null>) {
  const req = new NextRequest(url, opts);
  const hdrs = { "x-user-id": "user-123", ...overrides };
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((key: string) => hdrs[key] ?? null),
  });
  return req;
}

describe("GET /api/splits/sessions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when x-user-id missing", async () => {
    const req = makeReq("http://localhost/api/splits/sessions", {}, { "x-user-id": null });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns sessions for user", async () => {
    (db.query.split_sessions.findMany as jest.Mock).mockResolvedValue([
      { id: "s1", name: "Cena", owner_user_id: "user-123", status: "open", created_at: 1000 },
    ]);
    const req = makeReq("http://localhost/api/splits/sessions");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("s1");
  });
});

describe("POST /api/splits/sessions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when x-user-id missing", async () => {
    const req = makeReq("http://localhost/api/splits/sessions", {
      method: "POST",
      body: JSON.stringify({ name: "Test" }),
    }, { "x-user-id": null });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when name missing", async () => {
    const req = makeReq("http://localhost/api/splits/sessions", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates session and returns it", async () => {
    const insertMock = { values: jest.fn().mockResolvedValue(undefined) };
    (db.insert as jest.Mock).mockReturnValue(insertMock);

    const req = makeReq("http://localhost/api/splits/sessions", {
      method: "POST",
      body: JSON.stringify({ name: "Cena viernes" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Cena viernes");
    expect(data.status).toBe("open");
  });
});
