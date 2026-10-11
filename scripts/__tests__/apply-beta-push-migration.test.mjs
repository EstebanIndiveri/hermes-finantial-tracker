import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyBetaPushMigration,
  assertBetaIdentity,
  parseArgs,
} from "../apply-beta-push-migration.mjs";

const betaShow = `Name: beta-hermes
URL: libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io
ID: 01a0c0bd-0601-7f27-b147-915d105b19f2
`;

test("accepts only the exact beta identity", () => {
  assert.doesNotThrow(() => assertBetaIdentity("esteban-indiveri\n", betaShow));
  assert.throws(() => assertBetaIdentity("eindiveri\n", betaShow), /BETA_IDENTITY_MISMATCH/);
  assert.throws(
    () => assertBetaIdentity("esteban-indiveri", betaShow.replace("beta-hermes-esteban-indiveri", "beta-hermes-eindiveri")),
    /BETA_DATABASE_MISMATCH/,
  );
  assert.throws(
    () => assertBetaIdentity("esteban-indiveri", betaShow.replace("01a0c0bd-0601-7f27-b147-915d105b19f2", "other-id")),
    /BETA_DATABASE_MISMATCH/,
  );
});

test("parseArgs rejects relative config and backup paths", () => {
  assert.throws(
    () => parseArgs(["--config-path", "./isolated", "--backup-db-file", "/tmp/export.db"]),
    /CONFIG_AND_BACKUP_PATHS_MUST_BE_ABSOLUTE/,
  );
  assert.throws(
    () => parseArgs(["--config-path", "/tmp/isolated", "--backup-db-file", "export.db"]),
    /CONFIG_AND_BACKUP_PATHS_MUST_BE_ABSOLUTE/,
  );
});

test("fails before CLI/token access when backup is missing or inside config", async () => {
  const root = await mkdtemp(join(tmpdir(), "beta-push-migration-"));
  const configPath = join(root, "isolated-config");
  const nestedBackup = join(configPath, "export.db");
  const missingBackup = join(root, "missing.db");
  await mkdir(configPath);

  await assert.rejects(
    () => applyBetaPushMigration({ configPath, backupPath: missingBackup }),
    /BACKUP_FILE_INVALID/,
  );

  await writeFile(nestedBackup, "not-a-database");
  await assert.rejects(
    () => applyBetaPushMigration({ configPath, backupPath: nestedBackup }),
    /BACKUP_MUST_BE_OUTSIDE_CONFIG/,
  );
});
