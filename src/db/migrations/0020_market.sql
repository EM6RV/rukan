CREATE TABLE `product_barcodes` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`unit_id` text,
	`code` text NOT NULL,
	`is_internal` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`unit_id`) REFERENCES `product_units`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_barcodes_code_uq` ON `product_barcodes` (`store_id`,`code`);--> statement-breakpoint
CREATE INDEX `product_barcodes_variant_idx` ON `product_barcodes` (`store_id`,`variant_id`);--> statement-breakpoint
CREATE TABLE `product_units` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`factor` integer NOT NULL,
	`price` integer,
	`semi_price` integer,
	`wholesale_price` integer,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`product_id`) REFERENCES `products`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_units_store_id_uq` ON `product_units` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_units_name_uq` ON `product_units` (`store_id`,`product_id`,`name`);--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`config` text NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotions_store_id_uq` ON `promotions` (`store_id`,`id`);--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_factor` integer DEFAULT 1 NOT NULL,
	`unit_name` text,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`order_id`, `variant_id`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `purchase_orders`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`number` integer NOT NULL,
	`supplier_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`note` text,
	`sent_at` integer,
	`invoice_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`supplier_id`) REFERENCES `suppliers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_orders_store_id_uq` ON `purchase_orders` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_orders_number_uq` ON `purchase_orders` (`store_id`,`number`);--> statement-breakpoint
CREATE TABLE `stock_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`batch_no` text,
	`expires_at` integer,
	`quantity` integer NOT NULL,
	`unit_cost` integer,
	`purchase_item_id` text,
	`note` text,
	`received_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`purchase_item_id`) REFERENCES `purchase_items`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_batches_store_id_uq` ON `stock_batches` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `stock_batches_variant_idx` ON `stock_batches` (`store_id`,`variant_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `stocktake_counts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`stocktake_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`user_id` text,
	`client_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`stocktake_id`) REFERENCES `stocktakes`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stocktake_counts_client_uq` ON `stocktake_counts` (`store_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `stocktake_counts_idx` ON `stocktake_counts` (`store_id`,`stocktake_id`,`variant_id`);--> statement-breakpoint
CREATE TABLE `variant_prices` (
	`store_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`level` text NOT NULL,
	`price` integer NOT NULL,
	PRIMARY KEY(`variant_id`, `level`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `writeoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`batch_id` text,
	`warehouse_id` text,
	`quantity` integer NOT NULL,
	`reason` text NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`total_cost` integer DEFAULT 0 NOT NULL,
	`note` text,
	`actor_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`batch_id`) REFERENCES `stock_batches`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `writeoffs_created_idx` ON `writeoffs` (`store_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `order_items` ADD `picked_qty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `substitute_variant_id` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `substitute_note` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `prep_status` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `prepared_by` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `prepared_at` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `sold_by` text DEFAULT 'unit' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `plu_code` text;--> statement-breakpoint
ALTER TABLE `products` ADD `quick_position` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `quick_color` text;--> statement-breakpoint
ALTER TABLE `products` ADD `shelf` text;--> statement-breakpoint
CREATE UNIQUE INDEX `products_plu_uq` ON `products` (`store_id`,`plu_code`);--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `due_at` integer;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `purchase_order_id` text;--> statement-breakpoint
ALTER TABLE `purchase_items` ADD `unit_factor` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_items` ADD `batch_no` text;--> statement-breakpoint
ALTER TABLE `purchase_items` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `sale_items` ADD `unit_id` text;--> statement-breakpoint
ALTER TABLE `sale_items` ADD `promotion_id` text;--> statement-breakpoint
ALTER TABLE `sale_items` ADD `promo_discount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stocktakes` ADD `category_id` text;--> statement-breakpoint
ALTER TABLE `stocktakes` ADD `shelf` text;--> statement-breakpoint
ALTER TABLE `stocktakes` ADD `settled_by` text;