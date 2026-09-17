import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  createIsolatedEnvironment,
  findEnvironmentFiles,
} from "./isolation-policy.mjs";

const [, , mode, executable, ...args] = process.argv;
const commandEntrypoints = {
  jest: join(process.cwd(), "node_modules", "jest", "bin", "jest.js"),
  next: join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
};
if (!new Set(["test", "build"]).has(mode) || !executable) {
  console.error("Usage: node scripts/run-isolated.mjs <test|build> <jest|next> [...args]");
  process.exit(2);
}

if (!(executable in commandEntrypoints)) {
  console.error(`Command ${executable} is not allowed by the isolated runner.`);
  process.exit(2);
}

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
if (nodeMajor !== 22) {
  console.error(`Hermes requires Node 22.x; current runtime is ${process.versions.node}.`);
  process.exit(1);
}

const presentEnvironmentFiles = findEnvironmentFiles();
if (presentEnvironmentFiles.length > 0) {
  console.error(
    `Isolated ${mode} refused: remove environment files from this worktree (${presentEnvironmentFiles.join(", ")}).`,
  );
  process.exit(1);
}

const isolatedDirectory = mkdtempSync(join(tmpdir(), "hermes-isolated-"));
const childEnvironment = createIsolatedEnvironment({
  mode,
  temporaryDirectory: isolatedDirectory,
  parentEnvironment: process.env,
});

try {
  const result = spawnSync(process.execPath, [commandEntrypoints[executable], ...args], {
    cwd: process.cwd(),
    env: childEnvironment,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
} finally {
  rmSync(isolatedDirectory, { recursive: true, force: true });
}
