import { sqliteTable, AnySQLiteColumn, uniqueIndex, foreignKey, check, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const botMessages = sqliteTable("bot_messages", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id),
	telegramChatId: text("telegram_chat_id").notNull(),
	telegramUserId: text("telegram_user_id").notNull(),
	telegramUpdateId: text("telegram_update_id"),
	rawText: text("raw_text").notNull(),
	parsedIntent: text("parsed_intent"),
	responseText: text("response_text").notNull(),
	createdAt: integer("created_at").default(sql`(unixepoch() * 1000)`).notNull(),
},
(table) => [
	uniqueIndex("bot_messages_telegram_update_id_unique").on(table.telegramUpdateId),
	check("group_members_check_1", sql`role IN ('owner', 'admin', 'member'`),
	check("group_invitations_check_2", sql`role IN ('admin', 'member'`),
]);

export const budgets = sqliteTable("budgets", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id),
	month: text().notNull(),
	categoryId: text("category_id").notNull().references(() => categories.id),
	budgetArs: real("budget_ars").notNull(),
	hardLimit: integer("hard_limit").default(1).notNull(),
	createdAt: integer("created_at").default(sql`(unixepoch() * 1000)`).notNull(),
	groupId: text("group_id").references(() => groups.id),
},
(table) => [
	uniqueIndex("budgets_group_month_cat_idx").on(table.groupId, table.month, table.categoryId),
	check("group_members_check_1", sql`role IN ('owner', 'admin', 'member'`),
	check("group_invitations_check_2", sql`role IN ('admin', 'member'`),
]);

export const categories = sqliteTable("categories", {
	id: text().primaryKey().notNull(),
	slug: text().notNull(),
	name: text().notNull(),
	emoji: text().default("📦").notNull(),
	isActive: integer("is_active").default(1).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	defaultHardLimit: integer("default_hard_limit").default(1).notNull(),
	groupId: text("group_id").references(() => groups.id),
},
(table) => [
	uniqueIndex("categories_slug_unique").on(table.slug),
	check("group_members_check_1", sql`role IN ('owner', 'admin', 'member'`),
	check("group_invitations_check_2", sql`role IN ('admin', 'member'`),
]);

export const monthlySettings = sqliteTable("monthly_settings", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id),
	month: text().notNull(),
	incomeUsd: real("income_usd").notNull(),
	exchangeRate: real("exchange_rate").default(1).notNull(),
	exchangeRateSource: text("exchange_rate_source").default("manual").notNull(),
	exchangeRateUpdatedAt: integer("exchange_rate_updated_at"),
	savingGoalUsd: real("saving_goal_usd").notNull(),
	savingGoalYellow: real("saving_goal_yellow").notNull(),
	createdAt: integer("created_at").default(sql`(unixepoch() * 1000)`).notNull(),
	groupId: text("group_id").references(() => groups.id),
},
(table) => [
	uniqueIndex("ms_group_month_idx").on(table.groupId, table.month),
	check("group_members_check_1", sql`role IN ('owner', 'admin', 'member'`),
	check("group_invitations_check_2", sql`role IN ('admin', 'member'`),
]);

export const transactions = sqliteTable("transactions", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id),
	categoryId: text("category_id").notNull().references(() => categories.id),
	amountArs: real("amount_ars").notNull(),
	amountUsd: real("amount_usd").notNull(),
	merchant: text(),
	description: text(),
	date: text().notNull(),
	month: text().notNull(),
	source: text().default("web").notNull(),
	status: text().default("active").notNull(),
	isException: integer("is_exception").default(0).notNull(),
	deletedAt: integer("deleted_at"),
	createdAt: integer("created_at").default(sql`(unixepoch() * 1000)`).notNull(),
	groupId: text("group_id").references(() => groups.id),
},
(table) => [
	index("tx_category_idx").on(table.categoryId),
	index("tx_user_month_idx").on(table.userId, table.month),
	check("group_members_check_1", sql`role IN ('owner', 'admin', 'member'`),
	check("group_invitations_check_2", sql`role IN ('admin', 'member'`),
]);

export const users = sqliteTable("users", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	telegramUserId: text("telegram_user_id"),
	createdAt: integer("created_at").default(sql`(unixepoch() * 1000)`).notNull(),
	personalTokenHash: text("personal_token_hash"),
	activeTelegramGroupId: text("active_telegram_group_id").references((): AnySQLiteColumn => groups.id),
},
(table) => [
	uniqueIndex("users_telegram_user_id_unique").on(table.telegramUserId),
	check("group_members_check_1", sql`role IN ('owner', 'admin', 'member'`),
	check("group_invitations_check_2", sql`role IN ('admin', 'member'`),
]);

export const receiptImports = sqliteTable("receipt_imports", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id),
	telegramFileId: text("telegram_file_id"),
	ocrRawText: text("ocr_raw_text"),
	caption: text(),
	parsedAmountArs: real("parsed_amount_ars"),
	parsedCategorySlug: text("parsed_category_slug"),
	parsedMerchant: text("parsed_merchant"),
	parsedDate: text("parsed_date"),
	groqRawResponse: text("groq_raw_response"),
	status: text().default("pending").notNull(),
	transactionId: text("transaction_id"),
	failReason: text("fail_reason"),
	createdAt: integer("created_at").default(sql`(unixepoch() * 1000)`).notNull(),
},
(table) => [
	check("group_members_check_1", sql`role IN ('owner', 'admin', 'member'`),
	check("group_invitations_check_2", sql`role IN ('admin', 'member'`),
]);

export const groups = sqliteTable("groups", {
	id: text().primaryKey(),
	name: text().notNull(),
	ownerId: text("owner_id").notNull().references((): AnySQLiteColumn => users.id),
	createdAt: integer("created_at").default(sql`(unixepoch() * 1000)`).notNull(),
},
(table) => [
	check("group_members_check_1", sql`role IN ('owner', 'admin', 'member'`),
	check("group_invitations_check_2", sql`role IN ('admin', 'member'`),
]);

export const groupMembers = sqliteTable("group_members", {
	groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" } ),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	role: text().notNull(),
	joinedAt: integer("joined_at").default(sql`(unixepoch() * 1000)`).notNull(),
},
(table) => [
	primaryKey({ columns: [table.groupId, table.userId], name: "group_members_group_id_user_id_pk"}),
	check("group_members_check_1", sql`role IN ('owner', 'admin', 'member')`),
	check("group_invitations_check_2", sql`role IN ('admin', 'member')`),
]);

export const groupInvitations = sqliteTable("group_invitations", {
	id: text().primaryKey(),
	groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" } ),
	token: text().notNull(),
	role: text().notNull(),
	createdBy: text("created_by").notNull().references(() => users.id),
	expiresAt: integer("expires_at").notNull(),
	usedAt: integer("used_at"),
	usedBy: text("used_by").references(() => users.id),
},
(table) => [
	check("group_invitations_check_1", sql`role IN ('owner', 'admin', 'member')`),
	check("group_invitations_check_2", sql`role IN ('admin', 'member')`),
]);

export const telegramLinkCodes = sqliteTable("telegram_link_codes", {
	id: text().primaryKey(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	expiresAt: integer("expires_at").notNull(),
	used: integer().default(0).notNull(),
},
(table) => [
	check("telegram_link_codes_check_1", sql`role IN ('owner', 'admin', 'member')`),
	check("telegram_link_codes_check_2", sql`role IN ('admin', 'member')`),
]);

