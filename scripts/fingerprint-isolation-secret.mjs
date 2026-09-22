import { createHash } from "node:crypto";

function reject(reason) {
  process.stderr.write(`fingerprint-isolation-secret: ${reason}\n`);
  process.exitCode = 1;
}

function stripSingleTerminalNewline(input) {
  if (input.subarray(-2).equals(Buffer.from("\r\n"))) return input.subarray(0, -2);
  if (input.at(-1) === 0x0a) return input.subarray(0, -1);
  return input;
}

if (process.argv.length !== 2) {
  reject("arguments are not accepted; provide the secret only through stdin.");
} else if (process.stdin.isTTY) {
  reject("direct terminal input is not accepted; pipe a hidden prompt through stdin.");
} else {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const secret = stripSingleTerminalNewline(Buffer.concat(chunks));
  if (secret.length === 0) {
    reject("stdin must contain a non-empty secret.");
  } else if (secret.includes(0x00)) {
    reject("stdin must not contain NUL bytes.");
  } else if (secret.includes(0x0a) || secret.includes(0x0d)) {
    reject("stdin must contain exactly one line.");
  } else {
    process.stdout.write(`${createHash("sha256").update(secret).digest("hex")}\n`);
  }
}
