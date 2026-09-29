import { pathToFileURL } from "node:url";

const EXPECTED = Object.freeze({
  appOrigin: "https://hermes-finantial-tracker-z2.vercel.app",
  databaseHost: "beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
  botId: "8739389202",
  botUsername: "Hermes_beta_finantial_bot",
  sessionCookieName: "hermes_beta_session",
  aiMode: "live",
  ocrMode: "live",
  flags: Object.freeze({
    TELEGRAM_INBOX_ENABLED: "true",
    TELEGRAM_OUTBOX_ENABLED: "true",
    TELEGRAM_OUTBOX_WORKER_ENABLED: "true",
  }),
  notificationsEnabled: "false",
});

const REQUIRED_SECRETS = Object.freeze([
  "CRON_SECRET",
  "TURSO_AUTH_TOKEN",
  "SESSION_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_SECRET_TOKEN",
  "WEB_ACCESS_TOKEN",
  "GROQ_API_KEY",
  "OCR_SPACE_API_KEY",
]);

const CHECK_NAMES = Object.freeze([
  "beta_app_origin",
  "beta_database_host",
  "beta_telegram_identity",
  "beta_session_cookie",
  "beta_feature_flags",
  "beta_runtime_modes",
  "beta_notifications_disabled",
  "required_secrets_present",
]);

function nonempty(environment, key) {
  return typeof environment[key] === "string" && environment[key].trim().length > 0;
}

function databaseHost(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "libsql:" && parsed.hostname === EXPECTED.databaseHost &&
      (parsed.pathname === "" || parsed.pathname === "/") && !parsed.port &&
      !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

/** Return only fixed, allowlisted check names; never echo environment contents. */
export function evaluateBetaBuildIsolation(environment) {
  const token = environment.TELEGRAM_BOT_TOKEN;
  const passed = {
    beta_app_origin: environment.NEXT_PUBLIC_APP_URL === EXPECTED.appOrigin,
    beta_database_host: databaseHost(environment.TURSO_DATABASE_URL),
    beta_telegram_identity:
      typeof token === "string" && token.startsWith(`${EXPECTED.botId}:`) &&
      environment.TELEGRAM_BOT_ID === EXPECTED.botId &&
      environment.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME === EXPECTED.botUsername,
    beta_session_cookie: environment.SESSION_COOKIE_NAME === EXPECTED.sessionCookieName,
    beta_feature_flags: Object.entries(EXPECTED.flags).every(([key, value]) => environment[key] === value),
    beta_runtime_modes: environment.AI_MODE === EXPECTED.aiMode && environment.OCR_MODE === EXPECTED.ocrMode,
    beta_notifications_disabled: environment.NOTIFICATIONS_ENABLED === EXPECTED.notificationsEnabled,
    required_secrets_present: REQUIRED_SECRETS.every((key) => nonempty(environment, key)),
  };
  return {
    passed: Object.values(passed).every(Boolean),
    checks: CHECK_NAMES.filter((name) => passed[name]),
    failedChecks: CHECK_NAMES.filter((name) => !passed[name]),
  };
}

export function runBetaBuildIsolationAssertion(environment, output = console) {
  if (environment.HERMES_BETA_ISOLATION_ASSERT !== "true") return true;

  const result = evaluateBetaBuildIsolation(environment);
  output.log(JSON.stringify({
    event: "beta_build_isolation_attested",
    passed: result.passed,
    checks: result.checks,
    failedChecks: result.failedChecks,
  }));
  return result.passed;
}

function main() {
  if (!runBetaBuildIsolationAssertion(process.env)) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
