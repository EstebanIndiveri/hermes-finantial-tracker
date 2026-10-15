import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const executeFile = promisify(execFile);
const PROJECT_ID = "prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF";
const PROJECT_NAME = "hermes-finantial-tracker-z2";
const ALIAS = "https://hermes-finantial-tracker-z2.vercel.app";
const SCOPE = "eindi-acme";
const MAX_RECORDS = 1000;
const MAX_WINDOW_MS = 60 * 60 * 1000;
const PATHS = new Map([
  ["daily", { path: "/api/cron/daily-alerts", schedule: "0 0 * * *" }],
  ["recurring", { path: "/api/cron/recurring-reminders", schedule: "0 11 * * *" }],
]);

function fail(code) { throw new Error(code); }

function utcTime(value) {
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    fail("BETA_CRON_TIME_INVALID");
  }
  return date.getTime();
}

export function parseArgs(argv, now = Date.now()) {
  if (argv.length !== 6 || argv[0] !== "--cron" || argv[2] !== "--since" ||
      argv[4] !== "--until" || !PATHS.has(argv[1])) fail("BETA_CRON_ARGUMENTS_INVALID");
  const sinceMs = utcTime(argv[3]);
  const untilMs = utcTime(argv[5]);
  if (untilMs <= sinceMs || untilMs - sinceMs > MAX_WINDOW_MS ||
      untilMs > now || sinceMs < now - 7 * 24 * 60 * 60 * 1000) {
    fail("BETA_CRON_TIME_INVALID");
  }
  return { cron: argv[1], since: argv[3], until: argv[5] };
}

async function defaultCli(args) {
  const { stdout } = await executeFile("vercel", args, {
    timeout: 25_000,
    maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
  });
  return stdout;
}

async function callCli(cli, args) {
  try { return await cli(args); } catch { fail("BETA_CRON_CLI_FAILED"); }
}

function parseJson(output) {
  try { return JSON.parse(output); } catch { fail("BETA_CRON_PROVIDER_OUTPUT_INVALID"); }
}

export function summarizeLogs(output, { cron, since, until, deploymentId }) {
  const windowStart = utcTime(since);
  const windowEnd = utcTime(until);
  const lines = output.trim() ? output.trim().split(/\r?\n/) : [];
  if (lines.length >= MAX_RECORDS) fail("BETA_CRON_LOG_WINDOW_INCOMPLETE");
  const records = [];
  for (const line of lines) {
    const row = parseJson(line);
    if (!row || row.projectId !== PROJECT_ID || typeof row.timestamp !== "number" ||
        !Number.isSafeInteger(row.timestamp) || typeof row.deploymentId !== "string") {
      fail("BETA_CRON_PROVIDER_OUTPUT_INVALID");
    }
    if (row.timestamp < windowStart || row.timestamp >= windowEnd ||
        row.deploymentId !== deploymentId || row.requestPath !== PATHS.get(cron).path) continue;
    records.push(row);
  }
  const statuses = { ok: 0, error: 0, other: 0 };
  let firstAt = null;
  let lastAt = null;
  for (const row of records) {
    if (row.requestMethod !== "GET") { statuses.other += 1; continue; }
    if (row.responseStatusCode === 200) statuses.ok += 1;
    else if (Number.isInteger(row.responseStatusCode) && row.responseStatusCode >= 400) statuses.error += 1;
    else statuses.other += 1;
    firstAt = firstAt === null ? row.timestamp : Math.min(firstAt, row.timestamp);
    lastAt = lastAt === null ? row.timestamp : Math.max(lastAt, row.timestamp);
  }
  return {
    kind: "hermes-beta-cron-log-snapshot",
    version: 1,
    cron,
    window: { since, until },
    matchingLogRecords: records.length,
    getStatusRecords: statuses,
    firstAt: firstAt === null ? null : new Date(firstAt).toISOString(),
    lastAt: lastAt === null ? null : new Date(lastAt).toISOString(),
    attribution: "unverified_without_user_agent",
    conclusion: statuses.ok > 0 ? "http_200_observed_origin_unverified"
      : statuses.error > 0 ? "http_error_observed_origin_unverified"
      : statuses.other > 0 ? "unclassified_log_record_origin_unverified"
      : "no_matching_request_log_observed",
    redaction: "aggregate-only",
  };
}

export async function observeBetaCronLogs({ cron, since, until, runCli } = {}) {
  const args = parseArgs(["--cron", cron, "--since", since, "--until", until]);
  const cli = runCli ?? defaultCli;
  const project = parseJson(await callCli(cli,
    ["api", `/v9/projects/${PROJECT_ID}`, "--scope", SCOPE, "--raw"]));
  if (project.id !== PROJECT_ID || project.name !== PROJECT_NAME ||
      typeof project.crons?.deploymentId !== "string") fail("BETA_CRON_PROJECT_MISMATCH");
  const deployment = parseJson(await callCli(cli,
    ["inspect", ALIAS, "--format", "json", "--scope", SCOPE]));
  if (deployment.id !== project.crons.deploymentId || deployment.readyState !== "READY" ||
      deployment.target !== "production" || deployment.name !== PROJECT_NAME ||
      !project.crons.definitions?.some((item) => item.path === PATHS.get(cron).path &&
        item.schedule === PATHS.get(cron).schedule)) fail("BETA_CRON_DEPLOYMENT_MISMATCH");
  const logs = await callCli(cli, ["logs", "--project", PROJECT_ID, "--scope", SCOPE,
    "--no-branch", "--environment", "production", "--since", args.since,
    "--until", args.until, "--json", "--limit", String(MAX_RECORDS)]);
  return summarizeLogs(logs, { ...args, deploymentId: deployment.id });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try { console.log(JSON.stringify(await observeBetaCronLogs(parseArgs(process.argv.slice(2))))); }
  catch (error) {
    const code = typeof error?.message === "string" && /^BETA_[A-Z_]+$/.test(error.message)
      ? error.message : "BETA_CRON_BLOCKED";
    console.error(code);
    process.exitCode = 1;
  }
}
