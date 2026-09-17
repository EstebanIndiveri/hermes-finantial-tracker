const REQUIRED_NODE_MAJOR = 22;

const actualVersion = process.versions.node;
const actualMajor = Number.parseInt(actualVersion.split(".")[0], 10);

if (actualMajor !== REQUIRED_NODE_MAJOR) {
  console.error(
    `Hermes requires Node ${REQUIRED_NODE_MAJOR}.x; current runtime is ${actualVersion}. ` +
      "Activate the version from .nvmrc before running project tooling.",
  );
  process.exit(1);
}
