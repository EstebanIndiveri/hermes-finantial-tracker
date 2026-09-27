import { existsSync } from "node:fs";
import { join } from "node:path";

export const environmentFiles = [
  ".env",
  ".env.local",
  ".env.test",
  ".env.test.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
];

export function findEnvironmentFiles(directory = process.cwd()) {
  return environmentFiles.filter((file) => existsSync(join(directory, file)));
}

export function createIsolatedEnvironment({ mode, temporaryDirectory, parentEnvironment }) {
  const environment = {
    NODE_ENV: mode === "build" ? "production" : "test",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
    TURSO_DATABASE_URL: `file:${join(temporaryDirectory, "hermes.db")}`,
    TURSO_AUTH_TOKEN: "",
    SESSION_SECRET: "synthetic-session-secret-for-isolated-checks-only",
    CRON_SECRET: "synthetic-cron-secret-for-isolated-checks-only",
    WEB_ACCESS_TOKEN: "synthetic-web-token-for-isolated-checks-only",
    TMPDIR: temporaryDirectory,
  };

  for (const name of ["PATH", "CI", "TERM"]) {
    const value = parentEnvironment[name];
    if (value) environment[name] = value;
  }

  // The bot username is public client configuration, not a credential. Let
  // production builds inline the target environment's bot handle while keeping
  // provider tokens and every other inherited variable out of the isolated
  // build process.
  if (mode === "build") {
    const botUsername = parentEnvironment.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
    if (typeof botUsername === "string" && /^[A-Za-z0-9_]{5,32}$/.test(botUsername)) {
      environment.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME = botUsername;
    }
  }

  return environment;
}
