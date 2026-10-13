import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@libsql/client";
import {
  observeBetaOutboxes,
  parseArgs,
  SNAPSHOT_SQL,
} from "../beta-outbox-snapshot.mjs";

const betaShow = `Name: beta-hermes
URL: libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io
ID: 01a0c0bd-0601-7f27-b147-915d105b19f2
`;
const table = `CHANNEL      CLOCK MS          TOTAL     PENDING     PROCESSING     RETRYABLE     SENT     DEAD     UNKNOWN     DUE NOW     EXPIRED LEASES     PURGE DUE     OLDEST OPEN AGE MINUTES     MISSING RETENTION     INVALID TIMING
push         1791900000000     1         0           0              0             1        0        0           0           0                  0             -1                          0                     0
telegram     1791900000000     25        0           0              0             25       0        0           0           0                  0             -1                          0                     0
`;

function fakeCli({ whoami = "esteban-indiveri", show = betaShow, rows = table } = {}) {
  const calls = [];
  return {
    calls,
    runCli: async (args) => {
      calls.push(args);
      if (args[0] === "auth") return whoami;
      if (args[0] === "db" && args[1] === "show") return show;
      if (args[0] === "db" && args[1] === "shell") return rows;
      throw new Error("unexpected command");
    },
  };
}

function withField(channel, index, value) {
  return table.split("\n").map((line) => {
    const fields = line.trim().split(/\s+/);
    if (fields[0] !== channel) return line;
    fields[index] = value;
    return fields.join(" ");
  }).join("\n");
}

test("requires an explicit absolute config path and rejects extra arguments", () => {
  assert.deepEqual(parseArgs(["--config-path", "/tmp/beta-config"]), {
    configPath: "/tmp/beta-config",
  });
  assert.throws(() => parseArgs([]), /BETA_SNAPSHOT_ARGUMENTS_INVALID/);
  assert.throws(() => parseArgs(["--config-path", "./config"]), /BETA_SNAPSHOT_ARGUMENTS_INVALID/);
  assert.throws(() => parseArgs(["--config-path", "/tmp/beta", "--sql", "SELECT 1"]), /BETA_SNAPSHOT_ARGUMENTS_INVALID/);
});

test("checks the exact beta identity before querying and emits only aggregate fields", async (t) => {
  const configPath = await mkdtemp(join(tmpdir(), "hermes-beta-snapshot-"));
  t.after(() => rm(configPath, { recursive: true, force: true }));
  const { calls, runCli } = fakeCli();
  const result = await observeBetaOutboxes({ configPath, runCli });
  assert.deepEqual(calls.map((args) => args.slice(0, 2)), [
    ["auth", "whoami"],
    ["db", "show"],
    ["db", "shell"],
  ]);
  assert.match(calls[2][3], /^WITH clock AS \(SELECT unixepoch\(\) \* 1000 AS now_ms\)/);
  assert.deepEqual(Object.keys(result), ["kind", "version", "capturedAt", "database", "channels", "redaction"]);
  assert.equal(result.kind, "hermes-beta-outbox-snapshot");
  assert.equal(result.database, "beta-hermes");
  assert.deepEqual(result.channels.push, {
    byStatus: { pending: 0, processing: 0, retryable: 0, sent: 1, dead: 0 },
    dueNow: 0,
    expiredLeases: 0,
    purgeDue: 0,
    oldestOpenAgeMinutes: null,
  });
  assert.equal(result.channels.telegram.byStatus.sent, 25);
  assert.doesNotMatch(JSON.stringify(result), /token|chat-id|receipt-id|message text/i);
});

test("rejects wrong account, database ID, host, and name without querying", async (t) => {
  const configPath = await mkdtemp(join(tmpdir(), "hermes-beta-snapshot-"));
  t.after(() => rm(configPath, { recursive: true, force: true }));
  for (const options of [
    { whoami: "eindiveri" },
    { show: betaShow.replace("01a0c0bd-0601-7f27-b147-915d105b19f2", "legacy-id") },
    { show: betaShow.replace("beta-hermes-esteban-indiveri", "legacy-hermes-eindiveri") },
    { show: betaShow.replace("Name: beta-hermes", "Name: legacy-hermes") },
  ]) {
    const { calls, runCli } = fakeCli(options);
    await assert.rejects(() => observeBetaOutboxes({ configPath, runCli }), /BETA_(IDENTITY|DATABASE)_MISMATCH/);
    assert.equal(calls.some((args) => args[1] === "shell"), false);
  }
});

test("rejects a symlink config path before invoking the CLI", async (t) => {
  const configPath = await mkdtemp(join(tmpdir(), "hermes-beta-snapshot-"));
  const linkPath = `${configPath}-link`;
  await symlink(configPath, linkPath);
  t.after(() => rm(linkPath));
  t.after(() => rm(configPath, { recursive: true, force: true }));
  const { calls, runCli } = fakeCli();
  await assert.rejects(() => observeBetaOutboxes({ configPath: linkPath, runCli }), /BETA_CONFIG_INVALID/);
  assert.equal(calls.length, 0);
});

test("fails closed on unknown statuses, bad totals, missing retention, and malformed output", async (t) => {
  const configPath = await mkdtemp(join(tmpdir(), "hermes-beta-snapshot-"));
  t.after(() => rm(configPath, { recursive: true, force: true }));
  for (const rows of [
    withField("push", 8, "1"),
    withField("push", 2, "2"),
    withField("push", 13, "1"),
    withField("push", 14, "1"),
    withField("telegram", 0, "secret-chat-id"),
    "secret-token database unavailable",
  ]) {
    const { runCli } = fakeCli({ rows });
    await assert.rejects(() => observeBetaOutboxes({ configPath, runCli }), /BETA_SNAPSHOT_OUTPUT_INVALID/);
  }
});

test("redacts CLI errors instead of echoing provider output", async (t) => {
  const configPath = await mkdtemp(join(tmpdir(), "hermes-beta-snapshot-"));
  t.after(() => rm(configPath, { recursive: true, force: true }));
  await assert.rejects(
    () => observeBetaOutboxes({ configPath, runCli: async () => { throw new Error("secret-token chat-id"); } }),
    (error) => error.message === "BETA_SNAPSHOT_CLI_FAILED",
  );
});

test("fixed SQL counts due work, expired leases, and terminal retention on local libSQL", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hermes-beta-snapshot-db-"));
  const client = createClient({ url: `file:${join(directory, "snapshot.db")}` });
  t.after(async () => {
    client.close();
    await rm(directory, { recursive: true, force: true });
  });
  await client.executeMultiple(`
    CREATE TABLE push_delivery_outbox (
      status TEXT, created_at INTEGER, next_attempt_at INTEGER,
      lease_expires_at INTEGER, retention_until INTEGER
    );
    CREATE TABLE telegram_delivery_outbox (
      status TEXT, created_at INTEGER, next_attempt_at INTEGER,
      lease_expires_at INTEGER, retention_until INTEGER
    );
  `);
  const now = Date.now();
  await client.execute({
    sql: "INSERT INTO push_delivery_outbox VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)",
    args: ["pending", now - 600_000, now - 10_000, null, now + 60_000,
      "sent", now - 600_000, now - 10_000, null, now - 10_000],
  });
  await client.execute({
    sql: "INSERT INTO telegram_delivery_outbox VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)",
    args: ["processing", now - 120_000, now - 10_000, now - 10_000, now + 60_000,
      "dead", now - 120_000, now - 10_000, null, now + 60_000],
  });
  const result = await client.execute(SNAPSHOT_SQL);
  assert.deepEqual(result.rows.map((row) => row.channel), ["push", "telegram"]);
  assert.equal(Number(result.rows[0].due_now), 1);
  assert.equal(Number(result.rows[0].purge_due), 1);
  assert.ok(Number(result.rows[0].oldest_open_age_minutes) >= 9);
  assert.equal(Number(result.rows[1].expired_leases), 1);
  assert.equal(Number(result.rows[1].purge_due), 0);

  await client.execute({
    sql: "INSERT INTO push_delivery_outbox VALUES (?, ?, ?, ?, ?)",
    args: [null, now - 60_000, now - 10_000, null, now + 60_000],
  });
  const malformed = await client.execute(SNAPSHOT_SQL);
  assert.equal(Number(malformed.rows[0].total), 3);
  assert.equal(Number(malformed.rows[0].unknown), 1);

  await client.execute({
    sql: "INSERT INTO telegram_delivery_outbox VALUES (?, ?, ?, ?, ?)",
    args: ["processing", null, now - 10_000, null, now + 60_000],
  });
  const invalidTiming = await client.execute(SNAPSHOT_SQL);
  assert.equal(Number(invalidTiming.rows[1].invalid_timing), 1);
});
