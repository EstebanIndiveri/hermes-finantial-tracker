CREATE TABLE `bot_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`telegram_chat_id` text NOT NULL,
	`telegram_user_id` text NOT NULL,
	`telegram_update_id` text,
	`raw_text` text NOT NULL,
	`parsed_intent` text,
	`response_text` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bot_messages_telegram_update_id_unique` ON `bot_messages` (`telegram_update_id`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`month` text NOT NULL,
	`category_id` text NOT NULL,
	`budget_ars` real DEFAULT 0 NOT NULL,
	`hard_limit` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_user_month_cat_idx` ON `budgets` (`user_id`,`month`,`category_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`emoji` text DEFAULT '📦' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `monthly_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`month` text NOT NULL,
	`income_usd` real DEFAULT 0 NOT NULL,
	`exchange_rate` real DEFAULT 1 NOT NULL,
	`exchange_rate_source` text DEFAULT 'manual' NOT NULL,
	`exchange_rate_updated_at` integer,
	`saving_goal_usd` real DEFAULT 0 NOT NULL,
	`saving_goal_yellow` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ms_user_month_idx` ON `monthly_settings` (`user_id`,`month`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`amount_ars` real NOT NULL,
	`amount_usd` real NOT NULL,
	`merchant` text,
	`description` text,
	`date` text NOT NULL,
	`month` text NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_exception` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tx_user_month_idx` ON `transactions` (`user_id`,`month`);--> statement-breakpoint
CREATE INDEX `tx_category_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`telegram_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_telegram_user_id_unique` ON `users` (`telegram_user_id`);