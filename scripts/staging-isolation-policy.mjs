const STAGING_KEYS = [
  "aiMode",
  "appOrigin",
  "dataPolicy",
  "databaseId",
  "databaseHost",
  "e2eAllowedHost",
  "environment",
  "flags",
  "notificationsEnabled",
  "ocrMode",
  "releaseSha",
  "secretFingerprints",
  "secretRefs",
  "sessionCookieName",
  "telegramBotId",
  "telegramBotUsername",
  "vercelProjectId",
  "version",
  "webhookUrl",
];

const PRODUCTION_REFERENCE_KEYS = [
  "appOrigin",
  "approvedStagingHostSuffix",
  "databaseId",
  "databaseHost",
  "environment",
  "productionHostDenylist",
  "secretRefs",
  "secretFingerprints",
  "sessionCookieName",
  "telegramBotId",
  "telegramBotUsername",
  "vercelProjectId",
  "version",
  "webhookUrl",
];

const SECRET_REF_KEYS = [
  "cron",
  "database",
  "session",
  "telegramBot",
  "telegramWebhook",
  "webAccess",
];
const FLAG_KEYS = ["inbox", "outbox", "worker"];
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const SECRET_REF = /^(vercel|secret-manager|sha256):[A-Za-z0-9][A-Za-z0-9._:-]{2,255}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TELEGRAM_BOT_ID = /^\d{5,20}$/;
const KNOWN_PRODUCTION_HOSTS = new Set(["hermes-finantial-tracker.vercel.app"]);

export class StagingIsolationError extends Error {
  constructor(code, field, message) {
    super(message);
    this.name = "StagingIsolationError";
    this.code = code;
    this.field = field;
  }
}

function fail(code, field, message) {
  throw new StagingIsolationError(code, field, message);
}

function plainObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_TYPE", field, `${field} must be an object.`);
  }
  return value;
}

function exactKeys(value, expected, field) {
  const actual = Object.keys(plainObject(value, field)).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail("INVALID_KEYS", field, `${field} has missing or unknown keys.`);
  }
}

function httpsUrl(value, field) {
  if (typeof value !== "string") fail("INVALID_URL", field, `${field} must be an HTTPS URL.`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("INVALID_URL", field, `${field} must be an HTTPS URL.`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    fail("INVALID_URL", field, `${field} must be an HTTPS URL without credentials.`);
  }
  return parsed;
}

function originUrl(value, field) {
  const parsed = httpsUrl(value, field);
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    fail("INVALID_ORIGIN", field, `${field} must contain only an HTTPS origin.`);
  }
  return parsed;
}

function safeIdentifier(value, field) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail("INVALID_IDENTIFIER", field, `${field} must be a non-secret stable identifier.`);
  }
  return value;
}

function validateSecretRefs(value, field) {
  exactKeys(value, SECRET_REF_KEYS, field);
  const refs = [];
  for (const key of SECRET_REF_KEYS) {
    const ref = value[key];
    if (typeof ref !== "string" || !SECRET_REF.test(ref)) {
      fail("INVALID_SECRET_REFERENCE", `${field}.${key}`, "Secret values are forbidden; use an approved reference.");
    }
    refs.push(ref);
  }
  if (new Set(refs).size !== refs.length) {
    fail("REUSED_SECRET_REFERENCE", field, "Each staging secret must use a distinct reference.");
  }
}

function validateSecretFingerprints(value, field) {
  exactKeys(value, SECRET_REF_KEYS, field);
  const fingerprints = [];
  for (const key of SECRET_REF_KEYS) {
    const fingerprint = value[key];
    if (typeof fingerprint !== "string" || !SHA256.test(fingerprint)) {
      fail("INVALID_SECRET_FINGERPRINT", `${field}.${key}`, "Use a lowercase SHA-256 fingerprint, never a secret value.");
    }
    fingerprints.push(fingerprint);
  }
  if (new Set(fingerprints).size !== fingerprints.length) {
    fail("REUSED_SECRET_FINGERPRINT", field, "Each secret must resolve to a distinct fingerprint.");
  }
}

function validateTelegramBotId(value, field) {
  if (typeof value !== "string" || !TELEGRAM_BOT_ID.test(value)) {
    fail("INVALID_TELEGRAM_BOT_ID", field, `${field} must be the numeric provider-issued bot id.`);
  }
}

function normalizedHost(value, field) {
  if (typeof value !== "string" || value.includes(":") || value.includes("/") || value.includes("@")) {
    fail("INVALID_HOST", field, `${field} must be a hostname without a scheme, path or port.`);
  }
  try {
    return new URL(`https://${value}`).hostname.toLowerCase();
  } catch {
    fail("INVALID_HOST", field, `${field} must be a valid hostname.`);
  }
}

function assertDifferent(staging, production, field, normalize = (value) => value) {
  if (normalize(staging[field]) === normalize(production[field])) {
    fail("PRODUCTION_COLLISION", field, `${field} must differ between staging and production.`);
  }
}

export function validateStagingIsolation(stagingInput, productionInput) {
  exactKeys(stagingInput, STAGING_KEYS, "staging");
  exactKeys(productionInput, PRODUCTION_REFERENCE_KEYS, "productionReference");
  const staging = stagingInput;
  const production = productionInput;

  if (staging.version !== 1 || production.version !== 1) {
    fail("UNSUPPORTED_VERSION", "version", "Isolation manifests must use version 1.");
  }
  if (staging.environment !== "staging" || production.environment !== "production-reference") {
    fail("INVALID_ENVIRONMENT", "environment", "Expected staging and production-reference manifests.");
  }
  if (typeof staging.releaseSha !== "string" || !/^[a-f0-9]{40}$/.test(staging.releaseSha)) {
    fail("INVALID_RELEASE_SHA", "releaseSha", "releaseSha must be a full Git SHA.");
  }

  const stagingOrigin = originUrl(staging.appOrigin, "appOrigin");
  const productionOrigin = originUrl(production.appOrigin, "productionReference.appOrigin");
  const stagingWebhook = httpsUrl(staging.webhookUrl, "webhookUrl");
  const productionWebhook = httpsUrl(production.webhookUrl, "productionReference.webhookUrl");
  if (
    stagingWebhook.origin !== stagingOrigin.origin ||
    stagingWebhook.pathname !== "/api/telegram/webhook" ||
    stagingWebhook.search ||
    stagingWebhook.hash
  ) {
    fail("INVALID_WEBHOOK", "webhookUrl", "The staging webhook must exactly target the staging Telegram route.");
  }
  if (staging.e2eAllowedHost !== stagingOrigin.hostname) {
    fail("INVALID_E2E_HOST", "e2eAllowedHost", "E2E host must exactly match the staging app host.");
  }
  if (
    productionWebhook.origin !== productionOrigin.origin ||
    productionWebhook.pathname !== "/api/telegram/webhook" ||
    productionWebhook.search ||
    productionWebhook.hash
  ) {
    fail("INVALID_PRODUCTION_REFERENCE", "productionReference.webhookUrl", "The production reference webhook must target the canonical Telegram route.");
  }
  const approvedStagingHostSuffix = normalizedHost(
    production.approvedStagingHostSuffix,
    "productionReference.approvedStagingHostSuffix",
  );
  if (!Array.isArray(production.productionHostDenylist) || production.productionHostDenylist.length === 0) {
    fail("INVALID_PRODUCTION_REFERENCE", "productionReference.productionHostDenylist", "Provide every approved production hostname.");
  }
  const productionHosts = production.productionHostDenylist.map((host, index) => normalizedHost(
    host,
    `productionReference.productionHostDenylist.${index}`,
  ));
  if (new Set(productionHosts).size !== productionHosts.length) {
    fail("INVALID_PRODUCTION_REFERENCE", "productionReference.productionHostDenylist", "Production hostnames must be unique.");
  }
  if (!productionHosts.includes(productionOrigin.hostname)) {
    fail("INVALID_PRODUCTION_REFERENCE", "productionReference.productionHostDenylist", "The production origin must be denied explicitly.");
  }
  for (const knownHost of KNOWN_PRODUCTION_HOSTS) {
    if (!productionHosts.includes(knownHost)) {
      fail("INVALID_PRODUCTION_REFERENCE", "productionReference.productionHostDenylist", "The known production hostname is missing from the denylist.");
    }
  }
  if (
    stagingOrigin.hostname !== approvedStagingHostSuffix &&
    !stagingOrigin.hostname.endsWith(`.${approvedStagingHostSuffix}`)
  ) {
    fail("UNAPPROVED_STAGING_HOST", "appOrigin", "The staging host is outside the approved staging suffix.");
  }
  if (KNOWN_PRODUCTION_HOSTS.has(stagingOrigin.hostname) || productionHosts.includes(stagingOrigin.hostname)) {
    fail("KNOWN_PRODUCTION_HOST", "appOrigin", "A known production host cannot be used as staging.");
  }

  safeIdentifier(staging.vercelProjectId, "vercelProjectId");
  safeIdentifier(production.vercelProjectId, "productionReference.vercelProjectId");
  safeIdentifier(staging.databaseHost, "databaseHost");
  safeIdentifier(production.databaseHost, "productionReference.databaseHost");
  safeIdentifier(staging.databaseId, "databaseId");
  safeIdentifier(production.databaseId, "productionReference.databaseId");
  validateTelegramBotId(staging.telegramBotId, "telegramBotId");
  validateTelegramBotId(production.telegramBotId, "productionReference.telegramBotId");
  safeIdentifier(staging.telegramBotUsername, "telegramBotUsername");
  safeIdentifier(production.telegramBotUsername, "productionReference.telegramBotUsername");
  safeIdentifier(staging.sessionCookieName, "sessionCookieName");
  safeIdentifier(production.sessionCookieName, "productionReference.sessionCookieName");

  validateSecretRefs(staging.secretRefs, "secretRefs");
  validateSecretRefs(production.secretRefs, "productionReference.secretRefs");
  validateSecretFingerprints(staging.secretFingerprints, "secretFingerprints");
  validateSecretFingerprints(production.secretFingerprints, "productionReference.secretFingerprints");
  for (const key of SECRET_REF_KEYS) {
    if (staging.secretRefs[key] === production.secretRefs[key]) {
      fail("PRODUCTION_COLLISION", `secretRefs.${key}`, "A staging secret reference matches production.");
    }
    if (staging.secretFingerprints[key] === production.secretFingerprints[key]) {
      fail("PRODUCTION_COLLISION", `secretFingerprints.${key}`, "A staging secret resolves to the production fingerprint.");
    }
  }

  assertDifferent(staging, production, "vercelProjectId", (value) => value.toLowerCase());
  assertDifferent(staging, production, "appOrigin", (value) => new URL(value).origin.toLowerCase());
  assertDifferent(staging, production, "databaseHost", (value) => value.toLowerCase());
  assertDifferent(staging, production, "databaseId", (value) => value.toLowerCase());
  assertDifferent(staging, production, "telegramBotId");
  assertDifferent(staging, production, "telegramBotUsername", (value) => value.toLowerCase());
  assertDifferent(staging, production, "webhookUrl", (value) => new URL(value).href.toLowerCase());
  assertDifferent(staging, production, "sessionCookieName", (value) => value.toLowerCase());

  exactKeys(staging.flags, FLAG_KEYS, "flags");
  if (FLAG_KEYS.some((key) => staging.flags[key] !== false)) {
    fail("FLAGS_NOT_DISABLED", "flags", "Inbox, outbox and worker flags must all be false for H04d migration rehearsal.");
  }
  if (staging.dataPolicy !== "synthetic-only" || staging.notificationsEnabled !== false) {
    fail("UNSAFE_DATA_POLICY", "dataPolicy", "H04d requires synthetic-only data and disabled notifications.");
  }
  if (staging.aiMode !== "stub" || staging.ocrMode !== "stub") {
    fail("EXTERNAL_PROVIDER_ENABLED", "aiMode", "AI and OCR must use stubs during the initial staging rehearsal.");
  }

  return {
    ok: true,
    localManifestConsistent: true,
    isolationVerified: false,
    providerVerificationRequired: true,
    trustLevel: "unverified-local-declaration",
    environment: "staging",
    releaseSha: staging.releaseSha,
    checks: [
      "declared-distinct-vercel-project",
      "declared-distinct-app",
      "declared-distinct-database-host-and-id",
      "declared-distinct-telegram-bot",
      "declared-distinct-webhook",
      "declared-distinct-cookie",
      "declared-distinct-secret-references-and-fingerprints",
      "synthetic-data-only",
      "notifications-disabled",
      "telegram-flags-disabled",
      "providers-stubbed",
      "e2e-host-exact",
      "staging-host-approved",
      "known-production-host-denied",
    ],
  };
}
