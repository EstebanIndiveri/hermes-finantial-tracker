export const BETA_OUTBOX_URL =
  "https://hermes-finantial-tracker-z2.vercel.app/api/cron/telegram-outbox";
const SCHEDULE = "*/5 * * * *";
const DEFAULT_TIMEOUT_MS = 15_000;

function safeLogger(logger, event) {
  // Emit only fixed event names and numeric/boolean metadata. Never include
  // request headers, response bodies, URLs, exception messages, or secrets.
  try {
    logger.log(JSON.stringify(event));
  } catch {
    // Logging must not change scheduler behavior.
  }
}

export function createOutboxScheduler({
  fetchImpl = fetch,
  logger = console,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  return async function run(env, cron = SCHEDULE) {
    if (cron !== SCHEDULE) {
      safeLogger(logger, { event: "outbox_scheduler_skipped", reason: "unexpected_schedule" });
      return { ok: false, reason: "unexpected_schedule" };
    }
    if (env.SCHEDULER_ENABLED !== "true") {
      safeLogger(logger, { event: "outbox_scheduler_skipped", reason: "disabled" });
      return { ok: true, skipped: true };
    }

    // The target is intentionally pinned in code and checked against the
    // deployment variable to prevent accidental routing to legacy Production.
    if (env.OUTBOX_WORKER_URL !== BETA_OUTBOX_URL) {
      safeLogger(logger, { event: "outbox_scheduler_failed", reason: "invalid_target" });
      return { ok: false, reason: "invalid_target" };
    }
    if (typeof env.TELEGRAM_OUTBOX_SCHEDULER_SECRET !== "string" ||
      env.TELEGRAM_OUTBOX_SCHEDULER_SECRET.trim().length === 0) {
      safeLogger(logger, { event: "outbox_scheduler_failed", reason: "missing_secret" });
      return { ok: false, reason: "missing_secret" };
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(BETA_OUTBOX_URL, {
        method: "GET",
        headers: { Authorization: `Bearer ${env.TELEGRAM_OUTBOX_SCHEDULER_SECRET}` },
        signal: controller.signal,
      });
      const result = { ok: response.ok, status: response.status };
      const executionHeader = response.headers?.get?.("X-Hermes-Outbox-Execution");
      const execution = ["processed", "skipped_worker_disabled"]
        .includes(executionHeader) ? executionHeader : "unknown";
      safeLogger(logger, {
        event: response.ok ? "outbox_scheduler_completed" : "outbox_scheduler_http_error",
        status: response.status,
        execution,
        durationMs: Date.now() - startedAt,
      });
      // Do not read or log the body; the application may return private data.
      return result;
    } catch {
      const timedOut = controller.signal.aborted;
      safeLogger(logger, {
        event: timedOut ? "outbox_scheduler_timeout" : "outbox_scheduler_network_error",
        durationMs: Date.now() - startedAt,
      });
      return { ok: false, reason: timedOut ? "timeout" : "network_error" };
    } finally {
      clearTimeout(timeout);
    }
  };
}

const runOutboxScheduler = createOutboxScheduler();

const worker = {
  scheduled(controller, env, context) {
    context.waitUntil(runOutboxScheduler(env, controller.cron));
  },
};

export default worker;
