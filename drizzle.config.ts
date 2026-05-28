import type { Config } from "drizzle-kit";

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error("TURSO_DATABASE_URL is required. Copy .env.example to .env and fill in values.");

export default {
  schema: "./lib/db/schema.ts",
  // lib/db/migrations is version-controlled — commit migration files
  out: "./lib/db/migrations",
  dialect: "turso",
  dbCredentials: {
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
} satisfies Config;
