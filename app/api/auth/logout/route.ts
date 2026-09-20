import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName } from "@/lib/auth/session-cookie";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const res = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  res.cookies.set(getSessionCookieName(), "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  res.cookies.set("active_group_id", "", { maxAge: 0, path: "/" });
  return res;
}
