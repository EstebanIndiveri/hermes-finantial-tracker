import { middleware } from "../middleware";
import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/utils/session";

process.env.SESSION_SECRET = "test-secret-32-chars-long-padding!!";

describe("middleware", () => {
  test("allows public path /login without authentication", () => {
    const req = new NextRequest("http://localhost:3000/login");
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  test("allows public path /api/auth/login without authentication", () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login");
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  test("allows public path /api/auth/logout without authentication", () => {
    const req = new NextRequest("http://localhost:3000/api/auth/logout");
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  test("allows public path /api/telegram/webhook without authentication", () => {
    const req = new NextRequest("http://localhost:3000/api/telegram/webhook");
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  test("allows public path /api/cron without authentication", () => {
    const req = new NextRequest("http://localhost:3000/api/cron");
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  test("redirects to /login when accessing protected page without session", () => {
    const req = new NextRequest("http://localhost:3000/dashboard");
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  test("returns 401 JSON when accessing protected API route without session", () => {
    const req = new NextRequest("http://localhost:3000/api/transactions");
    const res = middleware(req);
    expect(res.status).toBe(401);
  });

  test("allows access to protected page with valid session cookie", () => {
    const sessionValue = signSession("user-123");
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: `hermes_session=${sessionValue}`,
      },
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  test("sets x-user-id header when session is valid", () => {
    const sessionValue = signSession("user-abc");
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: `hermes_session=${sessionValue}`,
      },
    });
    const res = middleware(req);
    expect(res.headers.get("x-user-id")).toBe("user-abc");
  });

  test("redirects to /login when session cookie is invalid", () => {
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: "hermes_session=invalid-garbage",
      },
    });
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  test("allows access to protected API route with valid session", () => {
    const sessionValue = signSession("user-456");
    const req = new NextRequest("http://localhost:3000/api/transactions", {
      headers: {
        cookie: `hermes_session=${sessionValue}`,
      },
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-user-id")).toBe("user-456");
  });

  test("does not block _next/static paths", () => {
    const sessionValue = signSession("user-123");
    const req = new NextRequest("http://localhost:3000/_next/static/chunks/main.js", {
      headers: { cookie: `hermes_session=${sessionValue}` },
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  test("does not block _next/image paths", () => {
    const sessionValue = signSession("user-123");
    const req = new NextRequest("http://localhost:3000/_next/image?url=/logo.png", {
      headers: { cookie: `hermes_session=${sessionValue}` },
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  test("does not block favicon.ico", () => {
    const sessionValue = signSession("user-123");
    const req = new NextRequest("http://localhost:3000/favicon.ico", {
      headers: { cookie: `hermes_session=${sessionValue}` },
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });
});
