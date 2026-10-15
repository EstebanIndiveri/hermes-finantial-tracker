import test from "node:test";
import assert from "node:assert/strict";
import {
  observeBetaCronLogs, parseArgs, summarizeLogs,
} from "../beta-cron-log-snapshot.mjs";

const projectId = "prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF";
const deploymentId = "dpl_betaReady123";
const project = {
  id: projectId,
  name: "hermes-finantial-tracker-z2",
  crons: { deploymentId, definitions: [
    { path: "/api/cron/daily-alerts", schedule: "0 0 * * *" },
    { path: "/api/cron/recurring-reminders", schedule: "0 11 * * *" },
  ] },
};
const deployment = { id: deploymentId, name: project.name,
  readyState: "READY", target: "production" };

function window() {
  const now = Date.now();
  return { since: new Date(now - 3_600_000).toISOString(),
    until: new Date(now - 1_000).toISOString(),
    timestamp: now - 1_800_000 };
}

function row({ timestamp, path = "/api/cron/daily-alerts", status = 200,
  project = projectId, deployment = deploymentId, method = "GET" }) {
  return { projectId: project, deploymentId: deployment, timestamp,
    requestPath: path, requestMethod: method, responseStatusCode: status,
    message: "private message must not be copied", id: "private-request-id" };
}

test("requires a fixed cron and a recent UTC window of at most one hour", () => {
  const { since, until } = window();
  assert.deepEqual(parseArgs(["--cron", "daily", "--since", since, "--until", until]),
    { cron: "daily", since, until });
  assert.throws(() => parseArgs(["--cron", "other", "--since", since, "--until", until]),
    /BETA_CRON_ARGUMENTS_INVALID/);
  assert.throws(() => parseArgs(["--cron", "daily", "--since", until, "--until", since]),
    /BETA_CRON_TIME_INVALID/);
  assert.throws(() => parseArgs(["--cron", "daily", "--since", since.replace("Z", "+00:00"),
    "--until", until]), /BETA_CRON_TIME_INVALID/);
});

test("reads only the beta project, alias and fixed log window, with origin explicitly unverified", async () => {
  const { since, until, timestamp } = window();
  const calls = [];
  const result = await observeBetaCronLogs({ cron: "daily", since, until,
    runCli: async (args) => {
      calls.push(args);
      if (args[0] === "api") return JSON.stringify(project);
      if (args[0] === "inspect") return JSON.stringify(deployment);
      if (args[0] === "logs") return JSON.stringify(row({ timestamp }));
      throw new Error("unexpected command");
    } });
  assert.deepEqual(calls.map((args) => args[0]), ["api", "inspect", "logs"]);
  assert.deepEqual(calls[2].slice(0, 6), ["logs", "--project", projectId,
    "--scope", "eindi-acme", "--no-branch"]);
  assert.equal(result.conclusion, "http_200_observed_origin_unverified");
  assert.equal(result.attribution, "unverified_without_user_agent");
  assert.equal(result.matchingLogRecords, 1);
  assert.doesNotMatch(JSON.stringify(result), /private message|private-request-id|dpl_betaReady/);
});

test("does not query logs for a wrong project, alias deployment or cron definition", async () => {
  const { since, until } = window();
  for (const [providedProject, providedDeployment] of [
    [{ ...project, id: "legacy-project" }, deployment],
    [project, { ...deployment, id: "legacy-deployment" }],
    [{ ...project, crons: { ...project.crons, definitions: [] } }, deployment],
  ]) {
    const calls = [];
    await assert.rejects(() => observeBetaCronLogs({ cron: "daily", since, until,
      runCli: async (args) => {
        calls.push(args);
        return JSON.stringify(args[0] === "api" ? providedProject : providedDeployment);
      } }), /BETA_CRON_(PROJECT|DEPLOYMENT)_MISMATCH/);
    assert.equal(calls.some((args) => args[0] === "logs"), false);
  }
});

test("distinguishes no log, HTTP error, wrong deployment, and incomplete windows", () => {
  const { since, until, timestamp } = window();
  const options = { cron: "daily", since, until, deploymentId };
  assert.equal(summarizeLogs("", options).conclusion, "no_matching_request_log_observed");
  assert.equal(summarizeLogs(JSON.stringify(row({ timestamp, status: 500 })), options).conclusion,
    "http_error_observed_origin_unverified");
  assert.equal(summarizeLogs(JSON.stringify(row({ timestamp, deployment: "old-deployment" })), options)
    .matchingLogRecords, 0);
  assert.throws(() => summarizeLogs(`${JSON.stringify(row({ timestamp }))}\n`.repeat(1000), options),
    /BETA_CRON_LOG_WINDOW_INCOMPLETE/);
});

test("fails closed on foreign-project or malformed log records", () => {
  const { since, until, timestamp } = window();
  const options = { cron: "recurring", since, until, deploymentId };
  assert.throws(() => summarizeLogs(JSON.stringify(row({ timestamp, project: "legacy-project" })), options),
    /BETA_CRON_PROVIDER_OUTPUT_INVALID/);
  assert.throws(() => summarizeLogs("not-json", options), /BETA_CRON_PROVIDER_OUTPUT_INVALID/);
});
