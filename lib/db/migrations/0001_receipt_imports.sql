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
