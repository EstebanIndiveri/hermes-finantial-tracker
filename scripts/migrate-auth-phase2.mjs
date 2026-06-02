import { createClient } from "@libsql/client";
import { config } from "dotenv";

config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function migrate() {
  console.log("Running auth phase 2 migration...");

  // Check if personal_token_hash column exists on users
  const usersInfo = await client.execute("PRAGMA table_info(users)");
  const hasTokenHash = usersInfo.rows.some(r => r[1] === "personal_token_hash");
  const hasActiveTelegramGroup = usersInfo.rows.some(r => r[1] === "active_telegram_group_id");

  if (!hasTokenHash) {
    await client.execute("ALTER TABLE users ADD COLUMN personal_token_hash TEXT");
    console.log("✓ Added personal_token_hash to users");
  } else {
    console.log("✓ personal_token_hash already exists");
  }

  if (!hasActiveTelegramGroup) {
    await client.execute("ALTER TABLE users ADD COLUMN active_telegram_group_id TEXT REFERENCES groups(id)");
    console.log("✓ Added active_telegram_group_id to users");
  } else {
    console.log("✓ active_telegram_group_id already exists");
  }

  // Create telegram_link_codes table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS telegram_link_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    )
  `);
  console.log("✓ telegram_link_codes table ready");

  console.log("Migration complete.");
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
