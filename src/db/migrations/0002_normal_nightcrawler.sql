CREATE TABLE `password_reset_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token_hash` text,
	`expires_at` integer,
	`issued_by` text,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pwreset_user_idx` ON `password_reset_requests` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `pwreset_token_uq` ON `password_reset_requests` (`token_hash`);