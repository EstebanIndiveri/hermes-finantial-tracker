import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  BETA_OUTBOX_URL,
  BETA_PUSH_OUTBOX_URL,
  createOutboxScheduler,
  createPushOutboxScheduler,
} from "../src/worker.mjs";

const betaEnv = {
  OUTBOX_WORKER_URL: BETA_OUTBOX_URL,
  SCHEDULER_ENABLED: "true",
  TELEGRAM_OUTBOX_SCHEDULER_SECRET: "test-only-secret",
  PUSH_OUTBOX_WORKER_URL: BETA_PUSH_OUTBOX_URL,
  PUSH_SCHEDULER_ENABLED: "false",
  PUSH_OUTBOX_SCHEDULER_SECRET: "push-test-only-secret",
};

function captureLogger() {
  const entries = [];
  return { entries, log: (entry) => entries.push(entry) };
}

test("Wrangler config pins the active beta worker schedule", () => {
  const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.deepEqual(config.triggers.crons, ["*/5 * * * *"]);
  assert.equal(config.workers_dev, false);
  assert.equal(config.vars.OUTBOX_WORKER_URL, BETA_OUTBOX_URL);
  assert.equal(config.vars.SCHEDULER_ENABLED, "true");
  assert.equal(config.vars.PUSH_OUTBOX_WORKER_URL, BETA_PUSH_OUTBOX_URL);
  assert.equal(config.vars.PUSH_SCHEDULER_ENABLED, "false");
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

test("logs only an allowlisted execution state from the beta response header", async () => {
  const logger = captureLogger();
  const run = createOutboxScheduler({
    logger,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "X-Hermes-Outbox-Execution": "skipped_worker_disabled" }),
    }),
  });

  await run(betaEnv);
  assert.deepEqual(JSON.parse(logger.entries[0]).execution, "skipped_worker_disabled");
});

test("rejects any configured non-beta or modified target without fetching", async () => {
  let fetches = 0;
  const logger = captureLogger();
  const run = createOutboxScheduler({ logger, fetchImpl: async () => { fetches += 1; } });

  const result = await run({ ...betaEnv, OUTBOX_WORKER_URL: "https://hermes-finantial-tracker.vercel.app/api/cron/telegram-outbox" });

  assert.deepEqual(result, { ok: false, reason: "invalid_target" });
  assert.equal(fetches, 0);
});

test("skips while disabled and fails closed when the dedicated scheduler secret is missing", async () => {
  let fetches = 0;
  const logger = captureLogger();
  const run = createOutboxScheduler({ logger, fetchImpl: async () => { fetches += 1; } });

  assert.deepEqual(await run({ ...betaEnv, SCHEDULER_ENABLED: "false" }), { ok: true, skipped: true });
  assert.deepEqual(await run({ ...betaEnv, TELEGRAM_OUTBOX_SCHEDULER_SECRET: " " }), { ok: false, reason: "missing_secret" });
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

test("push recovery is independently disabled without fetching", async () => {
  let fetches = 0;
  const run = createPushOutboxScheduler({ logger: captureLogger(), fetchImpl: async () => { fetches += 1; } });
  assert.deepEqual(await run(betaEnv), { ok: true, skipped: true });
  assert.equal(fetches, 0);
});

test("push recovery targets only the pinned beta endpoint with its dedicated secret", async () => {
  const logger = captureLogger();
  let request;
  const run = createPushOutboxScheduler({
    logger,
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, status: 200 };
    },
  });

  const result = await run({ ...betaEnv, PUSH_SCHEDULER_ENABLED: "true" });
  assert.deepEqual(result, { ok: true, status: 200 });
  assert.equal(request.url, BETA_PUSH_OUTBOX_URL);
  assert.equal(request.init.method, "GET");
  assert.equal(request.init.headers.Authorization, "Bearer push-test-only-secret");
  assert.equal(request.init.signal instanceof AbortSignal, true);
});

test("push recovery fails closed for a modified target or missing secret", async () => {
  let fetches = 0;
  const run = createPushOutboxScheduler({ logger: captureLogger(), fetchImpl: async () => { fetches += 1; } });
  const enabled = { ...betaEnv, PUSH_SCHEDULER_ENABLED: "true" };
  assert.deepEqual(await run({ ...enabled, PUSH_OUTBOX_WORKER_URL: `${BETA_PUSH_OUTBOX_URL}/` }), { ok: false, reason: "invalid_target" });
  assert.deepEqual(await run({ ...enabled, PUSH_OUTBOX_SCHEDULER_SECRET: " " }), { ok: false, reason: "missing_secret" });
  assert.equal(fetches, 0);
});

test("push recovery uses its own bounded timeout and does not log private details", async () => {
  const logger = captureLogger();
  const run = createPushOutboxScheduler({
    logger,
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("private push token detail")), { once: true });
    }),
  });
  assert.deepEqual(await run({ ...betaEnv, PUSH_SCHEDULER_ENABLED: "true" }), { ok: false, reason: "timeout" });
  assert.match(logger.entries[0], /push_outbox_scheduler_timeout/);
  assert.doesNotMatch(logger.entries.join("\n"), /private|push-test-only-secret|hermes-finantial-tracker-z2|Authorization/i);
});
