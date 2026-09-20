import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/auth/cron";
import { resolveTelegramBotId } from "@/lib/telegram/update-inbox";
import { getNotificationsRuntimeMode } from "@/lib/runtime/notifications";

export const maxDuration = 60;

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function workerPrerequisitesReady(env: NodeJS.ProcessEnv): boolean {
  return env.TELEGRAM_INBOX_ENABLED === "true" &&
    env.TELEGRAM_OUTBOX_ENABLED === "true" &&
    hasValue(env.TELEGRAM_BOT_TOKEN) &&
    hasValue(env.TURSO_DATABASE_URL) &&
    hasValue(env.TURSO_AUTH_TOKEN);
}

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notificationsMode = getNotificationsRuntimeMode();
  if (notificationsMode === "invalid") {
    return NextResponse.json({ error: "Notifications unavailable" }, { status: 503 });
  }
  if (notificationsMode === "disabled") {
    return NextResponse.json({ ok: true, skipped: true, reason: "notifications_disabled" });
  }

  // A legacy deployment can receive the scheduled request while the rollout
  // flag is absent. Skip successfully without loading the DB-backed worker.
  if (process.env.TELEGRAM_OUTBOX_WORKER_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Check every deployment prerequisite before importing or claiming any row.
  if (!workerPrerequisitesReady(process.env)) {
    return NextResponse.json({ error: "Outbox worker unavailable" }, { status: 503 });
  }

  let botId: string;
  try {
    botId = resolveTelegramBotId();
  } catch {
    return NextResponse.json({ error: "Outbox worker unavailable" }, { status: 503 });
  }

  try {
    const { runTelegramOutboxWorker } = await import("@/lib/telegram/outbox-worker");
    const summary = await runTelegramOutboxWorker({
      botId,
      token: process.env.TELEGRAM_BOT_TOKEN,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch {
    // Do not expose provider, database, payload, token, or chat details.
    return NextResponse.json({ error: "Outbox worker failed" }, { status: 503 });
  }
}
