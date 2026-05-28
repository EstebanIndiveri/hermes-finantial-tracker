import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/utils/session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/telegram/webhook", "/api/cron"];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? verifySession(cookie) : null;
  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const res = NextResponse.next();
  res.headers.set("x-user-id", userId);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
