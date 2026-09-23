import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  EXPECTED_PROJECT_ID,
  installBetaToken,
  validateToken,
} from "../install-beta-telegram-token.mjs";

const scriptPath = fileURLToPath(new URL("../install-beta-telegram-token.mjs", import.meta.url));
const token = Buffer.from("8739389202:example_token-123");

function runScript(input, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() }));
    child.stdin.end(input);
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("validates only the beta token prefix and strips one LF or CRLF", () => {
  assert.deepEqual(validateToken(token), token);
  assert.deepEqual(validateToken(Buffer.concat([token, Buffer.from("\n")])), token);
  assert.deepEqual(validateToken(Buffer.concat([token, Buffer.from("\r\n")])), token);
  for (const input of [Buffer.alloc(0), Buffer.from("8739389203:wrong"), Buffer.concat([token, Buffer.from("\n\n")]), Buffer.concat([token, Buffer.from("\r")]), Buffer.from("8739389202:bad token")]) {
    assert.throws(() => validateToken(input));
  }
});

test("confirms local project metadata before invoking Vercel with a fixed target", () => {
  let invocation;
  let savedReceipt;
  const initialReceipt = {
    capturedAt: "2026-09-23",
    vercelProjectId: EXPECTED_PROJECT_ID,
    telegramBotId: "8739389202",
    secretFingerprints: { telegramBot: null, database: "existing-digest" },
  };
  const digest = installBetaToken({
    input: token,
    cwd: "/local/beta",
    readFile(path) {
      if (path.endsWith("project.json")) {
        assert.equal(path, "/local/beta/.vercel/project.json");
        return JSON.stringify({ projectId: EXPECTED_PROJECT_ID });
      }
      assert.equal(path, "/local/beta/config/staging-secret-fingerprints.local.json");
      return JSON.stringify(initialReceipt);
    },
    run(...args) {
      invocation = args;
      return { status: 0 };
    },
    writeFile(path, contents, encoding) {
      savedReceipt = { path, contents: JSON.parse(contents), encoding };
    },
  });

  assert.equal(digest, sha256(token));
  assert.deepEqual(invocation[0], "vercel");
  assert.deepEqual(invocation[1], ["env", "update", "TELEGRAM_BOT_TOKEN", "production", "--sensitive", "--yes", "--scope", "eindi-acme", "--cwd", "/local/beta"]);
  assert.deepEqual(invocation[2].input, token);
  assert.equal(JSON.stringify(invocation).includes(token.toString()), false);
  assert.equal(savedReceipt.path, "/local/beta/config/staging-secret-fingerprints.local.json");
  assert.equal(savedReceipt.encoding, "utf8");
  assert.equal(savedReceipt.contents.secretFingerprints.telegramBot, digest);
  assert.equal(savedReceipt.contents.secretFingerprints.database, "existing-digest");
  assert.equal(JSON.stringify(savedReceipt).includes(token.toString()), false);
});

test("refuses mismatched local project or receipt identities and never invokes Vercel", () => {
  let invoked = false;
  let written = false;
  assert.throws(() => installBetaToken({
    input: token,
    cwd: "/local/beta",
    readFile: () => JSON.stringify({ projectId: "another-project" }),
    run: () => { invoked = true; return { status: 0 }; },
    writeFile: () => { written = true; },
  }));
  assert.throws(() => installBetaToken({
    input: token,
    cwd: "/local/beta",
    readFile: (path) => path.endsWith("project.json")
      ? JSON.stringify({ projectId: EXPECTED_PROJECT_ID })
      : JSON.stringify({ vercelProjectId: EXPECTED_PROJECT_ID, telegramBotId: "wrong-bot", secretFingerprints: {} }),
    run: () => { invoked = true; return { status: 0 }; },
    writeFile: () => { written = true; },
  }));
  assert.equal(invoked, false);
  assert.equal(written, false);
});

test("CLI rejects arguments and reports only a digest after successful captured provider output", async () => {
  const withArgument = await runScript(token, ["unsafe-token-argument"]);
  assert.equal(withArgument.code, 1);
  assert.equal(withArgument.stdout, "");

  assert.equal(withArgument.stderr.includes("unsafe-token-argument"), false);
});

test("updates a temporary receipt with only the digest after a successful mocked provider call", () => {
  const directory = mkdtempSync(join(tmpdir(), "beta-token-receipt-"));
  try {
    const configDirectory = join(directory, "config");
    const vercelDirectory = join(directory, ".vercel");
    mkdirSync(configDirectory);
    mkdirSync(vercelDirectory);
    writeFileSync(join(vercelDirectory, "project.json"), JSON.stringify({ projectId: EXPECTED_PROJECT_ID }));
    const receipt = {
      vercelProjectId: EXPECTED_PROJECT_ID,
      telegramBotId: "8739389202",
      secretFingerprints: { telegramBot: null },
    };
    const receiptPath = join(configDirectory, "staging-secret-fingerprints.local.json");
    writeFileSync(receiptPath, JSON.stringify(receipt));
    const digest = installBetaToken({
      input: token,
      cwd: directory,
      run: () => ({ status: 0, stdout: Buffer.from(token), stderr: Buffer.from(token) }),
    });
    const saved = JSON.parse(readFileSync(receiptPath, "utf8"));
    assert.equal(digest, sha256(token));
    assert.equal(saved.secretFingerprints.telegramBot, digest);
    assert.equal(JSON.stringify(saved).includes(token.toString()), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
