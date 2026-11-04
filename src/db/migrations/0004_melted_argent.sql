CREATE TABLE `abandoned_carts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`phone` text NOT NULL,
	`name` text,
	`items` text NOT NULL,
	`item_count` integer NOT NULL,
	`total` integer NOT NULL,
	`reminded_at` integer,
	`recovered_at` integer,
	`created_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `abandoned_carts_phone_uq` ON `abandoned_carts` (`store_id`,`phone`);--> statement-breakpoint
CREATE INDEX `abandoned_carts_activity_idx` ON `abandoned_carts` (`store_id`,`last_activity_at`);