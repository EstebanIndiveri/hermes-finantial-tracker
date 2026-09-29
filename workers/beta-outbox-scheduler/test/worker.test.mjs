import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { BETA_OUTBOX_URL, createOutboxScheduler } from "../src/worker.mjs";

const betaEnv = {
  OUTBOX_WORKER_URL: BETA_OUTBOX_URL,
  SCHEDULER_ENABLED: "true",
  CRON_SECRET: "test-only-secret",
};

function captureLogger() {
  const entries = [];
  return { entries, log: (entry) => entries.push(entry) };
}

test("Wrangler config is pinned to the beta worker and starts disabled", () => {
  const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.deepEqual(config.triggers.crons, ["*/5 * * * *"]);
  assert.equal(config.vars.OUTBOX_WORKER_URL, BETA_OUTBOX_URL);
  assert.equal(config.vars.SCHEDULER_ENABLED, "false");
});

test("targets only the pinned beta endpoint and sends bearer authentication", async () => {
  const logger = captureLogger();
  let request;
  const run = createOutboxScheduler({
    logger,
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, status: 200 };
    },
  });

  const result = await run(betaEnv);

  assert.deepEqual(result, { ok: true, status: 200 });
  assert.equal(request.url, "https://hermes-finantial-tracker-z2.vercel.app/api/cron/telegram-outbox");
  assert.equal(request.init.method, "GET");
  assert.equal(request.init.headers.Authorization, "Bearer test-only-secret");
  assert.equal(request.init.signal instanceof AbortSignal, true);
});

test("rejects any configured non-beta or modified target without fetching", async () => {
  let fetches = 0;
  const logger = captureLogger();
  const run = createOutboxScheduler({ logger, fetchImpl: async () => { fetches += 1; } });

  const result = await run({ ...betaEnv, OUTBOX_WORKER_URL: "https://hermes-finantial-tracker.vercel.app/api/cron/telegram-outbox" });

  assert.deepEqual(result, { ok: false, reason: "invalid_target" });
  assert.equal(fetches, 0);
});

test("skips while disabled and fails closed when the cron secret is missing", async () => {
  let fetches = 0;
  const logger = captureLogger();
  const run = createOutboxScheduler({ logger, fetchImpl: async () => { fetches += 1; } });

  assert.deepEqual(await run({ ...betaEnv, SCHEDULER_ENABLED: "false" }), { ok: true, skipped: true });
  assert.deepEqual(await run({ ...betaEnv, CRON_SECRET: " " }), { ok: false, reason: "missing_secret" });
  assert.equal(fetches, 0);
});

test("aborts a slow request at the configured timeout", async () => {
  const logger = captureLogger();
  const run = createOutboxScheduler({
    logger,
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("private provider detail")), { once: true });
    }),
  });

  assert.deepEqual(await run(betaEnv), { ok: false, reason: "timeout" });
  assert.match(logger.entries[0], /outbox_scheduler_timeout/);
});

test("does not read or log private response bodies, headers, URLs, or thrown details", async () => {
  const logger = captureLogger();
  let bodyReads = 0;
  const run = createOutboxScheduler({
    logger,
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      text: async () => { bodyReads += 1; return "private chat and financial data"; },
    }),
  });
  await run(betaEnv);
  assert.equal(bodyReads, 0);

  const failing = createOutboxScheduler({ logger, fetchImpl: async () => { throw new Error("private chat/token detail"); } });
  await failing(betaEnv);
  const logs = logger.entries.join("\n");
  assert.doesNotMatch(logs, /private|test-only-secret|hermes-finantial-tracker-z2|Authorization/i);
});

test("rejects unexpected cron expressions", async () => {
  let fetches = 0;
  const run = createOutboxScheduler({ logger: captureLogger(), fetchImpl: async () => { fetches += 1; } });
  assert.deepEqual(await run(betaEnv, "* * * * *"), { ok: false, reason: "unexpected_schedule" });
  assert.equal(fetches, 0);
});
