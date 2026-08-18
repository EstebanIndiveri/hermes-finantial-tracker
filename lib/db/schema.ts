import { sql, relations } from "drizzle-orm";
import { text, real, integer, sqliteTable, uniqueIndex, index, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().default(""),
  telegram_user_id: text("telegram_user_id").unique(),
  personal_token_hash: text("personal_token_hash"),
  active_telegram_group_id: text("active_telegram_group_id"), // FK to groups.id — constraint defined in migration
  onboarding_completed_at: integer("onboarding_completed_at"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const monthly_settings = sqliteTable("monthly_settings", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  group_id: text("group_id").references(() => groups.id),
  month: text("month").notNull(),
  income_usd: real("income_usd").notNull().default(0),
  exchange_rate: real("exchange_rate").notNull().default(1),
  exchange_rate_source: text("exchange_rate_source").notNull().default("manual"),
  exchange_rate_updated_at: integer("exchange_rate_updated_at"),
  saving_goal_usd: real("saving_goal_usd").notNull().default(0),
  saving_goal_yellow: real("saving_goal_yellow").notNull().default(0),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  uniqGroupMonth: uniqueIndex("ms_group_month_idx").on(t.group_id, t.month),
}));

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  group_id: text("group_id").references(() => groups.id),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("📦"),
  is_active: integer("is_active").notNull().default(1),
  sort_order: integer("sort_order").notNull().default(0),
  default_hard_limit: integer("default_hard_limit").notNull().default(1),
}, (t) => ({
  slugGroupIdx: uniqueIndex("categories_slug_group_idx").on(t.slug, t.group_id),
}));

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  group_id: text("group_id").references(() => groups.id),
  month: text("month").notNull(),
  category_id: text("category_id").notNull().references(() => categories.id),
  budget_ars: real("budget_ars").notNull().default(0),
  hard_limit: integer("hard_limit").notNull().default(1),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  uniqGroupMonthCat: uniqueIndex("budgets_group_month_cat_idx").on(t.group_id, t.month, t.category_id),
  groupIdx: index("budgets_group_id_idx").on(t.group_id),
}));

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  group_id: text("group_id").references(() => groups.id),
  category_id: text("category_id").notNull().references(() => categories.id),
  amount_ars: real("amount_ars").notNull(),
  amount_usd: real("amount_usd").notNull(),
  merchant: text("merchant"),
  description: text("description"),
  date: text("date").notNull(),
  month: text("month").notNull(),
  source: text("source").notNull().default("web"),
  status: text("status").notNull().default("active"),
  requiresReimbursement: integer("requires_reimbursement", { mode: "boolean" }).default(false),
  is_exception: integer("is_exception").notNull().default(0),
  deleted_at: integer("deleted_at"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  userMonthIdx: index("tx_user_month_idx").on(t.user_id, t.month),
  categoryIdx: index("tx_category_idx").on(t.category_id),
  groupIdx: index("tx_group_id_idx").on(t.group_id),
}));

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

export const receipt_imports = sqliteTable("receipt_imports", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  telegram_file_id: text("telegram_file_id"),
  ocr_raw_text: text("ocr_raw_text"),
  caption: text("caption"),
  parsed_amount_ars: real("parsed_amount_ars"),
  parsed_category_slug: text("parsed_category_slug"),
  parsed_merchant: text("parsed_merchant"),
  parsed_date: text("parsed_date"),
  groq_raw_response: text("groq_raw_response"),
  status: text("status").notNull().default("pending"),
  transaction_id: text("transaction_id"),
  fail_reason: text("fail_reason"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  owner_id: text("owner_id").notNull().references(() => users.id),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const group_members = sqliteTable("group_members", {
  group_id: text("group_id").notNull().references(() => groups.id),
  user_id: text("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
  joined_at: integer("joined_at").notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  pk: uniqueIndex("gm_group_user_idx").on(t.group_id, t.user_id),
  userIdx: index("gm_user_id_idx").on(t.user_id),
}));

export const group_invitations = sqliteTable("group_invitations", {
  id: text("id").primaryKey(),
  group_id: text("group_id").notNull().references(() => groups.id),
  token: text("token").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull(),
  created_by: text("created_by").notNull().references(() => users.id),
  expires_at: integer("expires_at").notNull(),
  used_at: integer("used_at"),
  used_by: text("used_by").references(() => users.id),
}, (t) => ({
  tokenIdx: uniqueIndex("gi_token_idx").on(t.token),
  groupIdx: index("gi_group_id_idx").on(t.group_id),
}));

export const telegram_link_codes = sqliteTable("telegram_link_codes", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires_at: integer("expires_at").notNull(),
  used: integer("used").notNull().default(0),
});

export const temp_users = sqliteTable("temp_users", {
  id: text("id").primaryKey(),
  telegram_user_id: text("telegram_user_id").notNull().unique(),
  telegram_username: text("telegram_username"),
  first_name: text("first_name").notNull(),
  last_name: text("last_name"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  upgraded_to: text("upgraded_to").references(() => users.id),
});

export const bot_conversation_state = sqliteTable("bot_conversation_state", {
  chat_id: text("chat_id").notNull(),
  user_id: text("user_id").notNull(),
  state: text("state").notNull(),
  expires_at: integer("expires_at").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.chat_id, t.user_id] }),
}));

export const split_sessions = sqliteTable("split_sessions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  owner_user_id: text("owner_user_id").notNull().references(() => users.id),
  telegram_chat_id: text("telegram_chat_id").unique(),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  last_alert_at: integer("last_alert_at"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  closed_at: integer("closed_at"),
  closing_note: text("closing_note"),
});

export const split_session_members = sqliteTable("split_session_members", {
  session_id: text("session_id").notNull().references(() => split_sessions.id),
  user_id: text("user_id").references(() => users.id),
  temp_user_id: text("temp_user_id").references(() => temp_users.id),
  joined_at: integer("joined_at").notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({
  uniq_user: uniqueIndex("ssm_user_uniq").on(t.session_id, t.user_id),
  uniq_temp: uniqueIndex("ssm_temp_uniq").on(t.session_id, t.temp_user_id),
}));

export const splits = sqliteTable("splits", {
  id: text("id").primaryKey(),
  session_id: text("session_id").notNull().references(() => split_sessions.id),
  description: text("description").notNull(),
  total_amount: real("total_amount").notNull(),
  split_type: text("split_type", { enum: ["equal", "percentage", "fixed"] }).notNull().default("equal"),
  status: text("status", { enum: ["active", "cancelled"] }).notNull().default("active"),
  created_by_user_id: text("created_by_user_id").references(() => users.id),
  created_by_temp_id: text("created_by_temp_id").references(() => temp_users.id),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  cancelled_at: integer("cancelled_at"),
  telegram_message_id: text("telegram_message_id"),
});

export const split_payers = sqliteTable("split_payers", {
  id: text("id").primaryKey(),
  split_id: text("split_id").notNull().references(() => splits.id),
  user_id: text("user_id").references(() => users.id),
  temp_user_id: text("temp_user_id").references(() => temp_users.id),
  amount_paid: real("amount_paid").notNull(),
});

export const split_items = sqliteTable("split_items", {
  id: text("id").primaryKey(),
  split_id: text("split_id").notNull().references(() => splits.id),
  user_id: text("user_id").references(() => users.id),
  temp_user_id: text("temp_user_id").references(() => temp_users.id),
  amount_owed: real("amount_owed").notNull(),
  percentage: real("percentage"),
});

export const split_payments = sqliteTable("split_payments", {
  id: text("id").primaryKey(),
  session_id: text("session_id").notNull().references(() => split_sessions.id),
  payer_user_id: text("payer_user_id").references(() => users.id),
  payer_temp_id: text("payer_temp_id").references(() => temp_users.id),
  payee_user_id: text("payee_user_id").references(() => users.id),
  payee_temp_id: text("payee_temp_id").references(() => temp_users.id),
  amount: real("amount").notNull(),
  method: text("method", { enum: ["manual", "receipt_ocr"] }).notNull().default("manual"),
  receipt_image_url: text("receipt_image_url"),
  ocr_raw_text: text("ocr_raw_text"),
  confirmed_at: integer("confirmed_at"),
  telegram_update_id: text("telegram_update_id"),
});

export const userPaymentInfo = sqliteTable("user_payment_info", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  paymentMethod: text("payment_method").notNull(),
  value: text("value"),
  isDefault: integer("is_default", { mode: "boolean" }).default(false),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const reimbursementRequests = sqliteTable("reimbursement_requests", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull().references(() => transactions.id),
  requesterId: text("requester_id").notNull().references(() => users.id),
  payerId: text("payer_id").references(() => users.id),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("pending"),
  paidAt: text("paid_at"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ── Splits / Compartidos relations ──────────────────────────
export const tempUsersRelations = relations(temp_users, ({ one, many }) => ({
  upgradedTo: one(users, { fields: [temp_users.upgraded_to], references: [users.id] }),
}));

export const splitSessionsRelations = relations(split_sessions, ({ one, many }) => ({
  owner: one(users, { fields: [split_sessions.owner_user_id], references: [users.id] }),
  members: many(split_session_members),
  splits: many(splits),
  payments: many(split_payments),
}));

export const splitSessionMembersRelations = relations(split_session_members, ({ one }) => ({
  session: one(split_sessions, { fields: [split_session_members.session_id], references: [split_sessions.id] }),
  user: one(users, { fields: [split_session_members.user_id], references: [users.id] }),
  tempUser: one(temp_users, { fields: [split_session_members.temp_user_id], references: [temp_users.id] }),
}));

export const splitsRelations = relations(splits, ({ one, many }) => ({
  session: one(split_sessions, { fields: [splits.session_id], references: [split_sessions.id] }),
  payers: many(split_payers),
  items: many(split_items),
  createdByUser: one(users, { fields: [splits.created_by_user_id], references: [users.id] }),
  createdByTemp: one(temp_users, { fields: [splits.created_by_temp_id], references: [temp_users.id] }),
}));

export const splitPayersRelations = relations(split_payers, ({ one }) => ({
  split: one(splits, { fields: [split_payers.split_id], references: [splits.id] }),
  user: one(users, { fields: [split_payers.user_id], references: [users.id] }),
  tempUser: one(temp_users, { fields: [split_payers.temp_user_id], references: [temp_users.id] }),
}));

export const splitItemsRelations = relations(split_items, ({ one }) => ({
  split: one(splits, { fields: [split_items.split_id], references: [splits.id] }),
  user: one(users, { fields: [split_items.user_id], references: [users.id] }),
  tempUser: one(temp_users, { fields: [split_items.temp_user_id], references: [temp_users.id] }),
}));

export const splitPaymentsRelations = relations(split_payments, ({ one }) => ({
  session: one(split_sessions, { fields: [split_payments.session_id], references: [split_sessions.id] }),
  payerUser: one(users, { fields: [split_payments.payer_user_id], references: [users.id] }),
  payerTemp: one(temp_users, { fields: [split_payments.payer_temp_id], references: [temp_users.id] }),
  payeeUser: one(users, { fields: [split_payments.payee_user_id], references: [users.id] }),
  payeeTemp: one(temp_users, { fields: [split_payments.payee_temp_id], references: [temp_users.id] }),
}));

export const userPaymentInfoRelations = relations(userPaymentInfo, ({ one }) => ({
  user: one(users, { fields: [userPaymentInfo.userId], references: [users.id] }),
}));

export const reimbursementRequestsRelations = relations(reimbursementRequests, ({ one }) => ({
  transaction: one(transactions, { fields: [reimbursementRequests.transactionId], references: [transactions.id] }),
  requester: one(users, { fields: [reimbursementRequests.requesterId], references: [users.id] }),
  payer: one(users, { fields: [reimbursementRequests.payerId], references: [users.id] }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
}));

// Relations for query builder with `with` syntax

export const usersRelations = relations(users, ({ many }) => ({
  transactions: many(transactions),
  monthly_settings: many(monthly_settings),
  budgets: many(budgets),
  bot_messages: many(bot_messages),
  receipt_imports: many(receipt_imports),
  telegram_link_codes: many(telegram_link_codes),
}));

export const telegramLinkCodesRelations = relations(telegram_link_codes, ({ one }) => ({
  user: one(users, {
    fields: [telegram_link_codes.user_id],
    references: [users.id],
  }),
}));

export const receiptImportsRelations = relations(receipt_imports, ({ one }) => ({
  user: one(users, {
    fields: [receipt_imports.user_id],
    references: [users.id],
  }),
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
  group: one(groups, {
    fields: [transactions.group_id],
    references: [groups.id],
  }),
}));

export const monthlySettingsRelations = relations(monthly_settings, ({ one }) => ({
  user: one(users, {
    fields: [monthly_settings.user_id],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [monthly_settings.group_id],
    references: [groups.id],
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
  group: one(groups, {
    fields: [budgets.group_id],
    references: [groups.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  transactions: many(transactions),
  budgets: many(budgets),
  group: one(groups, {
    fields: [categories.group_id],
    references: [groups.id],
  }),
}));

export const botMessagesRelations = relations(bot_messages, ({ one }) => ({
  user: one(users, {
    fields: [bot_messages.user_id],
    references: [users.id],
  }),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  owner: one(users, { fields: [groups.owner_id], references: [users.id] }),
  members: many(group_members),
  invitations: many(group_invitations),
}));

export const groupMembersRelations = relations(group_members, ({ one }) => ({
  group: one(groups, { fields: [group_members.group_id], references: [groups.id] }),
  user: one(users, { fields: [group_members.user_id], references: [users.id] }),
}));

export const groupInvitationsRelations = relations(group_invitations, ({ one }) => ({
  group: one(groups, { fields: [group_invitations.group_id], references: [groups.id] }),
  creator: one(users, { fields: [group_invitations.created_by], references: [users.id] }),
  usedBy: one(users, { fields: [group_invitations.used_by], references: [users.id] }),
}));
