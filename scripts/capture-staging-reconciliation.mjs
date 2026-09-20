import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { captureReconciliationSnapshot } from "./staging-reconciliation.mjs";

function parseArgs(argv) {
  let url;
  let saltFile;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--url") url = argv[++index];
    else if (argv[index] === "--salt-file") saltFile = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}.`);
  }
  if (!url || !saltFile) throw new Error("Pass --url file:/absolute/path.db and --salt-file explicitly.");
  return { url, saltFile };
}

async function main() {
  const { url, saltFile } = parseArgs(process.argv.slice(2));
  const evidenceSalt = (await readFile(saltFile, "utf8")).trim();
  console.log(JSON.stringify(await captureReconciliationSnapshot({ url, evidenceSalt }), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`${error.code ?? "STAGING_RECONCILIATION_FAILED"}: ${error.message}`);
    process.exitCode = 1;
  });
}
