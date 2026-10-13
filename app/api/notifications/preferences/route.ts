import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/utils/session";
import { getSessionCookieName } from "@/lib/auth/session-cookie";
import { getProactivePreferences, setProactivePreference } from "@/lib/notifications/proactive-consent";

const patchSchema = z.object({
  kind: z.enum(["dailySummary", "recurring", "reimbursements"]),
  enabled: z.boolean(),
}).strict();

async function sessionUserId(request: NextRequest): Promise<string | null> {
  const cookie = request.cookies.get(getSessionCookieName())?.value;
  return cookie ? verifySession(cookie) : null;
}

function noStore<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await sessionUserId(request);
  if (!userId) return noStore({ error: "Unauthorized" }, 401);
  try {
    return noStore(await getProactivePreferences(userId));
  } catch {
    return noStore({ error: "Preferencias no disponibles" }, 503);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const userId = await sessionUserId(request);
  if (!userId) return noStore({ error: "Unauthorized" }, 401);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "Preferencia inválida" }, 400);
  try {
    return noStore(await setProactivePreference(userId, parsed.data.kind, parsed.data.enabled));
  } catch {
    return noStore({ error: "No se pudo guardar la preferencia" }, 503);
  }
}
