CREATE TABLE `group_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`token` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`used_by` text,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gi_token_idx` ON `group_invitations` (`token`);--> statement-breakpoint
CREATE INDEX `gi_group_id_idx` ON `group_invitations` (`group_id`);--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gm_group_user_idx` ON `group_members` (`group_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `gm_user_id_idx` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `receipt_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`telegram_file_id` text,
	`ocr_raw_text` text,
	`caption` text,
	`parsed_amount_ars` real,
	`parsed_category_slug` text,
	`parsed_merchant` text,
	`parsed_date` text,
	`groq_raw_response` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`transaction_id` text,
	`fail_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `telegram_link_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP INDEX `budgets_user_month_cat_idx`;--> statement-breakpoint
ALTER TABLE `budgets` ADD `group_id` text REFERENCES groups(id);--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_group_month_cat_idx` ON `budgets` (`group_id`,`month`,`category_id`);--> statement-breakpoint
CREATE INDEX `budgets_group_id_idx` ON `budgets` (`group_id`);--> statement-breakpoint
DROP INDEX `categories_slug_unique`;--> statement-breakpoint
ALTER TABLE `categories` ADD `group_id` text REFERENCES groups(id);--> statement-breakpoint
ALTER TABLE `categories` ADD `default_hard_limit` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_group_idx` ON `categories` (`slug`,`group_id`);--> statement-breakpoint
DROP INDEX `ms_user_month_idx`;--> statement-breakpoint
ALTER TABLE `monthly_settings` ADD `group_id` text REFERENCES groups(id);--> statement-breakpoint
CREATE UNIQUE INDEX `ms_group_month_idx` ON `monthly_settings` (`group_id`,`month`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `group_id` text REFERENCES groups(id);--> statement-breakpoint
CREATE INDEX `tx_group_id_idx` ON `transactions` (`group_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `username` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `personal_token_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `active_telegram_group_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `onboarding_completed_at` integer;