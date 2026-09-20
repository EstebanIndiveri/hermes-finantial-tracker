import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateStagingIsolation } from "../staging-isolation-policy.mjs";

const staging = JSON.parse(await readFile("config/staging-isolation.example.json", "utf8"));
const production = JSON.parse(await readFile("config/production-reference.example.json", "utf8"));

function copy(value) {
  return structuredClone(value);
}

test("accepts a fully isolated staging manifest without exposing secret references", () => {
  const result = validateStagingIsolation(copy(staging), copy(production));
  assert.equal(result.ok, true);
  assert.equal(result.localManifestConsistent, true);
  assert.equal(result.isolationVerified, false);
  assert.equal(result.providerVerificationRequired, true);
  assert.equal(result.trustLevel, "unverified-local-declaration");
  assert.equal(result.checks.length, 14);
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

test("rejects provider identity and resolved secret fingerprint collisions", () => {
  for (const field of ["vercelProjectId", "databaseId", "telegramBotId"]) {
    const colliding = copy(staging);
    colliding[field] = production[field];
    assert.throws(
      () => validateStagingIsolation(colliding, copy(production)),
      (error) => error.code === "PRODUCTION_COLLISION",
    );
  }

  const aliasedSecret = copy(staging);
  aliasedSecret.secretFingerprints.database = production.secretFingerprints.database;
  assert.throws(
    () => validateStagingIsolation(aliasedSecret, copy(production)),
    (error) => error.code === "PRODUCTION_COLLISION" && error.field === "secretFingerprints.database",
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
