import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createReadOnlyAdoptionPlan } from "./staging-reconciliation.mjs";

function parseArgs(argv) {
  let url;
  let saltFile;
  let releaseSha;
  let backupEvidencePath;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--url") url = argv[++index];
    else if (argv[index] === "--salt-file") saltFile = argv[++index];
    else if (argv[index] === "--release-sha") releaseSha = argv[++index];
    else if (argv[index] === "--backup-evidence") backupEvidencePath = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}.`);
  }
  if (!url || !saltFile || !releaseSha) {
    throw new Error("Pass --url, --salt-file and --release-sha explicitly.");
  }
  return { url, saltFile, releaseSha, backupEvidencePath };
}

async function main() {
  const { url, saltFile, releaseSha, backupEvidencePath } = parseArgs(process.argv.slice(2));
  const evidenceSalt = (await readFile(saltFile, "utf8")).trim();
  const backupEvidence = backupEvidencePath
    ? JSON.parse(await readFile(backupEvidencePath, "utf8"))
    : undefined;
  console.log(JSON.stringify(await createReadOnlyAdoptionPlan({
    url,
    evidenceSalt,
    releaseSha,
    backupEvidence,
  }), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`${error.code ?? "STAGING_ADOPTION_PLAN_FAILED"}: ${error.message}`);
    process.exitCode = 1;
  });
}
