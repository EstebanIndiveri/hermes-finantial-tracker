import assert from "node:assert/strict";
import test from "node:test";
import { validatePostActivationIsolation } from "../validate-post-activation-isolation.mjs";

const now = Date.parse("2026-09-29T16:00:00.000Z");
const capturedAt = "2026-09-29T15:00:00.000Z";

function evidenceSet(environment, providers) {
  return Object.fromEntries(providers.map((provider, index) => [provider, {
    source: provider === "turso" ? "turso-cli" : provider === "telegram" ? "telegram-api" : "vercel-cli",
    capturedAt,
    artifactRef: `evidence/${environment}-${provider}.json`,
    sha256: String(index + 1).repeat(64),
  }]));
}

function fixture() {
  return {
    version: 1,
    beta: {
      environment: "beta",
      deploymentTarget: "production",
      releaseSha: "a".repeat(40),
      vercel: { projectId: "prj_beta_123", appOrigin: "https://hermes-finantial-tracker-z2.vercel.app" },
      database: { id: "01a0c0bd-0601-7f27-b147-915d105b19f2", host: "beta-hermes-esteban-indiveri.aws-us-east-2.turso.io" },
      telegram: {
        botId: "8739389202",
        username: "Hermes_beta_finantial_bot",
        webhookUrl: "https://hermes-finantial-tracker-z2.vercel.app/api/telegram/webhook",
      },
      runtime: {
        flags: { inbox: true, outbox: true, worker: true },
        aiMode: "live",
        ocrMode: "live",
        notificationsEnabled: false,
      },
      evidence: {
        beta: evidenceSet("beta", ["vercel", "turso", "telegram", "runtime"]),
        production: evidenceSet("production", ["vercel", "turso", "telegram"]),
      },
    },
    production: {
      vercel: { projectId: "prj_legacy_123", appOrigin: "https://hermes-finantial-tracker.vercel.app" },
      database: { id: "legacy-db-123", host: "legacy-hermes.aws-us-east-2.turso.io" },
      telegram: {
        botId: "8884948884",
        username: "HermesFinanceAssistBot",
        webhookUrl: "https://hermes-finantial-tracker.vercel.app/api/telegram/webhook",
      },
    },
  };
}

test("accepts an active beta declaration with fresh receipts for both environments", () => {
  const result = validatePostActivationIsolation(fixture(), { now });
  assert.equal(result.ok, true);
  assert.equal(result.postActivationRuntimeConsistent, true);
  assert.equal(result.providerMetadataComparison, "distinct-identities-declared");
  assert.equal(result.isolationVerified, false);
  assert.equal(result.certificationState, "not-certified");
  assert.equal(result.betaDeploymentTarget, "production");
  assert.equal(result.checks.includes("beta-inbox-outbox-worker-enabled"), true);
});

test("rejects missing, stale, malformed or wrongly sourced provider receipts", () => {
  const missing = fixture();
  delete missing.beta.evidence.production.turso;
  assert.throws(() => validatePostActivationIsolation(missing, { now }), (error) => error.code === "INVALID_KEYS");

  const stale = fixture();
  stale.beta.evidence.beta.runtime.capturedAt = "2026-09-01T15:00:00.000Z";
  assert.throws(() => validatePostActivationIsolation(stale, { now }), (error) => error.code === "STALE_EVIDENCE");

  const wrongSource = fixture();
  wrongSource.beta.evidence.beta.telegram.source = "user-supplied";
  assert.throws(() => validatePostActivationIsolation(wrongSource, { now }), (error) => error.code === "INVALID_EVIDENCE_SOURCE");

  const badReceipt = fixture();
  badReceipt.beta.evidence.beta.vercel.artifactRef = "../.env";
  assert.throws(() => validatePostActivationIsolation(badReceipt, { now }), (error) => error.code === "INVALID_EVIDENCE_REFERENCE");
});

test("rejects production identity reuse, including project, DB, bot and webhook target", () => {
  for (const mutate of [
    (input) => { input.beta.vercel.projectId = input.production.vercel.projectId; },
    (input) => { input.beta.database.id = input.production.database.id; },
    (input) => { input.beta.database.host = input.production.database.host; },
    (input) => { input.beta.telegram.botId = input.production.telegram.botId; },
    (input) => { input.beta.telegram.username = input.production.telegram.username; },
    (input) => { input.beta.telegram.webhookUrl = input.production.telegram.webhookUrl; },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => validatePostActivationIsolation(input, { now }));
  }
});

test("requires active beta channels and live AI/OCR while keeping proactive alerts off", () => {
  for (const flag of ["inbox", "outbox", "worker"]) {
    const input = fixture();
    input.beta.runtime.flags[flag] = false;
    assert.throws(() => validatePostActivationIsolation(input, { now }), (error) => error.code === "BETA_FLAGS_NOT_ACTIVE");
  }
  for (const [field, value, code] of [
    ["aiMode", "stub", "BETA_PROVIDERS_NOT_LIVE"],
    ["ocrMode", "stub", "BETA_PROVIDERS_NOT_LIVE"],
    ["notificationsEnabled", true, "BETA_NOTIFICATIONS_ENABLED"],
  ]) {
    const input = fixture();
    input.beta.runtime[field] = value;
    assert.throws(() => validatePostActivationIsolation(input, { now }), (error) => error.code === code);
  }
});

test("rejects secret-bearing and unknown fields; never certifies from local declarations", () => {
  const input = fixture();
  input.beta.telegram.token = "must-not-be-present";
  assert.throws(() => validatePostActivationIsolation(input, { now }), (error) => error.code === "INVALID_KEYS");

  const result = validatePostActivationIsolation(fixture(), { now });
  assert.equal(result.isolationVerified, false);
  assert.equal(result.certificationState, "not-certified");
  assert.deepEqual(result.remainingCertificationGaps, [
    "authenticated deployment binding inventory including secret references",
    "independent proof that beta runtime uses the declared beta provider bindings",
    "owner review of evidence provenance and residual risks",
  ]);
});
