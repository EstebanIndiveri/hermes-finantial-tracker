import { createHash } from "node:crypto";
import {
  constants as fsConstants,
  lstat,
  open,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validatePostActivationIsolation } from "./validate-post-activation-isolation.mjs";

const PROVIDERS = {
  beta: ["vercel", "turso", "telegram", "runtime"],
  production: ["vercel", "turso", "telegram"],
};
const RECEIPT_KEY = /(?:^|[^a-z])(token|secret|password|passwd|credential|authorization|cookie|private.?key|api.?key|access.?key)(?:$|[^a-z])/i;

export class LocalIsolationRunnerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LocalIsolationRunnerError";
    this.code = code;
  }
}

function reject(code, message) {
  throw new LocalIsolationRunnerError(code, message);
}

function readCliArguments(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!["--manifest", "--evidence-root"].includes(flag) || result[flag]) {
      reject("INVALID_ARGUMENTS", "Provide exactly --manifest and --evidence-root paths.");
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      reject("INVALID_ARGUMENTS", "Provide exactly --manifest and --evidence-root paths.");
    }
    result[flag] = value;
    index += 1;
  }
  if (!result["--manifest"] || !result["--evidence-root"]) {
    reject("INVALID_ARGUMENTS", "Provide exactly --manifest and --evidence-root paths.");
  }
  return { manifestPath: result["--manifest"], evidenceRoot: result["--evidence-root"] };
}

async function readRegularNonSymlinkFile(path, code) {
  let info;
  try {
    info = await lstat(path);
  } catch {
    reject(code, "A required local file is missing or unreadable.");
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    reject(code, "A required local file must be a regular non-symlink file.");
  }
  return readFile(path);
}

function collectReceipts(manifest) {
  const receipts = [];
  for (const [environment, providers] of Object.entries(PROVIDERS)) {
    for (const provider of providers) {
      const item = manifest.beta.evidence[environment][provider];
      receipts.push({ reference: item.artifactRef, expectedDigest: item.sha256 });
    }
  }
  return receipts;
}

function safeReceiptRelativePath(reference) {
  if (
    typeof reference !== "string" ||
    !reference.startsWith("evidence/") ||
    !/^evidence\/[A-Za-z0-9._/-]{1,180}$/.test(reference) ||
    reference.includes("..") ||
    reference.includes("\\")
  ) {
    reject("INVALID_EVIDENCE_REFERENCE", "A receipt reference is outside the evidence root or malformed.");
  }
  const value = reference.slice("evidence/".length);
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    reject("INVALID_EVIDENCE_REFERENCE", "A receipt reference is outside the evidence root or malformed.");
  }
  return segments.join(sep);
}

function rejectSecretFields(value) {
  if (Array.isArray(value)) {
    for (const item of value) rejectSecretFields(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]/g, " ");
    if (RECEIPT_KEY.test(normalizedKey)) {
      reject("SECRET_BEARING_RECEIPT", "A receipt contains a field that may contain a secret.");
    }
    rejectSecretFields(item);
  }
}

async function listEvidenceFiles(root, relativeDirectory = "") {
  const directory = relativeDirectory ? join(root, relativeDirectory) : root;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    reject("INVALID_EVIDENCE_ROOT", "The evidence root contains an unreadable directory.");
  }
  const files = [];
  for (const entry of entries) {
    const relativePath = relativeDirectory ? join(relativeDirectory, entry.name) : entry.name;
    const path = join(root, relativePath);
    let info;
    try {
      info = await lstat(path);
    } catch {
      reject("INVALID_EVIDENCE_ROOT", "The evidence root changed while it was being inspected.");
    }
    if (info.isSymbolicLink()) {
      reject("UNSAFE_EVIDENCE_FILE", "The evidence root must not contain symbolic links.");
    }
    if (info.isDirectory()) {
      files.push(...await listEvidenceFiles(root, relativePath));
    } else if (info.isFile()) {
      files.push(relativePath);
    } else {
      reject("UNSAFE_EVIDENCE_FILE", "The evidence root may contain only regular files and directories.");
    }
  }
  return files;
}

async function verifyReceipts(manifest, evidenceRootArgument) {
  if (typeof evidenceRootArgument !== "string" || !isAbsolute(evidenceRootArgument)) {
    reject("INVALID_EVIDENCE_ROOT", "The evidence root must be an absolute directory path.");
  }
  const selectedRoot = resolve(evidenceRootArgument);
  let rootInfo;
  try {
    rootInfo = await lstat(selectedRoot);
  } catch {
    reject("INVALID_EVIDENCE_ROOT", "The evidence root must be an existing directory.");
  }
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    reject("INVALID_EVIDENCE_ROOT", "The evidence root must be a non-symlink directory.");
  }
  const root = await realpath(selectedRoot);
  const receipts = collectReceipts(manifest);
  const relativePaths = receipts.map(({ reference }) => safeReceiptRelativePath(reference));
  if (new Set(relativePaths).size !== relativePaths.length) {
    reject("DUPLICATE_EVIDENCE_REFERENCE", "Each provider receipt must have a distinct file.");
  }

  const actualFiles = await listEvidenceFiles(root);
  const expectedFiles = new Set(relativePaths);
  if (actualFiles.length !== expectedFiles.size || actualFiles.some((path) => !expectedFiles.has(path))) {
    reject("UNKNOWN_OR_MISSING_EVIDENCE_FILE", "The evidence root must contain exactly the referenced receipt files.");
  }

  for (const [index, relativePath] of relativePaths.entries()) {
    const path = join(root, relativePath);
    let cursor = root;
    for (const segment of relativePath.split(sep)) {
      cursor = join(cursor, segment);
      let info;
      try {
        info = await lstat(cursor);
      } catch {
        reject("MISSING_EVIDENCE_FILE", "A referenced receipt is missing.");
      }
      const finalSegment = cursor === path;
      if (info.isSymbolicLink() || (finalSegment ? !info.isFile() : !info.isDirectory())) {
        reject("UNSAFE_EVIDENCE_FILE", "A referenced receipt must be a regular non-symlink file under the evidence root.");
      }
    }
    const resolvedPath = await realpath(path);
    const fromRoot = relative(root, resolvedPath);
    if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      reject("INVALID_EVIDENCE_REFERENCE", "A receipt reference resolves outside the evidence root.");
    }

    let handle;
    try {
      handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
      const info = await handle.stat();
      if (!info.isFile()) reject("UNSAFE_EVIDENCE_FILE", "A referenced receipt must be a regular file.");
      const content = await handle.readFile();
      const actualDigest = createHash("sha256").update(content).digest("hex");
      if (actualDigest !== receipts[index].expectedDigest) {
        reject("EVIDENCE_DIGEST_MISMATCH", "A receipt digest does not match the manifest.");
      }
      let receipt;
      try {
        receipt = JSON.parse(content.toString("utf8"));
      } catch {
        reject("INVALID_RECEIPT_JSON", "Every redacted receipt must be valid JSON.");
      }
      rejectSecretFields(receipt);
    } catch (error) {
      if (error instanceof LocalIsolationRunnerError) throw error;
      reject("UNREADABLE_EVIDENCE_FILE", "A referenced receipt could not be read safely.");
    } finally {
      await handle?.close();
    }
  }
}

export async function verifyPostActivationIsolationManifest({ manifestPath, evidenceRoot, now } = {}) {
  if (typeof manifestPath !== "string" || !manifestPath) {
    reject("INVALID_MANIFEST_PATH", "The manifest path must be explicit.");
  }
  const manifestBytes = await readRegularNonSymlinkFile(resolve(manifestPath), "INVALID_MANIFEST_FILE");
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    reject("INVALID_MANIFEST_JSON", "The manifest must be valid JSON.");
  }
  const result = validatePostActivationIsolation(manifest, now === undefined ? undefined : { now });
  if (result.isolationVerified !== false || result.certificationState !== "not-certified") {
    reject("UNEXPECTED_VALIDATOR_RESULT", "Local evidence evaluation cannot certify isolation.");
  }
  await verifyReceipts(manifest, evidenceRoot);
  return result;
}

function isMain() {
  const entry = process.argv[1];
  return entry && pathToFileURL(resolve(entry)).href === import.meta.url;
}

if (isMain()) {
  try {
    const args = readCliArguments(process.argv.slice(2));
    const result = await verifyPostActivationIsolationManifest(args);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof LocalIsolationRunnerError
      ? error.code
      : typeof error?.code === "string" && /^[A-Z_]+$/.test(error.code)
        ? error.code
        : "VALIDATION_FAILED";
    process.stderr.write(`${JSON.stringify({ ok: false, error: code })}\n`);
    process.exitCode = 1;
  }
}
