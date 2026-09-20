import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "lib/db/migrations/0010_telegram_operations_outbox.sql",
);

let client: Client;
let temporaryDirectory: string;

async function expectRejected(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toBeDefined();
}

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "hermes-operations-outbox-"));
  client = createClient({
    url: `file:${join(temporaryDirectory, "hermes.db")}`,
    timeout: 0,
  });
  await client.execute("PRAGMA foreign_keys = ON");

  // The migration only needs the existing table names. Keeping this fixture
  // minimal makes the test about the additive DDL rather than unrelated
  // application seed data or production schema state.
  await client.executeMultiple(`
    CREATE TABLE transactions (id TEXT PRIMARY KEY);
    CREATE TABLE splits (id TEXT PRIMARY KEY);
    CREATE TABLE split_payments (id TEXT PRIMARY KEY);
    CREATE TABLE reimbursement_requests (id TEXT PRIMARY KEY);
    CREATE TABLE recurring_executions (
      id TEXT PRIMARY KEY,
      recurring_expense_id TEXT NOT NULL,
      scheduled_date TEXT NOT NULL
    );
  `);
  await client.executeMultiple(readFileSync(migrationPath, "utf8"));
});

afterAll(() => {
  client.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("Telegram operation/outbox migration", () => {
  it("preserves multiple legacy NULL operation ids and rejects duplicate non-NULL ids", async () => {
    await client.execute({
      sql: "INSERT INTO transactions (id, operation_id) VALUES (?, NULL), (?, NULL), (?, ?)",
      args: ["legacy-a", "legacy-b", "operation-a", "op-a"],
    });

    await expectRejected(client.execute({
      sql: "INSERT INTO transactions (id, operation_id) VALUES (?, ?)",
      args: ["duplicate-op", "op-a"],
    }));

    await client.execute({
      sql: "INSERT INTO splits (id, operation_id) VALUES (?, NULL), (?, NULL), (?, ?)",
      args: ["split-legacy-a", "split-legacy-b", "split-a", "shared-op"],
    });
    await expectRejected(client.execute({
      sql: "INSERT INTO splits (id, operation_id) VALUES (?, ?)",
      args: ["split-duplicate", "shared-op"],
    }));
  });

  it("enforces operation registry identity and status checks", async () => {
    await client.execute({
      sql: `INSERT INTO telegram_operations
        (operation_id, bot_id, update_id, operation_kind, status)
        VALUES (?, ?, ?, ?, ?)`,
      args: ["op-registry-a", "bot-a", "update-1", "transaction", "started"],
    });

    await expectRejected(client.execute({
      sql: `INSERT INTO telegram_operations
        (operation_id, bot_id, update_id, operation_kind, status)
        VALUES (?, ?, ?, ?, ?)`,
      args: ["op-registry-b", "bot-a", "update-1", "transaction", "started"],
    }));
    await expectRejected(client.execute({
      sql: `INSERT INTO telegram_operations
        (operation_id, bot_id, update_id, operation_kind, status)
        VALUES (?, ?, ?, ?, ?)`,
      args: ["op-registry-invalid", "bot-a", "update-2", "transaction", "running"],
    }));
  });

  it("rejects duplicate recurring executions for the same scheduled date", async () => {
    await client.execute({
      sql: "INSERT INTO recurring_executions (id, recurring_expense_id, scheduled_date) VALUES (?, ?, ?)",
      args: ["execution-a", "recurring-a", "2026-09-10"],
    });
    await expectRejected(client.execute({
      sql: "INSERT INTO recurring_executions (id, recurring_expense_id, scheduled_date) VALUES (?, ?, ?)",
      args: ["execution-b", "recurring-a", "2026-09-10"],
    }));
  });

  it("lets only one concurrent monthly recurring claim win", async () => {
    const attempts = await Promise.all(Array.from({ length: 10 }, (_, index) => client.execute({
      sql: `INSERT INTO recurring_executions (id, recurring_expense_id, scheduled_date)
        VALUES (?, ?, ?)
        ON CONFLICT (recurring_expense_id, scheduled_date) DO NOTHING
        RETURNING id`,
      args: [`execution-parallel-${index}`, "recurring-parallel", "2026-09-15"],
    })));

    expect(attempts.reduce((count, result) => count + result.rows.length, 0)).toBe(1);
    const stored = await client.execute({
      sql: `SELECT COUNT(*) AS count FROM recurring_executions
        WHERE recurring_expense_id = ? AND scheduled_date = ?`,
      args: ["recurring-parallel", "2026-09-15"],
    });
    expect(Number(stored.rows[0].count)).toBe(1);
  });

  it("enforces outbox delivery-key uniqueness and state checks", async () => {
    const base = {
      bot_id: "bot-a",
      update_id: "update-outbox-1",
      operation_id: "op-outbox-a",
      delivery_key: "op-outbox-a:confirmation",
      action: "send_message",
      chat_id: "chat-a",
      parse_mode: "HTML",
      text: "✅ Guardado",
      status: "pending",
      next_attempt_at: 1000,
    };

    await client.execute({
      sql: `INSERT INTO telegram_operations
        (operation_id, bot_id, update_id, operation_kind, status)
        VALUES (?, ?, ?, ?, ?)`,
      args: [base.operation_id, base.bot_id, base.update_id, "outbox.test", "committed"],
    });

    await client.execute({
      sql: `INSERT INTO telegram_delivery_outbox
        (id, bot_id, update_id, operation_id, delivery_key, action, chat_id,
         parse_mode, text, status, next_attempt_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "delivery-a",
        base.bot_id,
        base.update_id,
        base.operation_id,
        base.delivery_key,
        base.action,
        base.chat_id,
        base.parse_mode,
        base.text,
        base.status,
        base.next_attempt_at,
      ],
    });

    await expectRejected(client.execute({
      sql: `INSERT INTO telegram_delivery_outbox
        (id, bot_id, update_id, operation_id, delivery_key, action, chat_id, text, status, next_attempt_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "delivery-duplicate",
        base.bot_id,
        "update-outbox-2",
        base.operation_id,
        base.delivery_key,
        base.action,
        base.chat_id,
        base.text,
        base.status,
        base.next_attempt_at,
      ],
    }));

    await expectRejected(client.execute({
      sql: `INSERT INTO telegram_delivery_outbox
        (id, bot_id, update_id, operation_id, delivery_key, action, chat_id, text, status, next_attempt_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "delivery-wrong-namespace",
        "bot-b",
        base.update_id,
        base.operation_id,
        "wrong-namespace",
        base.action,
        base.chat_id,
        base.text,
        base.status,
        base.next_attempt_at,
      ],
    }));

    await expectRejected(client.execute({
      sql: `INSERT INTO telegram_delivery_outbox
        (id, bot_id, update_id, operation_id, delivery_key, action, chat_id, text, status, next_attempt_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "delivery-invalid-action",
        base.bot_id,
        base.update_id,
        base.operation_id,
        "invalid-action",
        "answer_callback_query",
        base.chat_id,
        base.text,
        base.status,
        base.next_attempt_at,
      ],
    }));

    await expectRejected(client.execute({
      sql: `INSERT INTO telegram_delivery_outbox
        (id, bot_id, update_id, operation_id, delivery_key, action, chat_id, text, status, attempt_count, next_attempt_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "delivery-invalid-attempt",
        base.bot_id,
        base.update_id,
        base.operation_id,
        "invalid-attempt",
        base.action,
        base.chat_id,
        base.text,
        base.status,
        -1,
        base.next_attempt_at,
      ],
    }));

    await expectRejected(client.execute({
      sql: `INSERT INTO telegram_delivery_outbox
        (id, bot_id, update_id, operation_id, delivery_key, action, chat_id, text, status, next_attempt_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "delivery-invalid-status",
        base.bot_id,
        base.update_id,
        base.operation_id,
        "invalid-status",
        base.action,
        base.chat_id,
        base.text,
        "queued",
        base.next_attempt_at,
      ],
    }));
  });
});
