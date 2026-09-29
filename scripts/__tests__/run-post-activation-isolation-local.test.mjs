import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { verifyPostActivationIsolationManifest } from "../run-post-activation-isolation-local.mjs";

const SCRIPT = new URL("../run-post-activation-isolation-local.mjs", import.meta.url);
const PROVIDERS = {
  beta: ["vercel", "turso", "telegram", "runtime"],
  production: ["vercel", "turso", "telegram"],
};

function fixture(capturedAt) {
  const items = {};
  for (const [environment, providers] of Object.entries(PROVIDERS)) {
    items[environment] = Object.fromEntries(providers.map((provider) => [provider, {
      source: provider === "turso" ? "turso-cli" : provider === "telegram" ? "telegram-api" : "vercel-cli",
      capturedAt,
      artifactRef: `evidence/${environment}-${provider}.json`,
      sha256: "0".repeat(64),
    }]));
  }
  return {
    version: 1,
    beta: {
      environment: "beta",
      deploymentTarget: "production",
      releaseSha: "a".repeat(40),
      vercel: { projectId: "prj_beta_123", appOrigin: "https://hermes-beta.example.com" },
      database: { id: "beta-db-123", host: "beta-db.example.com" },
      telegram: {
        botId: "8739389202",
        username: "Hermes_beta_finantial_bot",
        webhookUrl: "https://hermes-beta.example.com/api/telegram/webhook",
      },
      runtime: {
        flags: { inbox: true, outbox: true, worker: true },
        aiMode: "live",
        ocrMode: "live",
        notificationsEnabled: false,
      },
      evidence: items,
    },
    production: {
      vercel: { projectId: "prj_legacy_123", appOrigin: "https://hermes-production.example.com" },
      database: { id: "production-db-123", host: "production-db.example.com" },
      telegram: {
        botId: "8884948884",
        username: "HermesFinanceAssistBot",
        webhookUrl: "https://hermes-production.example.com/api/telegram/webhook",
      },
    },
  };
}

async function setup(t, { receipt = () => ({ provider: "metadata-only" }) } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "hermes-local-isolation-"));
  const evidenceRoot = join(directory, "evidence");
  await mkdir(evidenceRoot);
  const capturedAt = new Date(Date.now() - 60_000).toISOString();
  const manifest = fixture(capturedAt);
  for (const [environment, providers] of Object.entries(PROVIDERS)) {
    for (const provider of providers) {
      const fileName = `${environment}-${provider}.json`;
      const content = `${JSON.stringify(receipt(environment, provider))}\n`;
      await writeFile(join(evidenceRoot, fileName), content, { mode: 0o600 });
      manifest.beta.evidence[environment][provider].sha256 = createHash("sha256").update(content).digest("hex");
    }
  }
  const manifestPath = join(directory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, evidenceRoot, manifestPath, manifest };
}

async function saveManifest(manifestPath, manifest) {
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
}

test("runs the validator only after all referenced local receipts exist and match their digests", async (t) => {
  const { evidenceRoot, manifestPath } = await setup(t);
  const result = await verifyPostActivationIsolationManifest({ manifestPath, evidenceRoot });
  assert.equal(result.ok, true);
  assert.equal(result.isolationVerified, false);
  assert.equal(result.certificationState, "not-certified");
});

test("CLI emits only the validator result on success", async (t) => {
  const { evidenceRoot, manifestPath } = await setup(t);
  const execution = spawnSync(process.execPath, [
    SCRIPT.pathname,
    "--manifest", manifestPath,
    "--evidence-root", evidenceRoot,
  ], { encoding: "utf8" });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stderr, "");
  const lines = execution.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).isolationVerified, false);
});

test("rejects a receipt whose content no longer matches its declared SHA-256", async (t) => {
  const { evidenceRoot, manifestPath } = await setup(t);
  await writeFile(join(evidenceRoot, "beta-vercel.json"), "{\"provider\":\"changed\"}\n");
  await assert.rejects(
    verifyPostActivationIsolationManifest({ manifestPath, evidenceRoot }),
    (error) => error.code === "EVIDENCE_DIGEST_MISMATCH",
  );
});

test("rejects traversal, missing receipts, and unreferenced files", async (t) => {
  const paths = await setup(t);
  const traversal = structuredClone(paths.manifest);
  traversal.beta.evidence.beta.vercel.artifactRef = "evidence/../outside.json";
  await saveManifest(paths.manifestPath, traversal);
  await assert.rejects(
    verifyPostActivationIsolationManifest({ manifestPath: paths.manifestPath, evidenceRoot: paths.evidenceRoot }),
    (error) => error.code === "INVALID_EVIDENCE_REFERENCE",
  );

  await saveManifest(paths.manifestPath, paths.manifest);
  await rm(join(paths.evidenceRoot, "beta-vercel.json"));
  await assert.rejects(
    verifyPostActivationIsolationManifest({ manifestPath: paths.manifestPath, evidenceRoot: paths.evidenceRoot }),
    (error) => error.code === "UNKNOWN_OR_MISSING_EVIDENCE_FILE",
  );

  const complete = await setup(t);
  await writeFile(join(complete.evidenceRoot, "unreferenced.json"), "{}\n");
  await assert.rejects(
    verifyPostActivationIsolationManifest({ manifestPath: complete.manifestPath, evidenceRoot: complete.evidenceRoot }),
    (error) => error.code === "UNKNOWN_OR_MISSING_EVIDENCE_FILE",
  );
});

test("requires the evidence root to be an explicit absolute directory", async (t) => {
  const { manifestPath } = await setup(t);
  await assert.rejects(
    verifyPostActivationIsolationManifest({ manifestPath, evidenceRoot: "./evidence" }),
    (error) => error.code === "INVALID_EVIDENCE_ROOT",
  );
});

test("rejects symlinked evidence roots, receipts, and secret-bearing receipt fields", async (t) => {
  const paths = await setup(t);
  const outside = join(paths.directory, "outside.json");
  await writeFile(outside, "{}\n");
  await rm(join(paths.evidenceRoot, "beta-vercel.json"));
  await symlink(outside, join(paths.evidenceRoot, "beta-vercel.json"));
  await assert.rejects(
    verifyPostActivationIsolationManifest({ manifestPath: paths.manifestPath, evidenceRoot: paths.evidenceRoot }),
    (error) => error.code === "UNSAFE_EVIDENCE_FILE",
  );

  const secret = await setup(t, { receipt: () => ({ nested: { botToken: "redacted?" } }) });
  await assert.rejects(
    verifyPostActivationIsolationManifest({ manifestPath: secret.manifestPath, evidenceRoot: secret.evidenceRoot }),
    (error) => error.code === "SECRET_BEARING_RECEIPT",
  );

  const symlinkRoot = join(paths.directory, "evidence-link");
  await symlink(paths.evidenceRoot, symlinkRoot);
  await assert.rejects(
    verifyPostActivationIsolationManifest({ manifestPath: paths.manifestPath, evidenceRoot: symlinkRoot }),
    (error) => error.code === "INVALID_EVIDENCE_ROOT",
  );
});
