CREATE TABLE `product_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`order_id` text,
	`customer_name` text NOT NULL,
	`rating` integer NOT NULL,
	`body` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`is_verified` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`product_id`) REFERENCES `products`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_reviews_store_id_uq` ON `product_reviews` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `product_reviews_product_idx` ON `product_reviews` (`store_id`,`product_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_reviews_order_product_uq` ON `product_reviews` (`store_id`,`order_id`,`product_id`);