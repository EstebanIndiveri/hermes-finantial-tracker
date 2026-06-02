import { relations } from "drizzle-orm/relations";
import { users, botMessages, categories, budgets, groups, monthlySettings, transactions, receiptImports, groupMembers, groupInvitations, telegramLinkCodes } from "./schema";

export const botMessagesRelations = relations(botMessages, ({one}) => ({
	user: one(users, {
		fields: [botMessages.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	botMessages: many(botMessages),
	budgets: many(budgets),
	monthlySettings: many(monthlySettings),
	transactions: many(transactions),
	group: one(groups, {
		fields: [users.activeTelegramGroupId],
		references: [groups.id],
		relationName: "users_activeTelegramGroupId_groups_id"
	}),
	receiptImports: many(receiptImports),
	groups: many(groups, {
		relationName: "groups_ownerId_users_id"
	}),
	groupMembers: many(groupMembers),
	groupInvitations_usedBy: many(groupInvitations, {
		relationName: "groupInvitations_usedBy_users_id"
	}),
	groupInvitations_createdBy: many(groupInvitations, {
		relationName: "groupInvitations_createdBy_users_id"
	}),
	telegramLinkCodes: many(telegramLinkCodes),
}));

export const budgetsRelations = relations(budgets, ({one}) => ({
	category: one(categories, {
		fields: [budgets.categoryId],
		references: [categories.id]
	}),
	user: one(users, {
		fields: [budgets.userId],
		references: [users.id]
	}),
	group: one(groups, {
		fields: [budgets.groupId],
		references: [groups.id]
	}),
}));

export const categoriesRelations = relations(categories, ({one, many}) => ({
	budgets: many(budgets),
	group: one(groups, {
		fields: [categories.groupId],
		references: [groups.id]
	}),
	transactions: many(transactions),
}));

export const groupsRelations = relations(groups, ({one, many}) => ({
	budgets: many(budgets),
	categories: many(categories),
	monthlySettings: many(monthlySettings),
	transactions: many(transactions),
	users: many(users, {
		relationName: "users_activeTelegramGroupId_groups_id"
	}),
	user: one(users, {
		fields: [groups.ownerId],
		references: [users.id],
		relationName: "groups_ownerId_users_id"
	}),
	groupMembers: many(groupMembers),
	groupInvitations: many(groupInvitations),
}));

export const monthlySettingsRelations = relations(monthlySettings, ({one}) => ({
	user: one(users, {
		fields: [monthlySettings.userId],
		references: [users.id]
	}),
	group: one(groups, {
		fields: [monthlySettings.groupId],
		references: [groups.id]
	}),
}));

export const transactionsRelations = relations(transactions, ({one}) => ({
	category: one(categories, {
		fields: [transactions.categoryId],
		references: [categories.id]
	}),
	user: one(users, {
		fields: [transactions.userId],
		references: [users.id]
	}),
	group: one(groups, {
		fields: [transactions.groupId],
		references: [groups.id]
	}),
}));

export const receiptImportsRelations = relations(receiptImports, ({one}) => ({
	user: one(users, {
		fields: [receiptImports.userId],
		references: [users.id]
	}),
}));

export const groupMembersRelations = relations(groupMembers, ({one}) => ({
	user: one(users, {
		fields: [groupMembers.userId],
		references: [users.id]
	}),
	group: one(groups, {
		fields: [groupMembers.groupId],
		references: [groups.id]
	}),
}));

export const groupInvitationsRelations = relations(groupInvitations, ({one}) => ({
	user_usedBy: one(users, {
		fields: [groupInvitations.usedBy],
		references: [users.id],
		relationName: "groupInvitations_usedBy_users_id"
	}),
	user_createdBy: one(users, {
		fields: [groupInvitations.createdBy],
		references: [users.id],
		relationName: "groupInvitations_createdBy_users_id"
	}),
	group: one(groups, {
		fields: [groupInvitations.groupId],
		references: [groups.id]
	}),
}));

export const telegramLinkCodesRelations = relations(telegramLinkCodes, ({one}) => ({
	user: one(users, {
		fields: [telegramLinkCodes.userId],
		references: [users.id]
	}),
}));