import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyBetaConsentMigration } from "../apply-beta-consent-migration.mjs";

test("consent migration refuses a missing backup before touching beta credentials", async (t) => {
  const configPath = await mkdtemp(join(tmpdir(), "hermes-beta-consent-config-"));
  t.after(() => rm(configPath, { recursive: true, force: true }));
  const backupPath = join(configPath, "missing.db");
  await assert.rejects(
    () => applyBetaConsentMigration({ configPath, backupPath }),
    /BACKUP_FILE_INVALID/,
  );
});
