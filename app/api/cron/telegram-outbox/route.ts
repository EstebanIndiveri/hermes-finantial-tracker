import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/auth/cron";
import { resolveTelegramBotId } from "@/lib/telegram/update-inbox";

export const maxDuration = 60;
const WORKER_STATE_HEADER = "X-Hermes-Outbox-Execution";

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
  const authorization = request.headers.get("authorization");
  const authorized = isCronRequestAuthorized(
    authorization,
    process.env.TELEGRAM_OUTBOX_SCHEDULER_SECRET,
  ) || isCronRequestAuthorized(authorization, process.env.CRON_SECRET);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // This recovers replies to user-initiated Telegram updates, not proactive
  // alerts. TELEGRAM_OUTBOX_WORKER_ENABLED is its independent kill switch.
  // A legacy deployment can receive the request while the rollout flag is
  // absent; skip without loading the DB-backed worker.
  if (process.env.TELEGRAM_OUTBOX_WORKER_ENABLED !== "true") {
    return NextResponse.json(
      { ok: true, skipped: true },
      { headers: { [WORKER_STATE_HEADER]: "skipped_worker_disabled" } },
    );
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
    return NextResponse.json(
      { ok: true, ...summary },
      { headers: { [WORKER_STATE_HEADER]: "processed" } },
    );
  } catch {
    // Do not expose provider, database, payload, token, or chat details.
    return NextResponse.json({ error: "Outbox worker failed" }, { status: 503 });
  }
}
