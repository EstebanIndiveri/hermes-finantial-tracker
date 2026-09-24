import { readFile, writeFile, access, lstat, rename, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { validateStagingIsolation } from "./staging-isolation-policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_DIR = resolve(ROOT, "config");
const STAGING_PATH = resolve(CONFIG_DIR, "staging-isolation.local.json");
const PRODUCTION_PATH = resolve(CONFIG_DIR, "production-reference.local.json");
const RECEIPT_PATH = resolve(CONFIG_DIR, "staging-secret-fingerprints.local.json");
const SECRET_KEYS = ["database", "telegramBot", "telegramWebhook", "session", "cron", "webAccess"];
const SECRET_ENV_NAMES = {
  database: "TURSO_AUTH_TOKEN",
  telegramBot: "TELEGRAM_BOT_TOKEN",
  telegramWebhook: "TELEGRAM_SECRET_TOKEN",
  session: "SESSION_SECRET",
  cron: "CRON_SECRET",
  webAccess: "WEB_ACCESS_TOKEN",
};
const PRODUCTION_HOSTS = [
  "hermes-finantial-tracker.vercel.app",
  "hermes-finantial-tracker-eindi-acme.vercel.app",
  "hermes-finantial-tracker-estebanindiveri-8013-eindi-acme.vercel.app",
  "hermes-finantial-tracker-git-main-eindi-acme.vercel.app",
  "hermes-finantial-tracker-git-cursor-setup-dev-b9b6be-eindi-acme.vercel.app",
  "hermes-finantial-tracker-git-feature-web-part-061aff-eindi-acme.vercel.app",
  "hermes-finantial-tracker-git-feature-recurrin-371423-eindi-acme.vercel.app",
  "hermes-finantial-tracker-git-feature-splits-d-4ee027-eindi-acme.vercel.app",
  "hermes-finantial-tracker-qtm1t6cxf-eindi-acme.vercel.app",
  "hermes-finantial-tracker-582yi3u42-eindi-acme.vercel.app",
  "hermes-finantial-tracker-9t31lx6s8-eindi-acme.vercel.app",
];
const STAGING_HOST = "hermes-finantial-tracker-z2.vercel.app";
const STAGING_SUFFIX = "hermes-finantial-tracker-z2.vercel.app";
const STAGING_WEBHOOK = `https://${STAGING_HOST}/api/telegram/webhook`;
const PRODUCTION_WEBHOOK = "https://hermes-finantial-tracker.vercel.app/api/telegram/webhook";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateReceipt(receipt) {
  assert(receipt && typeof receipt === "object" && !Array.isArray(receipt), "Invalid staging fingerprint receipt.");
  assert(receipt.vercelProjectId === "prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF", "Receipt project identity does not match the documented beta project.");
  assert(receipt.tursoDatabaseId === "01a0c0bd-0601-7f27-b147-915d105b19f2", "Receipt database identity does not match the documented beta database.");
  assert(receipt.telegramBotId === "8739389202", "Receipt bot identity does not match the documented beta bot.");
  assert(receipt.secretFingerprints && receipt.secretProvenance, "Receipt fingerprint/provenance metadata is incomplete.");
  const fingerprints = {};
  const seen = new Set();
  for (const key of SECRET_KEYS) {
    const digest = receipt.secretFingerprints[key];
    assert(typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest), `Receipt fingerprint for ${key} is invalid.`);
    assert(!seen.has(digest), "Receipt contains duplicate secret fingerprints.");
    seen.add(digest);
    const provenance = receipt.secretProvenance[key];
    assert(["generated-for-staging", "provider-issued-for-distinct-resource"].includes(provenance), `Receipt provenance for ${key} is invalid.`);
    fingerprints[key] = digest;
  }
  assert(Object.keys(receipt.secretFingerprints).length === SECRET_KEYS.length, "Receipt has unexpected fingerprint keys.");
  assert(Object.keys(receipt.secretProvenance).length === SECRET_KEYS.length, "Receipt has unexpected provenance keys.");
  return fingerprints;
}

export function buildManifests({ releaseSha, receipt, productionBotId = "8884948884", productionBotUsername = "HermesFinanceAssistBot", productionWebhookUrl = PRODUCTION_WEBHOOK }) {
  assert(typeof releaseSha === "string" && /^[a-f0-9]{40}$/.test(releaseSha), "A full lowercase Git release SHA is required.");
  const fingerprints = validateReceipt(receipt);
  assert(/^\d{5,20}$/.test(productionBotId), "Production bot ID must be numeric.");
  assert(/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(productionBotUsername), "Production bot username is invalid.");
  assert(productionWebhookUrl === PRODUCTION_WEBHOOK, "Production webhook must be the canonical user-supplied URL.");

  const staging = {
    version: 1,
    environment: "staging",
    releaseSha,
    vercelProjectId: "prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF",
    appOrigin: `https://${STAGING_HOST}`,
    databaseHost: "beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
    databaseId: "01a0c0bd-0601-7f27-b147-915d105b19f2",
    telegramBotId: "8739389202",
    telegramBotUsername: "Hermes_beta_finantial_bot",
    webhookUrl: STAGING_WEBHOOK,
    sessionCookieName: "hermes_beta_session",
    secretRefs: Object.fromEntries(SECRET_KEYS.map((key) => [key, `vercel:prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF:${SECRET_ENV_NAMES[key]}`])),
    secretFingerprints: fingerprints,
    dataPolicy: "synthetic-only",
    notificationsEnabled: false,
    flags: { inbox: false, outbox: false, worker: false },
    e2eAllowedHost: STAGING_HOST,
    aiMode: "stub",
    ocrMode: "stub",
  };
  const productionReference = {
    version: 1,
    environment: "production-reference",
    vercelProjectId: "prj_i4rqNVGyw28Ed6m02ZoR7ErghTKt",
    appOrigin: "https://hermes-finantial-tracker.vercel.app",
    productionHostDenylist: PRODUCTION_HOSTS,
    approvedStagingHostSuffix: STAGING_SUFFIX,
    databaseHost: "hermes-acme-eindiveri.aws-ap-northeast-1.turso.io",
    databaseId: "019e71ab-9501-7c05-a672-b41db7a2cb27",
    telegramBotId: productionBotId,
    telegramBotUsername: productionBotUsername,
    webhookUrl: productionWebhookUrl,
    sessionCookieName: "hermes_session",
    secretRefs: Object.fromEntries(SECRET_KEYS.map((key) => [key, `vercel:prj_i4rqNVGyw28Ed6m02ZoR7ErghTKt:${SECRET_ENV_NAMES[key]}`])),
    secretFingerprints: Object.fromEntries(SECRET_KEYS.map((key) => [key, null])),
  };
  return { staging, productionReference };
}

async function exists(path) {
  try { await access(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function requireRegularFile(path) {
  const stats = await lstat(path);
  assert(stats.isFile() && !stats.isSymbolicLink(), "Manifest outputs must be regular files inside config.");
}

async function requirePrivateReceipt(path) {
  const stats = await lstat(path);
  assert(stats.isFile() && !stats.isSymbolicLink(), "The fingerprint receipt must be a regular file.");
  assert((stats.mode & 0o077) === 0, "The fingerprint receipt must not be readable by group or others (chmod 600).");
}

export async function createManifests({ root = ROOT, releaseSha, refreshReleaseSha = false }) {
  const configDir = resolve(root, "config");
  const stagingPath = resolve(configDir, "staging-isolation.local.json");
  const productionPath = resolve(configDir, "production-reference.local.json");
  const receiptPath = resolve(configDir, "staging-secret-fingerprints.local.json");
  assert(resolve(dirname(stagingPath)) === configDir && resolve(dirname(productionPath)) === configDir, "Manifest paths must remain inside the config directory.");
  const configStats = await lstat(configDir);
  assert(configStats.isDirectory() && !configStats.isSymbolicLink(), "Config directory must be a real directory, not a symlink.");
  await requirePrivateReceipt(receiptPath);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));

  if (refreshReleaseSha) {
    assert(await exists(stagingPath) && await exists(productionPath), "Both local manifests must exist before refreshing releaseSha.");
    await requireRegularFile(stagingPath);
    await requireRegularFile(productionPath);
    const currentStaging = JSON.parse(await readFile(stagingPath, "utf8"));
    const currentProduction = JSON.parse(await readFile(productionPath, "utf8"));
    const expected = buildManifests({ releaseSha: currentStaging.releaseSha, receipt });
    assert(JSON.stringify(currentStaging) === JSON.stringify(expected.staging) && JSON.stringify(currentProduction) === JSON.stringify(expected.productionReference), "Existing local manifests differ from generated evidence; refusing releaseSha refresh.");
    currentStaging.releaseSha = releaseSha;
    validateStagingIsolation(currentStaging, currentProduction);
    const temporaryPath = resolve(configDir, `.staging-isolation.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, `${JSON.stringify(currentStaging, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      await rename(temporaryPath, stagingPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
    return;
  }

  assert(!(await exists(stagingPath)) && !(await exists(productionPath)), "Local manifest exists; refusing to overwrite. Use --refresh-release-sha only after reviewing both manifests.");
  const manifests = buildManifests({ releaseSha, receipt });
  validateStagingIsolation(manifests.staging, manifests.productionReference);
  await writeFile(stagingPath, `${JSON.stringify(manifests.staging, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  try {
    await writeFile(productionPath, `${JSON.stringify(manifests.productionReference, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    await unlink(stagingPath).catch(() => {});
    throw error;
  }
}

function parseArgs(argv) {
  let refreshReleaseSha = false;
  for (const arg of argv) {
    if (arg === "--refresh-release-sha") refreshReleaseSha = true;
    else throw new Error("Unknown argument. Supported option: --refresh-release-sha.");
  }
  return { refreshReleaseSha };
}

async function main() {
  const { refreshReleaseSha } = parseArgs(process.argv.slice(2));
  const { execFileSync } = await import("node:child_process");
  const releaseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  await createManifests({ releaseSha, refreshReleaseSha });
  console.log(JSON.stringify({ manifestsWritten: true, fingerprintsIncluded: true, fingerprintValuesPrinted: false, releaseSha }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(`H04D4C_MANIFEST_FAILED: ${error.message}`); process.exitCode = 1; });
}
