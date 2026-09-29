const ROOT_KEYS = ["version", "beta", "production"];
const BETA_KEYS = ["environment", "deploymentTarget", "releaseSha", "vercel", "database", "telegram", "runtime", "evidence"];
const PRODUCTION_KEYS = ["vercel", "database", "telegram"];
const VERCEL_KEYS = ["projectId", "appOrigin"];
const DATABASE_KEYS = ["id", "host"];
const TELEGRAM_KEYS = ["botId", "username", "webhookUrl"];
const RUNTIME_KEYS = ["flags", "aiMode", "ocrMode", "notificationsEnabled"];
const FLAG_KEYS = ["inbox", "outbox", "worker"];
const EVIDENCE_ROOT_KEYS = ["beta", "production"];
const EVIDENCE_KEYS = { beta: ["vercel", "turso", "telegram", "runtime"], production: ["vercel", "turso", "telegram"] };
const EVIDENCE_ITEM_KEYS = ["source", "capturedAt", "artifactRef", "sha256"];
const SOURCES = { vercel: "vercel-cli", turso: "turso-cli", telegram: "telegram-api", runtime: "vercel-cli" };
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;
const BOT_ID = /^\d{5,20}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const KNOWN_LEGACY_HOSTS = new Set(["hermes-finantial-tracker.vercel.app"]);
const MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SHA256 = /^[a-f0-9]{64}$/;

export class PostActivationIsolationError extends Error {
  constructor(code, field, message) {
    super(message);
    this.name = "PostActivationIsolationError";
    this.code = code;
    this.field = field;
  }
}

function fail(code, field, message) {
  throw new PostActivationIsolationError(code, field, message);
}

function exactKeys(value, expected, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_TYPE", field, `${field} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    fail("INVALID_KEYS", field, `${field} has missing or unknown keys.`);
  }
}

function identifier(value, field) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail("INVALID_IDENTIFIER", field, `${field} must be a non-secret stable provider identifier.`);
  }
  return value;
}

function host(value, field) {
  if (typeof value !== "string" || value !== value.toLowerCase() || !HOST.test(value)) {
    fail("INVALID_HOST", field, `${field} must be a lowercase hostname without scheme, path or port.`);
  }
  return value;
}

function httpsOrigin(value, field) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("INVALID_URL", field, `${field} must be an HTTPS origin.`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    fail("INVALID_URL", field, `${field} must contain only an HTTPS origin.`);
  }
  return parsed;
}

function webhook(value, appOrigin, field) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("INVALID_WEBHOOK", field, `${field} must be an HTTPS Telegram webhook URL.`);
  }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password ||
    parsed.origin !== appOrigin.origin || parsed.pathname !== "/api/telegram/webhook" || parsed.search || parsed.hash
  ) {
    fail("INVALID_WEBHOOK", field, `${field} must target the environment's exact Telegram webhook route.`);
  }
  return parsed;
}

function checkEvidence(evidence, now) {
  exactKeys(evidence, EVIDENCE_ROOT_KEYS, "beta.evidence");
  for (const environment of EVIDENCE_ROOT_KEYS) {
    const providers = EVIDENCE_KEYS[environment];
    exactKeys(evidence[environment], providers, `beta.evidence.${environment}`);
    for (const provider of providers) {
      const item = evidence[environment][provider];
      const field = `beta.evidence.${environment}.${provider}`;
      exactKeys(item, EVIDENCE_ITEM_KEYS, field);
      if (item.source !== SOURCES[provider]) {
        fail("INVALID_EVIDENCE_SOURCE", `${field}.source`, `Use ${SOURCES[provider]} metadata evidence.`);
      }
      if (typeof item.artifactRef !== "string" || !/^evidence\/[A-Za-z0-9._/-]{1,180}$/.test(item.artifactRef) || item.artifactRef.includes("..")) {
        fail("INVALID_EVIDENCE_REFERENCE", `${field}.artifactRef`, "Point to a reviewed, redacted provider receipt under evidence/.");
      }
      if (typeof item.sha256 !== "string" || !SHA256.test(item.sha256)) {
        fail("INVALID_EVIDENCE_DIGEST", `${field}.sha256`, "Provide the SHA-256 digest of the redacted receipt.");
      }
      const capturedAt = Date.parse(item.capturedAt);
      if (!Number.isFinite(capturedAt) || new Date(capturedAt).toISOString() !== item.capturedAt) {
        fail("INVALID_EVIDENCE_TIME", `${field}.capturedAt`, "Evidence time must be an ISO-8601 UTC timestamp.");
      }
      if (capturedAt > now || now - capturedAt > MAX_EVIDENCE_AGE_MS) {
        fail("STALE_EVIDENCE", `${field}.capturedAt`, "Provider metadata must be current and no more than seven days old.");
      }
    }
  }
}

/**
 * Validate post-activation beta runtime declarations against provider identity
 * metadata. A successful result is not a full isolation certification: this
 * contract intentionally does not inspect secret values or deployment bindings.
 */
export function validatePostActivationIsolation(input, { now = Date.now() } = {}) {
  exactKeys(input, ROOT_KEYS, "input");
  const { beta, production } = input;
  exactKeys(beta, BETA_KEYS, "beta");
  exactKeys(production, PRODUCTION_KEYS, "production");
  exactKeys(beta.vercel, VERCEL_KEYS, "beta.vercel");
  exactKeys(production.vercel, VERCEL_KEYS, "production.vercel");
  exactKeys(beta.database, DATABASE_KEYS, "beta.database");
  exactKeys(production.database, DATABASE_KEYS, "production.database");
  exactKeys(beta.telegram, TELEGRAM_KEYS, "beta.telegram");
  exactKeys(production.telegram, TELEGRAM_KEYS, "production.telegram");
  exactKeys(beta.runtime, RUNTIME_KEYS, "beta.runtime");
  exactKeys(beta.runtime.flags, FLAG_KEYS, "beta.runtime.flags");

  if (input.version !== 1 || beta.environment !== "beta") {
    fail("INVALID_ENVIRONMENT", "beta.environment", "Expected version 1 and a beta runtime manifest.");
  }
  if (!["production", "preview"].includes(beta.deploymentTarget)) {
    fail("INVALID_DEPLOYMENT_TARGET", "beta.deploymentTarget", "Use the Vercel deployment target that was inspected.");
  }
  if (typeof beta.releaseSha !== "string" || !/^[a-f0-9]{40}$/.test(beta.releaseSha)) {
    fail("INVALID_RELEASE_SHA", "beta.releaseSha", "releaseSha must be a full lowercase Git SHA.");
  }

  const betaProject = identifier(beta.vercel.projectId, "beta.vercel.projectId");
  const productionProject = identifier(production.vercel.projectId, "production.vercel.projectId");
  const betaOrigin = httpsOrigin(beta.vercel.appOrigin, "beta.vercel.appOrigin");
  const productionOrigin = httpsOrigin(production.vercel.appOrigin, "production.vercel.appOrigin");
  if (KNOWN_LEGACY_HOSTS.has(betaOrigin.hostname) || betaOrigin.hostname === productionOrigin.hostname) {
    fail("PRODUCTION_HOST_IN_BETA", "beta.vercel.appOrigin", "Beta must not use the legacy production host.");
  }
  if (betaProject.toLowerCase() === productionProject.toLowerCase()) {
    fail("PRODUCTION_COLLISION", "beta.vercel.projectId", "Beta and production Vercel project IDs must differ.");
  }

  for (const [environment, db] of [["beta", beta.database], ["production", production.database]]) {
    identifier(db.id, `${environment}.database.id`);
    host(db.host, `${environment}.database.host`);
  }
  for (const [environment, telegram, origin] of [
    ["beta", beta.telegram, betaOrigin],
    ["production", production.telegram, productionOrigin],
  ]) {
    if (typeof telegram.botId !== "string" || !BOT_ID.test(telegram.botId)) {
      fail("INVALID_TELEGRAM_BOT_ID", `${environment}.telegram.botId`, "Use the numeric Telegram bot ID, not a token.");
    }
    identifier(telegram.username, `${environment}.telegram.username`);
    webhook(telegram.webhookUrl, origin, `${environment}.telegram.webhookUrl`);
  }

  const collisions = [
    [beta.database.id.toLowerCase(), production.database.id.toLowerCase(), "beta.database.id"],
    [beta.database.host, production.database.host, "beta.database.host"],
    [beta.telegram.botId, production.telegram.botId, "beta.telegram.botId"],
    [beta.telegram.username.toLowerCase(), production.telegram.username.toLowerCase(), "beta.telegram.username"],
    [betaOrigin.origin.toLowerCase(), productionOrigin.origin.toLowerCase(), "beta.vercel.appOrigin"],
  ];
  for (const [left, right, field] of collisions) {
    if (left === right) fail("PRODUCTION_COLLISION", field, `${field} must identify a beta-only provider resource.`);
  }

  if (FLAG_KEYS.some((key) => beta.runtime.flags[key] !== true)) {
    fail("BETA_FLAGS_NOT_ACTIVE", "beta.runtime.flags", "Post-activation evidence requires inbox, outbox and worker enabled.");
  }
  if (beta.runtime.aiMode !== "live" || beta.runtime.ocrMode !== "live") {
    fail("BETA_PROVIDERS_NOT_LIVE", "beta.runtime", "Post-activation evidence requires live AI and OCR modes.");
  }
  if (beta.runtime.notificationsEnabled !== false) {
    fail("BETA_NOTIFICATIONS_ENABLED", "beta.runtime.notificationsEnabled", "Proactive notifications must remain disabled for this beta evidence contract.");
  }

  checkEvidence(beta.evidence, now);

  return {
    ok: true,
    postActivationRuntimeConsistent: true,
    providerMetadataComparison: "distinct-identities-declared",
    isolationVerified: false,
    certificationState: "not-certified",
    trustLevel: "evidence-referenced-local-declaration",
    betaDeploymentTarget: beta.deploymentTarget,
    releaseSha: beta.releaseSha,
    checks: [
      "distinct-vercel-projects-and-origins",
      "distinct-turso-database-identities",
      "distinct-telegram-bots-and-webhooks",
      "beta-inbox-outbox-worker-enabled",
      "beta-ai-and-ocr-live",
      "proactive-notifications-disabled",
      "beta-and-production-provider-receipts-referenced-and-fresh",
      "runtime-flag-values-remain-declarations-until-receipts-are-reviewed",
      "no-secret-values-in-contract",
    ],
    remainingCertificationGaps: [
      "authenticated deployment binding inventory including secret references",
      "independent proof that beta runtime uses the declared beta provider bindings",
      "owner review of evidence provenance and residual risks",
    ],
  };
}
