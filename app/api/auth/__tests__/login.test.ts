import { POST } from "../login/route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { verifySession } from "@/lib/utils/session";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      users: {
        findFirst: jest.fn(),
      },
    },
  },
}));

const mockFindFirst = db.query.users.findFirst as jest.MockedFunction<typeof db.query.users.findFirst>;

process.env.WEB_ACCESS_TOKEN = "test-access-token";
process.env.SESSION_SECRET = "test-secret-32-chars-long-padding!!";

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 400 when body is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: "invalid-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Missing token");
  });

  test("returns 400 when token field is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Missing token");
  });

  test("returns 401 when token is incorrect", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "wrong-token" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  test("returns 500 when no user exists in database", async () => {
    mockFindFirst.mockResolvedValueOnce(undefined);
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "test-access-token" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("No user found. Run seed first.");
  });

  test("returns session cookie when token is valid", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "user-123",
      name: "Test User",
      telegram_user_id: null,
      created_at: Date.now(),
    });
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "test-access-token" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    const cookie = res.cookies.get("hermes_session");
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/");

    const userId = verifySession(cookie!.value);
    expect(userId).toBe("user-123");
  });

  test("cookie has correct security attributes", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "user-456",
      name: "Another User",
      telegram_user_id: null,
      created_at: Date.now(),
    });
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "test-access-token" }),
    });
    const res = await POST(req);
    const cookie = res.cookies.get("hermes_session");
    
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.path).toBe("/");
  });
});
