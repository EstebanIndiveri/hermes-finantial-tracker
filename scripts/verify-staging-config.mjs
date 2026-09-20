import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateStagingIsolation } from "./staging-isolation-policy.mjs";

function parseArgs(argv) {
  let stagingPath;
  let productionReferencePath;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--staging") stagingPath = argv[++index];
    else if (argv[index] === "--production-reference") productionReferencePath = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}.`);
  }
  if (!stagingPath || !productionReferencePath) {
    throw new Error("Pass --staging and --production-reference JSON files explicitly.");
  }
  return { stagingPath: resolve(stagingPath), productionReferencePath: resolve(productionReferencePath) };
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const paths = parseArgs(process.argv.slice(2));
  const result = validateStagingIsolation(
    await loadJson(paths.stagingPath),
    await loadJson(paths.productionReferencePath),
  );
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`${error.code ?? "STAGING_ISOLATION_FAILED"}: ${error.message}`);
    process.exitCode = 1;
  });
}
