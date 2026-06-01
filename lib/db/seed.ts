import { db } from "./client";
import { users, categories, monthly_settings, budgets } from "./schema";
import { randomUUID } from "crypto";

async function seed() {
  const userId = randomUUID();
  const demoMonth = "2026-05";

  await db.insert(users).values({
    id: userId,
    name: "Hermes User",
    telegram_user_id: null,
  }).onConflictDoNothing();

  const cats = [
    { slug: "supermercado",      name: "Supermercado",       emoji: "🛒", sort_order: 1 },
    { slug: "verduleria",        name: "Verdulería",         emoji: "🥦", sort_order: 2 },
    { slug: "salidas_pareja",    name: "Salidas pareja",     emoji: "💑", sort_order: 3 },
    { slug: "restaurante",       name: "Restaurante",        emoji: "🍽️", sort_order: 4 },
    { slug: "servicios",         name: "Servicios",          emoji: "💡", sort_order: 5 },
    { slug: "tarjeta",           name: "Tarjeta",            emoji: "💳", sort_order: 6 },
    { slug: "viaje",             name: "Viaje",              emoji: "✈️", sort_order: 7 },
    { slug: "compras_personales",name: "Compras personales", emoji: "🛍️", sort_order: 8 },
    { slug: "imprevistos",       name: "Imprevistos",        emoji: "⚡", sort_order: 9 },
    { slug: "ingresos",          name: "Ingresos",           emoji: "💵", sort_order: 10 },
    { slug: "movilidad",         name: "Movilidad",          emoji: "🚗", sort_order: 11 },
    { slug: "pareja",            name: "Pareja",             emoji: "💑", sort_order: 12 },
  ];

  const insertedCats: Record<string, string> = {};
  for (const cat of cats) {
    const id = randomUUID();
    insertedCats[cat.slug] = id;
    await db.insert(categories).values({ id, ...cat }).onConflictDoNothing();
  }

  await db.insert(monthly_settings).values({
    id: randomUUID(),
    user_id: userId,
    month: demoMonth,
    income_usd: 4814,
    exchange_rate: 1463,
    exchange_rate_source: "manual",
    saving_goal_usd: 4000,
    saving_goal_yellow: 3800,
  }).onConflictDoNothing();

  const budgetData = [
    { slug: "supermercado",       budget_ars: 146300 },
    { slug: "salidas_pareja",     budget_ars: 73150  },
    { slug: "compras_personales", budget_ars: 73150  },
    { slug: "imprevistos",        budget_ars: 73150  },
  ];

  for (const b of budgetData) {
    await db.insert(budgets).values({
      id: randomUUID(),
      user_id: userId,
      month: demoMonth,
      category_id: insertedCats[b.slug],
      budget_ars: b.budget_ars,
      hard_limit: 1,
    }).onConflictDoNothing();
  }

  console.log("✅ Seed complete");
}

seed().catch(console.error);
