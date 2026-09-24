import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifests, createManifests } from "../create-h04d4c-local-manifests.mjs";
import { validateStagingIsolation } from "../staging-isolation-policy.mjs";

const keys = ["database", "telegramBot", "telegramWebhook", "session", "cron", "webAccess"];
const receipt = {
  vercelProjectId: "prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF",
  tursoDatabaseId: "01a0c0bd-0601-7f27-b147-915d105b19f2",
  telegramBotId: "8739389202",
  secretFingerprints: Object.fromEntries(keys.map((key, index) => [key, String(index + 1).repeat(64)])),
  secretProvenance: Object.fromEntries(keys.map((key, index) => [key, index < 2 ? "provider-issued-for-distinct-resource" : "generated-for-staging"])),
};

test("builds an isolation-consistent local declaration using receipt fingerprints", () => {
  const { staging, productionReference } = buildManifests({ releaseSha: "a".repeat(40), receipt });
  const result = validateStagingIsolation(staging, productionReference);
  assert.equal(result.ok, true);
  assert.equal(result.localManifestConsistent, true);
  assert.equal(result.isolationVerified, false);
  assert.equal(result.trustLevel, "unverified-local-declaration");
  assert.equal(staging.appOrigin, "https://hermes-finantial-tracker-z2.vercel.app");
  assert.equal(staging.webhookUrl, "https://hermes-finantial-tracker-z2.vercel.app/api/telegram/webhook");
  assert.equal(productionReference.telegramBotId, "8884948884");
  assert.equal(productionReference.webhookUrl, "https://hermes-finantial-tracker.vercel.app/api/telegram/webhook");
  assert.equal(productionReference.productionHostDenylist.length, 11);
  assert.ok(keys.every((key) => productionReference.secretFingerprints[key] === null));
  assert.deepEqual(staging.flags, { inbox: false, outbox: false, worker: false });
  assert.equal(staging.aiMode, "stub");
  assert.equal(staging.ocrMode, "stub");
});

test("rejects receipt identity drift and duplicate or malformed fingerprints", () => {
  assert.throws(() => buildManifests({ releaseSha: "a".repeat(40), receipt: { ...receipt, telegramBotId: "wrong" } }), /identity/);
  const duplicate = structuredClone(receipt);
  duplicate.secretFingerprints.cron = duplicate.secretFingerprints.database;
  assert.throws(() => buildManifests({ releaseSha: "a".repeat(40), receipt: duplicate }), /duplicate/);
  const malformed = structuredClone(receipt);
  malformed.secretFingerprints.session = "placeholder";
  assert.throws(() => buildManifests({ releaseSha: "a".repeat(40), receipt: malformed }), /invalid/);
});

test("refuses existing manifests and release refresh preserves all other metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "h04d4c-manifests-"));
  const config = join(root, "config");
  await mkdir(config);
  const receiptPath = join(config, "staging-secret-fingerprints.local.json");
  await writeFile(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
  const releaseSha = "b".repeat(40);
  await createManifests({ root, releaseSha });
  const stagingPath = join(config, "staging-isolation.local.json");
  const productionPath = join(config, "production-reference.local.json");
  const before = JSON.parse(await readFile(stagingPath, "utf8"));
  await assert.rejects(createManifests({ root, releaseSha }), /refusing to overwrite/);
  await createManifests({ root, releaseSha: "c".repeat(40), refreshReleaseSha: true });
  const after = JSON.parse(await readFile(stagingPath, "utf8"));
  const production = JSON.parse(await readFile(productionPath, "utf8"));
  assert.equal(after.releaseSha, "c".repeat(40));
  assert.equal(after.telegramBotId, before.telegramBotId);
  assert.deepEqual(after.secretFingerprints, before.secretFingerprints);
  assert.equal(production.telegramBotId, "8884948884");
  await chmod(receiptPath, 0o644);
  await assert.rejects(createManifests({ root, releaseSha: "d".repeat(40), refreshReleaseSha: true }), /chmod 600/);
});
