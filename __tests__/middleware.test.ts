import { middleware } from "../middleware";
import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/utils/session";

process.env.SESSION_SECRET = "test-secret-32-chars-long-padding!!";

// Mock the database-dependent getPersonalGroup function
jest.mock("@/lib/groups/permissions", () => ({
  getPersonalGroup: jest.fn(),
}));

// Mock the DB client
jest.mock("@/lib/db/client", () => ({
  db: { select: jest.fn() },
}));

import { getPersonalGroup } from "@/lib/groups/permissions";

// Helper: configure the db.select mock chain to resolve with given rows
function mockDbChainWith(rows: object[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { db } = jest.requireMock("@/lib/db/client") as { db: { select: jest.Mock } };
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
    // Support .then() chained directly on the builder
    then: (resolve: (v: object[]) => unknown) => Promise.resolve(rows).then(resolve),
  };
  db.select.mockReturnValue(chain);
}

describe("middleware", () => {
  beforeEach(() => {
    // Default: user has completed onboarding
    mockDbChainWith([{ onboarding_completed_at: 1_700_000_000_000 }]);
  });
  test("allows public path /login without authentication", async () => {
    const req = new NextRequest("http://localhost:3000/login");
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  test("allows public path /api/auth/login without authentication", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login");
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  test("allows public path /api/auth/logout without authentication", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/logout");
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  test("allows public path /api/telegram/webhook without authentication", async () => {
    const req = new NextRequest("http://localhost:3000/api/telegram/webhook");
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  test("allows public path /api/cron without authentication", async () => {
    const req = new NextRequest("http://localhost:3000/api/cron");
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  test("redirects to /login when accessing protected page without session", async () => {
    const req = new NextRequest("http://localhost:3000/dashboard");
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  test("returns 401 JSON when accessing protected API route without session", async () => {
    const req = new NextRequest("http://localhost:3000/api/transactions");
    const res = await middleware(req);
    expect(res.status).toBe(401);
  });

  test("allows access to protected page with valid session cookie", async () => {
    const sessionValue = await signSession("user-123");
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: `hermes_session=${sessionValue}`,
      },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  test("sets x-user-id header when session is valid", async () => {
    const sessionValue = await signSession("user-abc");
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: `hermes_session=${sessionValue}`,
      },
    });
    const res = await middleware(req);
    expect(res.headers.get("x-user-id")).toBe("user-abc");
  });

  test("redirects to /login when session cookie is invalid", async () => {
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: "hermes_session=invalid-garbage",
      },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  test("allows access to protected API route with valid session", async () => {
    const sessionValue = await signSession("user-456");
    const req = new NextRequest("http://localhost:3000/api/transactions", {
      headers: {
        cookie: `hermes_session=${sessionValue}`,
      },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-user-id")).toBe("user-456");
  });

  test("does not block _next/static paths", async () => {
    const sessionValue = await signSession("user-123");
    const req = new NextRequest("http://localhost:3000/_next/static/chunks/main.js", {
      headers: { cookie: `hermes_session=${sessionValue}` },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  test("does not block _next/image paths", async () => {
    const sessionValue = await signSession("user-123");
    const req = new NextRequest("http://localhost:3000/_next/image?url=/logo.png", {
      headers: { cookie: `hermes_session=${sessionValue}` },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  test("does not block favicon.ico", async () => {
    const sessionValue = await signSession("user-123");
    const req = new NextRequest("http://localhost:3000/favicon.ico", {
      headers: { cookie: `hermes_session=${sessionValue}` },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  test("returns 401 when accessing /api/join without authentication", async () => {
    const req = new NextRequest("http://localhost:3000/api/join/some-token");
    const res = await middleware(req);
    expect(res.status).toBe(401);
  });

  test("allows public path /join without authentication", async () => {
    const req = new NextRequest("http://localhost:3000/join");
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  test("sets x-group-id header from active_group_id cookie when present", async () => {
    const sessionValue = await signSession("user-123");
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: `hermes_session=${sessionValue}; active_group_id=group-abc`,
      },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-group-id")).toBe("group-abc");
    expect(res.headers.get("x-user-id")).toBe("user-123");
  });

  test("resolves personal group and sets cookie when active_group_id is missing", async () => {
    const sessionValue = await signSession("user-456");
    (getPersonalGroup as jest.Mock).mockResolvedValueOnce("group-personal-456");
    
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: `hermes_session=${sessionValue}`,
      },
    });
    const res = await middleware(req);
    
    expect(res.status).toBe(200);
    expect(res.headers.get("x-group-id")).toBe("group-personal-456");
    expect(res.headers.get("x-user-id")).toBe("user-456");
    expect(getPersonalGroup).toHaveBeenCalledWith("user-456");
    
    // Check that the cookie was set
    const setCookieHeader = res.headers.get("set-cookie");
    expect(setCookieHeader).toContain("active_group_id=group-personal-456");
    expect(setCookieHeader).toContain("HttpOnly");
  });

  test("proceeds without x-group-id when getPersonalGroup returns null", async () => {
    const sessionValue = await signSession("user-nomigration");
    (getPersonalGroup as jest.Mock).mockResolvedValueOnce(null);
    
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: `hermes_session=${sessionValue}`,
      },
    });
    const res = await middleware(req);
    
    expect(res.status).toBe(200);
    expect(res.headers.get("x-user-id")).toBe("user-nomigration");
    expect(res.headers.get("x-group-id")).toBeNull();
  });

  test("proceeds without x-group-id when getPersonalGroup throws (pre-migration)", async () => {
    const sessionValue = await signSession("user-error");
    (getPersonalGroup as jest.Mock).mockRejectedValueOnce(new Error("Table does not exist"));
    
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: `hermes_session=${sessionValue}`,
      },
    });
    const res = await middleware(req);
    
    expect(res.status).toBe(200);
    expect(res.headers.get("x-user-id")).toBe("user-error");
    expect(res.headers.get("x-group-id")).toBeNull();
  });

  test("redirects to /onboarding when user has not completed onboarding and visits /dashboard", async () => {
    mockDbChainWith([{ onboarding_completed_at: null }]);
    const sessionValue = await signSession("user-new");
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: { cookie: `hermes_session=${sessionValue}` },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/onboarding");
  });

  test("allows /dashboard access when onboarding is completed", async () => {
    mockDbChainWith([{ onboarding_completed_at: 1_700_000_000_000 }]);
    const sessionValue = await signSession("user-done");
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: { cookie: `hermes_session=${sessionValue}` },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });
});
