import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const envPath = resolve(__dirname, "../.env.local");
  const envContent = readFileSync(envPath, "utf-8");
  const env = Object.fromEntries(
    envContent.split("\n")
      .filter(line => line.includes("=") && !line.startsWith("#"))
      .map(line => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^"|"$/g, "")];
      })
  );

  const url = env.TURSO_DATABASE_URL;
  const authToken = env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env.local");
  }

  const client = createClient({ url, authToken });

  try {
    console.log("Applying migration: add default_hard_limit to categories...");

    const tableInfo = await client.execute("PRAGMA table_info(categories)");
    const hasColumn = tableInfo.rows.some(row => row[1] === "default_hard_limit");

    if (hasColumn) {
      console.log("Column already exists, skipping.");
      return;
    }

    await client.execute(
      "ALTER TABLE categories ADD COLUMN default_hard_limit INTEGER NOT NULL DEFAULT 1"
    );

    console.log("Migration applied successfully.");
  } finally {
    client.close();
  }
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
