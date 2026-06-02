import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/utils/session";
import { getPersonalGroup, getGroupMembership } from "@/lib/groups/permissions";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/telegram/webhook",
  "/api/cron",
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

  // /onboarding is accessible to authenticated users — skip group resolution
  if (pathname === "/onboarding") {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  res.headers.set("x-user-id", userId);

  // Enforce onboarding for dashboard routes
  if (pathname.startsWith("/dashboard")) {
    const onboardingDone = req.cookies.get("onboarding_done")?.value;
    if (!onboardingDone) {
      const userRow = await db
        .select({ onboarding_completed_at: users.onboarding_completed_at })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then(rows => rows[0] ?? null);
      if (!userRow?.onboarding_completed_at) {
        return NextResponse.redirect(new URL("/onboarding", req.url));
      }
      // DB confirms onboarding done — backfill the cookie so future requests skip the DB
      res.cookies.set("onboarding_done", "1", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      });
    }
  }

  // Resolve active group — verify the user still belongs to the stored group
  const activeGroupId = req.cookies.get("active_group_id")?.value;
  if (activeGroupId) {
    const membership = await getGroupMembership(userId, activeGroupId).catch(() => null);
    if (membership) {
      res.headers.set("x-group-id", activeGroupId);
    } else {
      // User was removed from the group — clear cookie and fall back to personal group
      res.cookies.delete("active_group_id");
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
        // No group found, proceed without group
      }
    }
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
