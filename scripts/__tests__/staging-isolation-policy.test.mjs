import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateStagingIsolation } from "../staging-isolation-policy.mjs";

const staging = JSON.parse(await readFile("config/staging-isolation.example.json", "utf8"));
const production = JSON.parse(await readFile("config/production-reference.example.json", "utf8"));

function copy(value) {
  return structuredClone(value);
}

test("accepts all-null production fingerprints as unavailable without exposing secret references", () => {
  const result = validateStagingIsolation(copy(staging), copy(production));
  assert.equal(result.ok, true);
  assert.equal(result.localManifestConsistent, true);
  assert.equal(result.isolationVerified, false);
  assert.equal(result.providerVerificationRequired, true);
  assert.equal(result.trustLevel, "unverified-local-declaration");
  assert.equal(result.productionFingerprintComparison, "unavailable");
  assert.deepEqual(result.unavailableProductionFingerprintKeys, [
    "cron",
    "database",
    "session",
    "telegramBot",
    "telegramWebhook",
    "webAccess",
  ]);
  assert.equal(result.checks.length, 15);
  assert.equal(result.checks.includes("declared-distinct-secret-references"), true);
  assert.equal(result.checks.includes("staging-secret-fingerprints-present"), true);
  assert.equal(result.checks.includes("declared-distinct-secret-references-and-fingerprints"), false);
  assert.equal(JSON.stringify(result).includes("vercel:"), false);
});

test("rejects unknown keys and production identity collisions", () => {
  const unknown = copy(staging);
  unknown.rawToken = "forbidden";
  assert.throws(
    () => validateStagingIsolation(unknown, copy(production)),
    (error) => error.code === "INVALID_KEYS" && error.field === "staging",
  );

  const additionalAlias = copy(staging);
  additionalAlias.appOrigin = "https://hermes-production.example.invalid";
  additionalAlias.webhookUrl = `${additionalAlias.appOrigin}/api/telegram/webhook`;
  additionalAlias.e2eAllowedHost = "hermes-production.example.invalid";
  const aliasReference = copy(production);
  aliasReference.approvedStagingHostSuffix = "example.invalid";
  assert.throws(
    () => validateStagingIsolation(additionalAlias, aliasReference),
    (error) => error.code === "KNOWN_PRODUCTION_HOST",
  );

  for (const field of ["vercelProjectId", "appOrigin", "databaseHost", "databaseId", "telegramBotId", "telegramBotUsername", "webhookUrl", "sessionCookieName"]) {
    const colliding = copy(staging);
    colliding[field] = production[field];
    assert.throws(
      () => validateStagingIsolation(colliding, copy(production)),
      (error) => error.code === "PRODUCTION_COLLISION" || error.code === "INVALID_WEBHOOK" || error.code === "INVALID_E2E_HOST",
      `expected ${field} collision to fail`,
    );
  }
});

test("rejects an incomplete production host denylist", () => {
  const incomplete = copy(production);
  incomplete.productionHostDenylist = [new URL(incomplete.appOrigin).hostname];
  assert.throws(
    () => validateStagingIsolation(copy(staging), incomplete),
    (error) => error.code === "INVALID_PRODUCTION_REFERENCE",
  );
});

test("rejects known production hosts and hosts outside the approved staging suffix", () => {
  const knownProduction = copy(staging);
  knownProduction.appOrigin = "https://hermes-finantial-tracker.vercel.app";
  knownProduction.webhookUrl = `${knownProduction.appOrigin}/api/telegram/webhook`;
  knownProduction.e2eAllowedHost = "hermes-finantial-tracker.vercel.app";
  const permissiveReference = copy(production);
  permissiveReference.approvedStagingHostSuffix = "vercel.app";
  assert.throws(
    () => validateStagingIsolation(knownProduction, permissiveReference),
    (error) => error.code === "KNOWN_PRODUCTION_HOST",
  );

  const unapproved = copy(staging);
  unapproved.appOrigin = "https://unrelated.example.invalid";
  unapproved.webhookUrl = `${unapproved.appOrigin}/api/telegram/webhook`;
  unapproved.e2eAllowedHost = "unrelated.example.invalid";
  assert.throws(
    () => validateStagingIsolation(unapproved, copy(production)),
    (error) => error.code === "UNAPPROVED_STAGING_HOST",
  );
});

test("accepts partial production fingerprints when each supplied fingerprint differs", () => {
  const partial = copy(production);
  partial.secretFingerprints.database = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  const result = validateStagingIsolation(copy(staging), partial);

  assert.equal(result.productionFingerprintComparison, "partial");
  assert.deepEqual(result.unavailableProductionFingerprintKeys, [
    "cron",
    "session",
    "telegramBot",
    "telegramWebhook",
    "webAccess",
  ]);

  const complete = copy(production);
  for (const [index, key] of Object.keys(complete.secretFingerprints).entries()) {
    complete.secretFingerprints[key] = String.fromCharCode(97 + index).repeat(64);
  }
  const completeResult = validateStagingIsolation(copy(staging), complete);
  assert.equal(completeResult.productionFingerprintComparison, "complete");
  assert.deepEqual(completeResult.unavailableProductionFingerprintKeys, []);
});

test("rejects provider identity and supplied production fingerprint collisions", () => {
  for (const field of ["vercelProjectId", "databaseId", "telegramBotId"]) {
    const colliding = copy(staging);
    colliding[field] = production[field];
    assert.throws(
      () => validateStagingIsolation(colliding, copy(production)),
      (error) => error.code === "PRODUCTION_COLLISION",
    );
  }

  const fingerprintReference = copy(production);
  fingerprintReference.secretFingerprints.database = staging.secretFingerprints.database;
  const aliasedSecret = copy(staging);
  assert.throws(
    () => validateStagingIsolation(aliasedSecret, fingerprintReference),
    (error) => error.code === "PRODUCTION_COLLISION" && error.field === "secretFingerprints.database",
  );

  const crossKeyReference = copy(production);
  crossKeyReference.secretFingerprints.database = staging.secretFingerprints.cron;
  assert.throws(
    () => validateStagingIsolation(copy(staging), crossKeyReference),
    (error) => error.code === "PRODUCTION_COLLISION" && error.field === "secretFingerprints.cron",
  );
});

test("rejects invalid or reused supplied production fingerprints", () => {
  const invalid = copy(production);
  invalid.secretFingerprints.database = "not-a-sha256-fingerprint";
  assert.throws(
    () => validateStagingIsolation(copy(staging), invalid),
    (error) => error.code === "INVALID_SECRET_FINGERPRINT" && error.field === "productionReference.secretFingerprints.database",
  );

  const reused = copy(production);
  reused.secretFingerprints.database = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  reused.secretFingerprints.telegramBot = reused.secretFingerprints.database;
  assert.throws(
    () => validateStagingIsolation(copy(staging), reused),
    (error) => error.code === "REUSED_SECRET_FINGERPRINT" && error.field === "productionReference.secretFingerprints",
  );
});

test("rejects enabled rollout flags, providers, notifications and non-synthetic data", () => {
  for (const key of ["inbox", "outbox", "worker"]) {
    const enabled = copy(staging);
    enabled.flags[key] = true;
    assert.throws(
      () => validateStagingIsolation(enabled, copy(production)),
      (error) => error.code === "FLAGS_NOT_DISABLED",
    );
  }

  for (const [field, value] of [["aiMode", "live"], ["ocrMode", "live"], ["notificationsEnabled", true], ["dataPolicy", "copied-production"]]) {
    const unsafe = copy(staging);
    unsafe[field] = value;
    assert.throws(() => validateStagingIsolation(unsafe, copy(production)));
  }
});

test("rejects raw or reused secret values and an inexact webhook", () => {
  const raw = copy(staging);
  raw.secretRefs.database = "libsql://token@example.invalid";
  assert.throws(
    () => validateStagingIsolation(raw, copy(production)),
    (error) => error.code === "INVALID_SECRET_REFERENCE",
  );

  const reused = copy(staging);
  reused.secretRefs.cron = reused.secretRefs.session;
  assert.throws(
    () => validateStagingIsolation(reused, copy(production)),
    (error) => error.code === "REUSED_SECRET_REFERENCE",
  );

  const wrongWebhook = copy(staging);
  wrongWebhook.webhookUrl = `${staging.appOrigin}/api/telegram/webhook?debug=true`;
  assert.throws(
    () => validateStagingIsolation(wrongWebhook, copy(production)),
    (error) => error.code === "INVALID_WEBHOOK",
  );
});
