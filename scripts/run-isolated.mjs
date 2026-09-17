import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const [, , mode, executable, ...args] = process.argv;
const commandEntrypoints = {
  jest: join(process.cwd(), "node_modules", "jest", "bin", "jest.js"),
  next: join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
};
const environmentFiles = [
  ".env",
  ".env.local",
  ".env.test",
  ".env.test.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
];

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

const presentEnvironmentFiles = environmentFiles.filter((file) => existsSync(file));
if (presentEnvironmentFiles.length > 0) {
  console.error(
    `Isolated ${mode} refused: remove environment files from this worktree (${presentEnvironmentFiles.join(", ")}).`,
  );
  process.exit(1);
}

const isolatedDirectory = mkdtempSync(join(tmpdir(), "hermes-isolated-"));
const childEnvironment = {
  PATH: process.env.PATH,
  CI: process.env.CI,
  TERM: process.env.TERM,
  TMPDIR: isolatedDirectory,
  NODE_ENV: mode === "build" ? "production" : "test",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
  TURSO_DATABASE_URL: `file:${join(isolatedDirectory, "hermes.db")}`,
  TURSO_AUTH_TOKEN: "",
  SESSION_SECRET: "synthetic-session-secret-for-isolated-checks-only",
  CRON_SECRET: "synthetic-cron-secret-for-isolated-checks-only",
  WEB_ACCESS_TOKEN: "synthetic-web-token-for-isolated-checks-only",
};

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
