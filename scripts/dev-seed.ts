/**
 * Development seed for local / Cloud Agent environments.
 *
 * Creates a ready-to-use demo login with a personal group, group-scoped
 * categories, monthly settings and a few budgets for the current month so the
 * web dashboard works end to end without needing Telegram, Turso or Groq.
 *
 * Idempotent: safe to run repeatedly (used by the environment `install` step).
 *
 * Credentials: username `demo`, password `demo12345`.
 */
import { db } from "../lib/db/client";
import {
  users,
  groups,
  group_members,
  categories,
  monthly_settings,
  budgets,
} from "../lib/db/schema";
import { getActiveMonthArgentina } from "../lib/utils/dates";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

const DEMO_USERNAME = "demo";
const DEMO_PASSWORD = "demo12345";
const DEMO_NAME = "Demo User";

const CATEGORIES = [
  { slug: "supermercado", name: "Supermercado", emoji: "🛒", sort_order: 1 },
  { slug: "delivery", name: "Delivery/Salidas", emoji: "🍔", sort_order: 2 },
  { slug: "transporte", name: "Transporte", emoji: "🚗", sort_order: 3 },
  { slug: "entretenimiento", name: "Entretenimiento", emoji: "🎮", sort_order: 4 },
  { slug: "salud", name: "Salud", emoji: "💊", sort_order: 5 },
  { slug: "hogar", name: "Hogar/Servicios", emoji: "🏠", sort_order: 6 },
  { slug: "otros", name: "Otros", emoji: "💰", sort_order: 7 },
];

const BUDGETS: Record<string, number> = {
  supermercado: 150000,
  delivery: 60000,
  transporte: 40000,
  entretenimiento: 30000,
};

async function main() {
  const month = getActiveMonthArgentina();

  // 1. Demo user
  let user = await db.query.users.findFirst({
    where: eq(users.username, DEMO_USERNAME),
  });
  if (!user) {
    const id = randomUUID();
    await db.insert(users).values({
      id,
      name: DEMO_NAME,
      username: DEMO_USERNAME,
      personal_token_hash: await bcrypt.hash(DEMO_PASSWORD, 10),
      onboarding_completed_at: Date.now(),
    });
    user = await db.query.users.findFirst({ where: eq(users.id, id) });
  }
  if (!user) throw new Error("Failed to create demo user");

  // 2. Personal group (owner membership)
  let membership = await db.query.group_members.findFirst({
    where: and(eq(group_members.user_id, user.id), eq(group_members.role, "owner")),
  });
  let groupId = membership?.group_id;
  if (!groupId) {
    groupId = randomUUID();
    await db.insert(groups).values({ id: groupId, name: "Mi espacio", owner_id: user.id });
    await db.insert(group_members).values({ group_id: groupId, user_id: user.id, role: "owner" });
  }

  // 3. Group-scoped categories
  const catIds: Record<string, string> = {};
  for (const cat of CATEGORIES) {
    const existing = await db.query.categories.findFirst({
      where: and(eq(categories.slug, cat.slug), eq(categories.group_id, groupId)),
    });
    if (existing) {
      catIds[cat.slug] = existing.id;
      continue;
    }
    const id = randomUUID();
    await db.insert(categories).values({ id, group_id: groupId, is_active: 1, ...cat });
    catIds[cat.slug] = id;
  }

  // 4. Monthly settings for the active month (required to register expenses)
  const existingSettings = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
  });
  if (!existingSettings) {
    await db.insert(monthly_settings).values({
      id: randomUUID(),
      user_id: user.id,
      group_id: groupId,
      month,
      income_usd: 3000,
      exchange_rate: 1450,
      exchange_rate_source: "manual",
      saving_goal_usd: 1000,
      saving_goal_yellow: 800,
    });
  }

  // 5. Budgets per category (soft limits so demo expenses aren't blocked)
  for (const [slug, amount] of Object.entries(BUDGETS)) {
    const categoryId = catIds[slug];
    if (!categoryId) continue;
    const existing = await db.query.budgets.findFirst({
      where: and(
        eq(budgets.group_id, groupId),
        eq(budgets.month, month),
        eq(budgets.category_id, categoryId),
      ),
    });
    if (existing) continue;
    await db.insert(budgets).values({
      id: randomUUID(),
      user_id: user.id,
      group_id: groupId,
      month,
      category_id: categoryId,
      budget_ars: amount,
      hard_limit: 0,
    });
  }

  console.log(`✅ Dev seed complete for month ${month}`);
  console.log(`   Login at /login → username: ${DEMO_USERNAME} / password: ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Dev seed failed:", err);
    process.exit(1);
  });
