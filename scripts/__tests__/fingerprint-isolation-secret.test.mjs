import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = fileURLToPath(new URL("../fingerprint-isolation-secret.mjs", import.meta.url));

function runFingerprint(input, { args = [], env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
    child.stdin.end(input);
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("fingerprints stdin bytes and removes one terminal LF or CRLF", async () => {
  const value = Buffer.from([0x66, 0x80, 0xff]);
  const expected = `${sha256(value)}\n`;

  for (const input of [value, Buffer.concat([value, Buffer.from("\n")]), Buffer.concat([value, Buffer.from("\r\n")])]) {
    const result = await runFingerprint(input);
    assert.equal(result.code, 0);
    assert.equal(result.stdout, expected);
    assert.equal(result.stderr, "");
  }
});

test("rejects empty, multiline, NUL-containing input without echoing it", async () => {
  const sensitiveFixture = "private-fixture-value";
  for (const input of [Buffer.alloc(0), Buffer.from("\n"), Buffer.from("\r\n"), Buffer.from(`${sensitiveFixture}\n\n`), Buffer.from(`${sensitiveFixture}\r`), Buffer.from([0x61, 0x00, 0x62])]) {
    const result = await runFingerprint(input);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.includes(sensitiveFixture), false);
  }
});

test("rejects command-line arguments and does not consult environment input", async () => {
  const value = Buffer.from("stdin-fixture");
  const withArgument = await runFingerprint(value, { args: ["not-accepted"] });
  assert.equal(withArgument.code, 1);
  assert.equal(withArgument.stdout, "");

  const withEnvironment = await runFingerprint(value, {
    env: { ISOLATION_SECRET: "ignored-fixture" },
  });
  assert.equal(withEnvironment.code, 0);
  assert.equal(withEnvironment.stdout, `${sha256(value)}\n`);
  assert.equal(withEnvironment.stderr, "");
});
