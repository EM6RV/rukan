CREATE TABLE `design_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`user_id` text,
	`service` text NOT NULL,
	`note` text,
	`is_free` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `design_requests_store_idx` ON `design_requests` (`store_id`,`created_at`);--> statement-breakpoint
-- الباقة السنوية (فل مزايا) تاخذ تصميم مجاني واحد (ريل أو لوجو) في كل فترة اشتراك
UPDATE `plans` SET `limits` = json_set(`limits`, '$.freeDesigns', 1) WHERE `slug` = 'yearly' AND `billing_period` = 'yearly';
