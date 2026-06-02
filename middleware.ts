import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/utils/session";
import { getPersonalGroup } from "@/lib/groups/permissions";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/telegram/webhook",
  "/api/cron",
  "/api/join",
  "/join",
];

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? await verifySession(cookie) : null;
  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const res = NextResponse.next();
  res.headers.set("x-user-id", userId);

  // Resolve active group
  const activeGroupId = req.cookies.get("active_group_id")?.value;
  if (activeGroupId) {
    res.headers.set("x-group-id", activeGroupId);
  } else {
    // First request: resolve personal group and set cookie
    try {
      const personalGroupId = await getPersonalGroup(userId);
      if (personalGroupId) {
        res.headers.set("x-group-id", personalGroupId);
        res.cookies.set("active_group_id", personalGroupId, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
      }
    } catch {
      // No group yet (pre-migration), proceed without group
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
