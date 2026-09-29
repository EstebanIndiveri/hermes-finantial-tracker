import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  evaluateBetaBuildIsolation,
  runBetaBuildIsolationAssertion,
} from "../assert-beta-build-isolation.mjs";

const scriptPath = fileURLToPath(new URL("../assert-beta-build-isolation.mjs", import.meta.url));
const validEnvironment = {
  HERMES_BETA_ISOLATION_ASSERT: "true",
  NEXT_PUBLIC_APP_URL: "https://hermes-finantial-tracker-z2.vercel.app",
  TURSO_DATABASE_URL: "libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
  TELEGRAM_BOT_TOKEN: "8739389202:synthetic-beta-token-value",
  TELEGRAM_BOT_ID: "8739389202",
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: "Hermes_beta_finantial_bot",
  SESSION_COOKIE_NAME: "hermes_beta_session",
  TELEGRAM_INBOX_ENABLED: "true",
  TELEGRAM_OUTBOX_ENABLED: "true",
  TELEGRAM_OUTBOX_WORKER_ENABLED: "true",
  NOTIFICATIONS_ENABLED: "false",
  AI_MODE: "live",
  OCR_MODE: "live",
  CRON_SECRET: "synthetic-cron-secret",
  TURSO_AUTH_TOKEN: "synthetic-turso-secret",
  SESSION_SECRET: "synthetic-session-secret",
  TELEGRAM_SECRET_TOKEN: "synthetic-webhook-secret",
  WEB_ACCESS_TOKEN: "synthetic-web-access-secret",
  GROQ_API_KEY: "synthetic-groq-key",
  OCR_SPACE_API_KEY: "synthetic-ocr-key",
};

test("attests matching beta build environment", () => {
  const result = evaluateBetaBuildIsolation(validEnvironment);
  assert.equal(result.passed, true);
  assert.deepEqual(result.failedChecks, []);
});

test("fails closed on legacy or mismatched identities and runtime settings", () => {
  const mismatches = [
    ["NEXT_PUBLIC_APP_URL", "https://hermes-finantial-tracker.vercel.app"],
    ["TURSO_DATABASE_URL", "libsql://hermes-acme-eindiveri.aws-ap-northeast-1.turso.io"],
    ["TELEGRAM_BOT_TOKEN", "8884948884:synthetic-legacy-token"],
    ["TELEGRAM_BOT_ID", "8884948884"],
    ["NEXT_PUBLIC_TELEGRAM_BOT_USERNAME", "HermesFinanceAssistBot"],
    ["SESSION_COOKIE_NAME", "hermes_session"],
    ["TELEGRAM_INBOX_ENABLED", "false"],
    ["TELEGRAM_OUTBOX_ENABLED", "false"],
    ["TELEGRAM_OUTBOX_WORKER_ENABLED", "false"],
    ["NOTIFICATIONS_ENABLED", "true"],
    ["AI_MODE", "stub"],
    ["OCR_MODE", "stub"],
    ["GROQ_API_KEY", ""],
    ["OCR_SPACE_API_KEY", ""],
    ["CRON_SECRET", ""],
    ["TURSO_AUTH_TOKEN", ""],
    ["SESSION_SECRET", ""],
    ["TELEGRAM_SECRET_TOKEN", ""],
    ["WEB_ACCESS_TOKEN", ""],
  ];

  for (const [key, value] of mismatches) {
    const result = evaluateBetaBuildIsolation({ ...validEnvironment, [key]: value });
    assert.equal(result.passed, false, `${key} mismatch must fail`);
  }
});

test("prints one allowlisted evidence event without environment values", () => {
  const output = [];
  const ok = runBetaBuildIsolationAssertion(validEnvironment, { log: (line) => output.push(line) });
  assert.equal(ok, true);
  assert.equal(output.length, 1);
  const event = JSON.parse(output[0]);
  assert.deepEqual(Object.keys(event).sort(), ["checks", "event", "failedChecks", "passed"].sort());
  assert.equal(event.event, "beta_build_isolation_attested");
  assert.equal(event.passed, true);
  for (const secret of [validEnvironment.TELEGRAM_BOT_TOKEN, validEnvironment.TURSO_AUTH_TOKEN, validEnvironment.GROQ_API_KEY]) {
    assert.equal(output[0].includes(secret), false);
  }
});

test("failure output does not expose bad origins, database URLs, tokens, or secrets", () => {
  const sentinels = {
    ...validEnvironment,
    NEXT_PUBLIC_APP_URL: "https://legacy-secret-origin.invalid",
    TURSO_DATABASE_URL: "libsql://legacy-secret-db.invalid?auth=sentinel-db-auth",
    TELEGRAM_BOT_TOKEN: "8884948884:sentinel-legacy-token",
    SESSION_SECRET: "sentinel-session-secret",
  };
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: sentinels,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim().split("\n").length, 1);
  for (const secret of [
    sentinels.NEXT_PUBLIC_APP_URL,
    sentinels.TURSO_DATABASE_URL,
    sentinels.TELEGRAM_BOT_TOKEN,
    sentinels.SESSION_SECRET,
    "sentinel-db-auth",
  ]) {
    assert.equal(result.stdout.includes(secret), false);
  }
  const event = JSON.parse(result.stdout);
  assert.equal(event.passed, false);
  assert.ok(event.failedChecks.includes("beta_app_origin"));
  assert.ok(event.failedChecks.includes("beta_telegram_identity"));
});

test("gate off leaves local build output untouched", () => {
  const output = [];
  const ok = runBetaBuildIsolationAssertion({}, { log: (line) => output.push(line) });
  assert.equal(ok, true);
  assert.deepEqual(output, []);
});
