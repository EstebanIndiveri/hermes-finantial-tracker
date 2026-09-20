import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { compareReconciliationSnapshots } from "./staging-reconciliation.mjs";

function parseArgs(argv) {
  let beforePath;
  let afterPath;
  let saltFile;
  let expectedAfterSchemaFingerprint;
  let expectedAfterManifestDigest;
  const allowedAddedTables = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--before") beforePath = argv[++index];
    else if (argv[index] === "--after") afterPath = argv[++index];
    else if (argv[index] === "--salt-file") saltFile = argv[++index];
    else if (argv[index] === "--expected-schema-fingerprint") expectedAfterSchemaFingerprint = argv[++index];
    else if (argv[index] === "--expected-manifest-digest") expectedAfterManifestDigest = argv[++index];
    else if (argv[index] === "--allow-added-table") allowedAddedTables.push(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}.`);
  }
  if (!beforePath || !afterPath || !saltFile) throw new Error("Pass --before, --after and --salt-file.");
  return {
    beforePath,
    afterPath,
    saltFile,
    expectedAfterSchemaFingerprint,
    expectedAfterManifestDigest,
    allowedAddedTables,
  };
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evidenceSalt = (await readFile(args.saltFile, "utf8")).trim();
  const result = compareReconciliationSnapshots(
    await loadJson(args.beforePath),
    await loadJson(args.afterPath),
    {
      evidenceSalt,
      expectedAfterSchemaFingerprint: args.expectedAfterSchemaFingerprint,
      expectedAfterManifestDigest: args.expectedAfterManifestDigest,
      allowedAddedTables: args.allowedAddedTables,
    },
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`STAGING_RECONCILIATION_COMPARE_FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
