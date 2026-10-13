import { pathToFileURL } from "node:url";
import { applyBetaAdditiveMigration, parseArgs } from "./apply-beta-push-migration.mjs";
import { PRE_CONSENT_SCHEMA_FINGERPRINT, CANONICAL_SCHEMA_FINGERPRINT } from "./migrate.mjs";

export function applyBetaConsentMigration({ configPath, backupPath }) {
  return applyBetaAdditiveMigration({
    configPath,
    backupPath,
    migrationId: "0110-notification-preferences",
    preSchemaFingerprint: PRE_CONSENT_SCHEMA_FINGERPRINT,
    postSchemaFingerprint: CANONICAL_SCHEMA_FINGERPRINT,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  applyBetaConsentMigration(parseArgs(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result)))
    .catch(() => {
      console.error("BETA_CONSENT_MIGRATION_BLOCKED: inspect redacted pre/post evidence; no automatic retry.");
      process.exitCode = 1;
    });
}
