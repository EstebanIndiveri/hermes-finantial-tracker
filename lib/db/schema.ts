import { sql, relations } from "drizzle-orm";
import { text, real, integer, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  telegram_user_id: text("telegram_user_id").unique(),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const monthly_settings = sqliteTable("monthly_settings", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  month: text("month").notNull(),
  income_usd: real("income_usd").notNull().default(0),
  exchange_rate: real("exchange_rate").notNull().default(1),
  exchange_rate_source: text("exchange_rate_source").notNull().default("manual"),
  exchange_rate_updated_at: integer("exchange_rate_updated_at"),
  saving_goal_usd: real("saving_goal_usd").notNull().default(0),
  saving_goal_yellow: real("saving_goal_yellow").notNull().default(0),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  uniqUserMonth: uniqueIndex("ms_user_month_idx").on(t.user_id, t.month),
}));

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("📦"),
  is_active: integer("is_active").notNull().default(1),
  sort_order: integer("sort_order").notNull().default(0),
});

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  month: text("month").notNull(),
  category_id: text("category_id").notNull().references(() => categories.id),
  budget_ars: real("budget_ars").notNull().default(0),
  hard_limit: integer("hard_limit").notNull().default(1),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  uniqUserMonthCat: uniqueIndex("budgets_user_month_cat_idx").on(t.user_id, t.month, t.category_id),
}));

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  category_id: text("category_id").notNull().references(() => categories.id),
  amount_ars: real("amount_ars").notNull(),
  amount_usd: real("amount_usd").notNull(),
  merchant: text("merchant"),
  description: text("description"),
  date: text("date").notNull(),
  month: text("month").notNull(),
  source: text("source").notNull().default("web"),
  status: text("status").notNull().default("active"),
  is_exception: integer("is_exception").notNull().default(0),
  deleted_at: integer("deleted_at"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const bot_messages = sqliteTable("bot_messages", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  telegram_chat_id: text("telegram_chat_id").notNull(),
  telegram_user_id: text("telegram_user_id").notNull(),
  telegram_update_id: text("telegram_update_id").unique(),
  raw_text: text("raw_text").notNull(),
  parsed_intent: text("parsed_intent"),
  response_text: text("response_text").notNull(),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// Relations for query builder with `with` syntax
export const usersRelations = relations(users, ({ many }) => ({
  transactions: many(transactions),
  monthly_settings: many(monthly_settings),
  budgets: many(budgets),
  bot_messages: many(bot_messages),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.user_id],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [transactions.category_id],
    references: [categories.id],
  }),
}));

export const monthlySettingsRelations = relations(monthly_settings, ({ one }) => ({
  user: one(users, {
    fields: [monthly_settings.user_id],
    references: [users.id],
  }),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  user: one(users, {
    fields: [budgets.user_id],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [budgets.category_id],
    references: [categories.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  transactions: many(transactions),
  budgets: many(budgets),
}));

export const botMessagesRelations = relations(bot_messages, ({ one }) => ({
  user: one(users, {
    fields: [bot_messages.user_id],
    references: [users.id],
  }),
}));
