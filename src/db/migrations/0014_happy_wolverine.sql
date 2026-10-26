CREATE TABLE `store_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`permissions` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_roles_store_id_uq` ON `store_roles` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `store_roles_name_uq` ON `store_roles` (`store_id`,`name`);--> statement-breakpoint
CREATE TABLE `store_visits` (
	`store_id` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`product_id` text DEFAULT '' NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`sessions` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`store_id`, `day`, `kind`, `source`, `product_id`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `store_members` ADD `custom_role_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_company` text;--> statement-breakpoint
ALTER TABLE `product_variants` ADD `min_stock` integer;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `abandoned_retention_days` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `shipping_tracking_urls` text DEFAULT '{}' NOT NULL;