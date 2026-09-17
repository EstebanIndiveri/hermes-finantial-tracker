import assert from "node:assert/strict";
import test from "node:test";
import { createIsolatedEnvironment } from "../isolation-policy.mjs";

test("isolated environment does not inherit provider secrets, proxies, or NODE_OPTIONS", () => {
  const environment = createIsolatedEnvironment({
    mode: "test",
    temporaryDirectory: "/tmp/hermes-policy-test",
    parentEnvironment: {
      PATH: "/usr/bin:/bin",
      CI: "1",
      TERM: "xterm",
      TELEGRAM_BOT_TOKEN: "sentinel-telegram",
      TURSO_DATABASE_URL: "libsql://sentinel-production",
      GROQ_API_KEY: "sentinel-groq",
      OCR_SPACE_API_KEY: "sentinel-ocr",
      HTTPS_PROXY: "http://sentinel-proxy",
      NODE_OPTIONS: "--require sentinel",
    },
  });

  assert.equal(environment.PATH, "/usr/bin:/bin");
  assert.equal(environment.CI, "1");
  assert.equal(environment.NODE_ENV, "test");
  assert.equal(environment.TURSO_DATABASE_URL, "file:/tmp/hermes-policy-test/hermes.db");
  assert.equal(environment.TURSO_AUTH_TOKEN, "");
  assert.equal("TELEGRAM_BOT_TOKEN" in environment, false);
  assert.equal("GROQ_API_KEY" in environment, false);
  assert.equal("OCR_SPACE_API_KEY" in environment, false);
  assert.equal("HTTPS_PROXY" in environment, false);
  assert.equal("NODE_OPTIONS" in environment, false);
});

test("build mode uses production NODE_ENV with synthetic local resources", () => {
  const environment = createIsolatedEnvironment({
    mode: "build",
    temporaryDirectory: "/tmp/hermes-build-test",
    parentEnvironment: {},
  });

  assert.equal(environment.NODE_ENV, "production");
  assert.equal(environment.NEXT_PUBLIC_APP_URL, "http://127.0.0.1:3000");
  assert.match(environment.SESSION_SECRET, /^synthetic-/);
  assert.match(environment.CRON_SECRET, /^synthetic-/);
});
