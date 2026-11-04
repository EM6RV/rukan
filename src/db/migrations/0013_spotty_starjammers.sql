CREATE TABLE `brands` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brands_store_id_uq` ON `brands` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `brands_slug_uq` ON `brands` (`store_id`,`slug`);--> statement-breakpoint
CREATE TABLE `bundle_items` (
	`store_id` text NOT NULL,
	`bundle_product_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`bundle_product_id`, `variant_id`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`bundle_product_id`) REFERENCES `products`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `option_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`values` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `option_presets_store_id_uq` ON `option_presets` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `option_presets_name_uq` ON `option_presets` (`store_id`,`name`);--> statement-breakpoint
CREATE TABLE `product_tags` (
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`product_id`, `tag`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`product_id`) REFERENCES `products`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_tags_tag_idx` ON `product_tags` (`store_id`,`tag`);--> statement-breakpoint
ALTER TABLE `order_items` ADD `personalization_text` text;--> statement-breakpoint
ALTER TABLE `product_variants` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `brand_id` text;--> statement-breakpoint
ALTER TABLE `products` ADD `kind` text DEFAULT 'simple' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `personalization_label` text;--> statement-breakpoint
ALTER TABLE `products` ADD `personalization_max_chars` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `personalization_price` integer DEFAULT 0 NOT NULL;