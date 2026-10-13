import { pathToFileURL } from "node:url";
import { applyBetaAdditiveMigration, parseArgs } from "./apply-beta-push-migration.mjs";
import { PRE_ENDPOINT_UNIQUE_SCHEMA_FINGERPRINT, CANONICAL_SCHEMA_FINGERPRINT } from "./migrate.mjs";

export function applyBetaPushEndpointMigration({ configPath, backupPath }) {
  return applyBetaAdditiveMigration({
    configPath,
    backupPath,
    migrationId: "0120-push-endpoint-unique",
    preSchemaFingerprint: PRE_ENDPOINT_UNIQUE_SCHEMA_FINGERPRINT,
    postSchemaFingerprint: CANONICAL_SCHEMA_FINGERPRINT,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  applyBetaPushEndpointMigration(parseArgs(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result)))
    .catch(() => {
      console.error("BETA_PUSH_ENDPOINT_MIGRATION_BLOCKED: inspect redacted pre/post evidence; no automatic retry.");
      process.exitCode = 1;
    });
}
