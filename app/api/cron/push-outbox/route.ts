import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/auth/cron";
import { isPushCanaryConfigured, isPushCanaryEnabled } from "@/lib/notifications/push-canary";

export const maxDuration = 30;

function configured(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!isCronRequestAuthorized(authorization, process.env.PUSH_OUTBOX_SCHEDULER_SECRET) &&
      !isCronRequestAuthorized(authorization, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // No worker import or DB access until the scoped beta push lane is on.
  if (process.env.WEB_PUSH_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (!isPushCanaryConfigured() || !isPushCanaryEnabled() || !configured(process.env.TURSO_DATABASE_URL) || !configured(process.env.TURSO_AUTH_TOKEN) ||
      !configured(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) || !configured(process.env.VAPID_PRIVATE_KEY)) {
    return NextResponse.json({ error: "Push outbox unavailable" }, { status: 503 });
  }

  try {
    const { processPushOutbox } = await import("@/lib/notifications/push-outbox-worker");
    const summary = await processPushOutbox({ maxClaims: 25, maxRuntimeMs: 10_000 });
    return NextResponse.json({ ok: true, ...summary });
  } catch {
    return NextResponse.json({ error: "Push outbox failed" }, { status: 503 });
  }
}
