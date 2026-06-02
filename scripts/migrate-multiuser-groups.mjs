import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadEnv() {
  const envPath = resolve(__dirname, "../.env.local");
  const envContent = readFileSync(envPath, "utf-8");
  return Object.fromEntries(
    envContent.split("\n")
      .filter(line => line.includes("=") && !line.startsWith("#"))
      .map(line => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^"|"$/g, "")];
      })
  );
}

async function migrate() {
  const env = await loadEnv();
  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = env;
  if (!url || !authToken) throw new Error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");

  const client = createClient({ url, authToken });
  await client.execute("PRAGMA foreign_keys = ON");

  console.log("Step 1: Creating groups table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);

  console.log("Step 2: Creating group_members table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
      joined_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (group_id, user_id)
    )
  `);

  console.log("Step 3: Creating group_invitations table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS group_invitations (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
      created_by TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      used_by TEXT REFERENCES users(id)
    )
  `);

  console.log("Step 4: Adding group_id columns to existing tables...");
  for (const table of ["transactions", "budgets", "monthly_settings", "categories"]) {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    const hasColumn = info.rows.some(row => row[1] === "group_id");
    if (hasColumn) {
      console.log(`  ${table}.group_id already exists, skipping.`);
    } else {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN group_id TEXT REFERENCES groups(id)`);
      console.log(`  Added group_id to ${table}.`);
    }
  }

  console.log("Step 5a: Updating unique indexes to use group_id...");
  // Drop old user-scoped unique indexes and create group-scoped ones
  await client.execute("DROP INDEX IF EXISTS budgets_user_month_cat_idx").catch(() => {});
  await client.execute("DROP INDEX IF EXISTS ms_user_month_idx").catch(() => {});
  // Create new group-scoped unique indexes (partial: only where group_id IS NOT NULL)
  await client.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS budgets_group_month_cat_idx ON budgets(group_id, month, category_id)"
  ).catch(e => console.warn("  budgets index:", e.message));
  await client.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS ms_group_month_idx ON monthly_settings(group_id, month)"
  ).catch(e => console.warn("  monthly_settings index:", e.message));
  console.log("  Indexes updated.");

  console.log("Step 5: Auto-creating personal group 'Hogar' for existing users...");
  const usersResult = await client.execute("SELECT id FROM users");
  for (const row of usersResult.rows) {
    const userId = row[0];

    // Check if user already has a personal group
    const existingGroup = await client.execute({
      sql: "SELECT id FROM groups WHERE owner_id = ?",
      args: [userId],
    });
    if (existingGroup.rows.length > 0) {
      const groupId = existingGroup.rows[0][0];
      console.log(`  User ${userId} already has group ${groupId}, skipping.`);
      continue;
    }

    const groupId = randomUUID();
    await client.execute({
      sql: "INSERT INTO groups (id, name, owner_id) VALUES (?, ?, ?)",
      args: [groupId, "Hogar", userId],
    });
    await client.execute({
      sql: "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')",
      args: [groupId, userId],
    });

    // Backfill group_id on all user's data
    for (const table of ["transactions", "budgets", "monthly_settings"]) {
      await client.execute({
        sql: `UPDATE ${table} SET group_id = ? WHERE user_id = ? AND group_id IS NULL`,
        args: [groupId, userId],
      });
    }
    // Categories have no user_id — backfill all unassigned categories to this group
    await client.execute({
      sql: "UPDATE categories SET group_id = ? WHERE group_id IS NULL",
      args: [groupId],
    });

    console.log(`  Created group 'Hogar' (${groupId}) for user ${userId} and backfilled data.`);
  }

  console.log("✅ Migration complete.");
  client.close();
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
