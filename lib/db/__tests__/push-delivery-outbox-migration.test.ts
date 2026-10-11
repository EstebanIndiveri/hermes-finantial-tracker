import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const migrationPath = join(process.cwd(), "lib/db/migrations/0012_push_delivery_outbox.sql");

let client: Client;
let temporaryDirectory: string;

async function expectRejected(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toBeDefined();
}

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "hermes-push-delivery-outbox-"));
  client = createClient({
    url: `file:${join(temporaryDirectory, "hermes.db")}`,
    timeout: 0,
  });
  await client.executeMultiple(readFileSync(migrationPath, "utf8"));
});

afterAll(() => {
  client.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("Web Push delivery outbox migration", () => {
  it("creates the exact additive schema and indexes", async () => {
    const table = await client.execute("PRAGMA table_info(push_delivery_outbox)");
    expect(table.rows.map((row) => [row.name, row.type, Number(row.notnull)])).toEqual([
      ["id", "TEXT", 0],
      ["operation_id", "TEXT", 1],
      ["delivery_key", "TEXT", 1],
      ["event_type", "TEXT", 1],
      ["reimbursement_id", "TEXT", 1],
      ["user_id", "TEXT", 1],
      ["subscription_id", "TEXT", 1],
      ["status", "TEXT", 1],
      ["attempt_count", "INTEGER", 1],
      ["next_attempt_at", "INTEGER", 1],
      ["lease_token", "TEXT", 0],
      ["lease_expires_at", "INTEGER", 0],
      ["last_error_code", "TEXT", 0],
      ["last_http_status", "INTEGER", 0],
      ["created_at", "INTEGER", 1],
      ["updated_at", "INTEGER", 1],
      ["sent_at", "INTEGER", 0],
      ["expires_at", "INTEGER", 1],
      ["retention_until", "INTEGER", 1],
    ]);

    const indexes = await client.execute(
      "SELECT name, sql FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'push_delivery_outbox' ORDER BY name",
    );
    expect(indexes.rows.map((row) => row.name)).toEqual([
      "push_delivery_outbox_due_idx",
      "push_delivery_outbox_lease_idx",
      "push_delivery_outbox_retention_idx",
      "sqlite_autoindex_push_delivery_outbox_1",
      "sqlite_autoindex_push_delivery_outbox_2",
    ]);
    expect(indexes.rows.find((row) => row.name === "push_delivery_outbox_due_idx")?.sql).toContain(
      "(status, next_attempt_at)",
    );
    expect(indexes.rows.find((row) => row.name === "push_delivery_outbox_lease_idx")?.sql).toContain(
      "(status, lease_expires_at)",
    );
    expect(indexes.rows.find((row) => row.name === "push_delivery_outbox_retention_idx")?.sql).toContain(
      "(retention_until)",
    );

    const tableSql = await client.execute(
      "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'push_delivery_outbox'",
    );
    expect(String(tableSql.rows[0].sql)).not.toMatch(/FOREIGN KEY|endpoint|p256dh|auth_key|amount|payload/i);
  });

  it("enforces delivery-key uniqueness and the state constraints", async () => {
    const base = [
      "delivery-a",
      "operation-a",
      "operation-a:reimbursement.requested:subscription-a",
      "reimbursement.requested",
      "reimbursement-a",
      "user-a",
      "subscription-a",
      "pending",
      1000,
      2000,
      3000,
    ];
    await client.execute({
      sql: `INSERT INTO push_delivery_outbox
        (id, operation_id, delivery_key, event_type, reimbursement_id, user_id,
         subscription_id, status, next_attempt_at, expires_at, retention_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: base,
    });

    await expectRejected(client.execute({
      sql: `INSERT INTO push_delivery_outbox
        (id, operation_id, delivery_key, event_type, reimbursement_id, user_id,
         subscription_id, status, next_attempt_at, expires_at, retention_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ["delivery-duplicate", ...base.slice(1)],
    }));
    for (const [field, value] of [["event_type", "other"], ["status", "unknown"]] as const) {
      const values = [...base];
      values[field === "event_type" ? 3 : 7] = value;
      values[0] = `invalid-${field}`;
      await expectRejected(client.execute({
        sql: `INSERT INTO push_delivery_outbox
          (id, operation_id, delivery_key, event_type, reimbursement_id, user_id,
           subscription_id, status, next_attempt_at, expires_at, retention_until)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: values,
      }));
    }
    const negativeAttempt = [...base];
    negativeAttempt[0] = "invalid-attempt";
    await expectRejected(client.execute({
      sql: `INSERT INTO push_delivery_outbox
        (id, operation_id, delivery_key, event_type, reimbursement_id, user_id,
         subscription_id, status, attempt_count, next_attempt_at, expires_at, retention_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [...negativeAttempt.slice(0, 7), -1, ...negativeAttempt.slice(7)],
    }));
  });
});
