import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_PROJECT_ID = "prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF";

export function stripSingleTerminalNewline(input) {
  if (input.subarray(-2).equals(Buffer.from("\r\n"))) return input.subarray(0, -2);
  if (input.at(-1) === 0x0a) return input.subarray(0, -1);
  return input;
}

export function validateToken(input) {
  const token = stripSingleTerminalNewline(Buffer.from(input));
  if (token.length === 0 || token.includes(0x00) || token.includes(0x0a) || token.includes(0x0d)) {
    throw new Error("stdin must contain one non-empty token line.");
  }

  const text = token.toString("ascii");
  if (!/^8739389202:[A-Za-z0-9_-]+$/.test(text) || !Buffer.from(text, "ascii").equals(token)) {
    throw new Error("stdin token format is invalid.");
  }
  return token;
}

export function readProjectMetadata(cwd, readFile = readFileSync) {
  const metadataPath = resolve(cwd, ".vercel", "project.json");
  const metadata = JSON.parse(readFile(metadataPath, "utf8"));
  if (metadata.projectId !== EXPECTED_PROJECT_ID) {
    throw new Error("local Vercel project metadata does not match the beta project.");
  }
}

export function readFingerprintReceipt(cwd, botId, readFile = readFileSync) {
  const receiptPath = resolve(cwd, "config", "staging-secret-fingerprints.local.json");
  const receipt = JSON.parse(readFile(receiptPath, "utf8"));
  if (receipt.vercelProjectId !== EXPECTED_PROJECT_ID || receipt.telegramBotId !== botId) {
    throw new Error("local fingerprint receipt identity does not match the beta project and token bot ID.");
  }
  if (!receipt.secretFingerprints || typeof receipt.secretFingerprints !== "object" || Array.isArray(receipt.secretFingerprints)) {
    throw new Error("local fingerprint receipt has no secretFingerprints object.");
  }
  return { receiptPath, receipt };
}

export function installBetaToken({ input, cwd = process.cwd(), run = spawnSync, readFile = readFileSync, writeFile = writeFileSync }) {
  const token = validateToken(input);
  readProjectMetadata(cwd, readFile);
  const botId = token.toString("ascii").split(":", 1)[0];
  const { receiptPath, receipt } = readFingerprintReceipt(cwd, botId, readFile);

  const args = [
    "env", "update", "TELEGRAM_BOT_TOKEN", "production",
    "--sensitive", "--yes", "--scope", "eindi-acme", "--cwd", cwd,
  ];
  const result = run("vercel", args, {
    cwd,
    input: token,
    encoding: "buffer",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new Error("Vercel did not confirm the beta token update.");
  }
  const digest = createHash("sha256").update(token).digest("hex");
  receipt.secretFingerprints.telegramBot = digest;
  writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return digest;
}

function reject(reason) {
  process.stderr.write(`install-beta-telegram-token: ${reason}\n`);
  process.exitCode = 1;
}

async function main() {
  if (process.argv.length !== 2) {
    reject("arguments are not accepted; provide the token only through stdin.");
    return;
  }
  if (process.stdin.isTTY) {
    reject("terminal input is not accepted; pipe the token through stdin.");
    return;
  }

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));

  try {
    const digest = installBetaToken({ input: Buffer.concat(chunks) });
    process.stdout.write(`${digest}\n`);
  } catch (error) {
    reject(error instanceof Error ? error.message : "token installation failed.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
