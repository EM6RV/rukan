CREATE TABLE `announcement_dismissals` (
	`announcement_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `announcement_dismissals_uq` ON `announcement_dismissals` (`announcement_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`store_id` text,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`meta` text,
	`ip` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_store_idx` ON `audit_logs` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_logs` (`actor_user_id`);--> statement-breakpoint
CREATE TABLE `cities` (
	`id` text PRIMARY KEY NOT NULL,
	`name_ar` text NOT NULL,
	`region` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cities_name_ar_unique` ON `cities` (`name_ar`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`driver` text NOT NULL,
	`data` blob,
	`object_key` text,
	`is_private` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_store_id_uq` ON `media` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `media_store_idx` ON `media` (`store_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name_ar` text NOT NULL,
	`description_ar` text,
	`price_monthly` integer NOT NULL,
	`price_yearly` integer NOT NULL,
	`limits` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_slug_unique` ON `plans` (`slug`);--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `site_content` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `store_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`domain` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_domains_domain_unique` ON `store_domains` (`domain`);--> statement-breakpoint
CREATE INDEX `store_domains_store_idx` ON `store_domains` (`store_id`);--> statement-breakpoint
CREATE TABLE `store_members` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_members_uq` ON `store_members` (`store_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `store_members_user_idx` ON `store_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`business_type` text DEFAULT 'other' NOT NULL,
	`template` text DEFAULT 'simple' NOT NULL,
	`status` text DEFAULT 'trial' NOT NULL,
	`plan_id` text,
	`billing_cycle` text DEFAULT 'monthly' NOT NULL,
	`trial_ends_at` integer,
	`current_period_end` integer,
	`next_order_number` integer DEFAULT 1001 NOT NULL,
	`logo_media_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stores_slug_unique` ON `stores` (`slug`);--> statement-breakpoint
CREATE INDEX `stores_owner_idx` ON `stores` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `stores_status_idx` ON `stores` (`status`);--> statement-breakpoint
CREATE TABLE `subscription_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`billing_cycle` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`receipt_media_id` text,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`note` text,
	`recorded_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sub_payments_store_idx` ON `subscription_payments` (`store_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`platform_role` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`image_media_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`image_media_id`) REFERENCES `media`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_store_id_uq` ON `categories` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_uq` ON `categories` (`store_id`,`slug`);--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`coupon_id` text NOT NULL,
	`order_id` text NOT NULL,
	`discount` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`coupon_id`) REFERENCES `coupons`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupon_redemptions_order_uq` ON `coupon_redemptions` (`store_id`,`order_id`);--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`code` text NOT NULL,
	`type` text NOT NULL,
	`value` integer NOT NULL,
	`min_order` integer,
	`max_uses` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`starts_at` integer,
	`expires_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_store_id_uq` ON `coupons` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_uq` ON `coupons` (`store_id`,`code`);--> statement-breakpoint
CREATE TABLE `courier_cash_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`courier_id` text NOT NULL,
	`order_id` text,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text,
	`actor_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`courier_id`) REFERENCES `couriers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cash_entries_courier_idx` ON `courier_cash_entries` (`store_id`,`courier_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `couriers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`kind` text DEFAULT 'person' NOT NULL,
	`user_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `couriers_store_id_uq` ON `couriers` (`store_id`,`id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`phone` text NOT NULL,
	`name` text NOT NULL,
	`orders_count` integer DEFAULT 0 NOT NULL,
	`delivered_count` integer DEFAULT 0 NOT NULL,
	`returned_count` integer DEFAULT 0 NOT NULL,
	`total_spent` integer DEFAULT 0 NOT NULL,
	`flag` text DEFAULT 'none' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_store_id_uq` ON `customers` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_uq` ON `customers` (`store_id`,`phone`);--> statement-breakpoint
CREATE TABLE `delivery_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`city_id` text NOT NULL,
	`fee` integer DEFAULT 0 NOT NULL,
	`eta_text` text,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_rates_uq` ON `delivery_rates` (`store_id`,`city_id`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`name` text NOT NULL,
	`variant_label` text,
	`unit_price` integer NOT NULL,
	`unit_cost` integer,
	`quantity` integer NOT NULL,
	`image_media_id` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`product_id`) REFERENCES `products`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_items_store_id_uq` ON `order_items` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`store_id`,`order_id`);--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`note` text,
	`actor_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `osh_order_idx` ON `order_status_history` (`store_id`,`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`number` integer NOT NULL,
	`tracking_token` text NOT NULL,
	`customer_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text NOT NULL,
	`city_id` text NOT NULL,
	`city_name` text NOT NULL,
	`address` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'new' NOT NULL,
	`payment_method` text DEFAULT 'cod' NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`subtotal` integer NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`delivery_fee` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`coupon_id` text,
	`coupon_code` text,
	`courier_id` text,
	`shipment_number` text,
	`internal_notes` text,
	`source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`customer_id`) REFERENCES `customers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`coupon_id`) REFERENCES `coupons`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`courier_id`) REFERENCES `couriers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_store_id_uq` ON `orders` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_uq` ON `orders` (`store_id`,`number`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`store_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_customer_idx` ON `orders` (`store_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `orders_courier_idx` ON `orders` (`store_id`,`courier_id`);--> statement-breakpoint
CREATE TABLE `payment_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`media_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`media_id`) REFERENCES `media`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `receipts_order_idx` ON `payment_receipts` (`store_id`,`order_id`);--> statement-breakpoint
CREATE TABLE `product_categories` (
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`product_id`, `category_id`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`product_id`) REFERENCES `products`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`category_id`) REFERENCES `categories`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`media_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`alt` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`product_id`) REFERENCES `products`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`media_id`) REFERENCES `media`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `product_images_idx` ON `product_images` (`store_id`,`product_id`,`position`);--> statement-breakpoint
CREATE TABLE `product_option_values` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`option_id` text NOT NULL,
	`value` text NOT NULL,
	`color_hex` text,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`option_id`) REFERENCES `product_options`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_option_values_store_id_uq` ON `product_option_values` (`store_id`,`id`);--> statement-breakpoint
CREATE TABLE `product_options` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`product_id`) REFERENCES `products`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_options_store_id_uq` ON `product_options` (`store_id`,`id`);--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`sku` text,
	`price` integer,
	`compare_at_price` integer,
	`cost_price` integer,
	`stock` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`image_media_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`product_id`) REFERENCES `products`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`image_media_id`) REFERENCES `media`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_variants_store_id_uq` ON `product_variants` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `product_variants_product_idx` ON `product_variants` (`store_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`price` integer NOT NULL,
	`compare_at_price` integer,
	`cost_price` integer,
	`is_featured` integer DEFAULT false NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_store_id_uq` ON `products` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_uq` ON `products` (`store_id`,`slug`);--> statement-breakpoint
CREATE INDEX `products_list_idx` ON `products` (`store_id`,`is_visible`,`position`);--> statement-breakpoint
CREATE TABLE `return_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`return_id` text NOT NULL,
	`order_item_id` text NOT NULL,
	`quantity` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`return_id`) REFERENCES `returns`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`order_item_id`) REFERENCES `order_items`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `returns` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`reason` text NOT NULL,
	`reason_note` text,
	`restocked` integer DEFAULT true NOT NULL,
	`shipping_loss` integer DEFAULT 0 NOT NULL,
	`actor_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `returns_store_id_uq` ON `returns` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `returns_order_idx` ON `returns` (`store_id`,`order_id`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`order_id` text,
	`note` text,
	`actor_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_movements_variant_idx` ON `stock_movements` (`store_id`,`variant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `store_home_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`type` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `home_sections_idx` ON `store_home_sections` (`store_id`,`position`);--> statement-breakpoint
CREATE TABLE `store_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`is_published` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_pages_slug_uq` ON `store_pages` (`store_id`,`slug`);--> statement-breakpoint
CREATE TABLE `store_payment_methods` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`method` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_payment_methods_uq` ON `store_payment_methods` (`store_id`,`method`);--> statement-breakpoint
CREATE TABLE `store_settings` (
	`store_id` text PRIMARY KEY NOT NULL,
	`contact_phone` text,
	`whatsapp` text,
	`email` text,
	`address` text,
	`instagram` text,
	`tiktok` text,
	`facebook` text,
	`snapchat` text,
	`seo_title` text,
	`seo_description` text,
	`og_media_id` text,
	`meta_pixel_id` text,
	`tiktok_pixel_id` text,
	`thanks_message` text,
	`announcement_bar` text,
	`footer_text` text,
	`primary_color` text DEFAULT '#0D263E' NOT NULL,
	`accent_color` text DEFAULT '#C19E58' NOT NULL,
	`font_key` text DEFAULT 'ibm-plex' NOT NULL,
	`free_delivery_over` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `variant_option_values` (
	`store_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`option_value_id` text NOT NULL,
	PRIMARY KEY(`variant_id`, `option_value_id`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`option_value_id`) REFERENCES `product_option_values`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `whatsapp_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`key` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_templates_uq` ON `whatsapp_templates` (`store_id`,`key`);