CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`phone` text,
	`warehouse_id` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`receipt_header` text,
	`receipt_footer` text,
	`next_sale_number` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`warehouse_id`) REFERENCES `warehouses`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branches_store_id_uq` ON `branches` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `branches_name_uq` ON `branches` (`store_id`,`name`);--> statement-breakpoint
CREATE TABLE `customer_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`account` text NOT NULL,
	`amount` integer NOT NULL,
	`kind` text NOT NULL,
	`method` text,
	`ref_type` text,
	`ref_id` text,
	`client_id` text,
	`note` text,
	`actor_user_id` text,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`customer_id`) REFERENCES `customers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_ledger_store_id_uq` ON `customer_ledger` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_ledger_client_uq` ON `customer_ledger` (`store_id`,`client_id`,`account`);--> statement-breakpoint
CREATE INDEX `customer_ledger_customer_idx` ON `customer_ledger` (`store_id`,`customer_id`,`account`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`kind` text NOT NULL,
	`line` text NOT NULL,
	`name` text NOT NULL,
	`branch_id` text NOT NULL,
	`register_id` text,
	`token_hash` text NOT NULL,
	`last_seen_at` integer,
	`revoked_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`branch_id`) REFERENCES `branches`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`register_id`) REFERENCES `registers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_hash_unique` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `devices_store_id_uq` ON `devices` (`store_id`,`id`);--> statement-breakpoint
CREATE TABLE `pos_cash_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`client_id` text NOT NULL,
	`shift_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`actor_user_id` text,
	`approved_by` text,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`shift_id`) REFERENCES `pos_shifts`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pos_cash_moves_client_uq` ON `pos_cash_moves` (`store_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `pos_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`client_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`register_id` text,
	`device_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`opened_by` text NOT NULL,
	`opened_at` integer NOT NULL,
	`opening_float` integer DEFAULT 0 NOT NULL,
	`closed_by` text,
	`closed_at` integer,
	`expected_cash` integer,
	`counted_cash` integer,
	`denominations` text,
	`difference` integer,
	`z_number` integer,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`branch_id`) REFERENCES `branches`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`register_id`) REFERENCES `registers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pos_shifts_store_id_uq` ON `pos_shifts` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pos_shifts_client_uq` ON `pos_shifts` (`store_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `pos_shifts_branch_idx` ON `pos_shifts` (`store_id`,`branch_id`,`opened_at`);--> statement-breakpoint
CREATE TABLE `registers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`branch_id`) REFERENCES `branches`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registers_store_id_uq` ON `registers` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `registers_name_uq` ON `registers` (`store_id`,`branch_id`,`name`);--> statement-breakpoint
CREATE TABLE `sale_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`sale_id` text NOT NULL,
	`kind` text DEFAULT 'product' NOT NULL,
	`variant_id` text,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`is_weighed` integer DEFAULT false NOT NULL,
	`unit_factor` integer DEFAULT 1 NOT NULL,
	`base_qty` integer DEFAULT 0 NOT NULL,
	`unit_price` integer NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`unit_cost` integer,
	`returned_qty` integer DEFAULT 0 NOT NULL,
	`ref_id` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`sale_id`) REFERENCES `sales`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sale_items_store_id_uq` ON `sale_items` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `sale_items_sale_idx` ON `sale_items` (`store_id`,`sale_id`);--> statement-breakpoint
CREATE TABLE `sale_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`sale_id` text NOT NULL,
	`method` text NOT NULL,
	`amount` integer NOT NULL,
	`ref` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`sale_id`) REFERENCES `sales`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sale_payments_sale_idx` ON `sale_payments` (`store_id`,`sale_id`);--> statement-breakpoint
CREATE TABLE `sale_return_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`return_id` text NOT NULL,
	`sale_item_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`amount` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`return_id`) REFERENCES `sale_returns`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`sale_item_id`) REFERENCES `sale_items`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sale_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`client_id` text NOT NULL,
	`sale_id` text NOT NULL,
	`shift_id` text,
	`refund_method` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text,
	`actor_user_id` text,
	`approved_by` text,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`sale_id`) REFERENCES `sales`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`shift_id`) REFERENCES `pos_shifts`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sale_returns_store_id_uq` ON `sale_returns` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sale_returns_client_uq` ON `sale_returns` (`store_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`client_id` text NOT NULL,
	`line` text NOT NULL,
	`branch_id` text NOT NULL,
	`register_id` text,
	`shift_id` text,
	`device_id` text,
	`number` integer NOT NULL,
	`customer_id` text,
	`cashier_user_id` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`price_level` text DEFAULT 'retail' NOT NULL,
	`subtotal` integer NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`tendered` integer DEFAULT 0 NOT NULL,
	`change` integer DEFAULT 0 NOT NULL,
	`points_earned` integer DEFAULT 0 NOT NULL,
	`note` text,
	`sold_at` integer NOT NULL,
	`synced_at` integer NOT NULL,
	`needs_review` integer DEFAULT false NOT NULL,
	`review_notes` text,
	`approved_by` text,
	`source_type` text,
	`source_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`branch_id`) REFERENCES `branches`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`shift_id`) REFERENCES `pos_shifts`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`customer_id`) REFERENCES `customers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_store_id_uq` ON `sales` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_client_uq` ON `sales` (`store_id`,`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_number_uq` ON `sales` (`store_id`,`branch_id`,`number`);--> statement-breakpoint
CREATE INDEX `sales_sold_idx` ON `sales` (`store_id`,`sold_at`);--> statement-breakpoint
CREATE INDEX `sales_shift_idx` ON `sales` (`store_id`,`shift_id`);--> statement-breakpoint
CREATE INDEX `sales_customer_idx` ON `sales` (`store_id`,`customer_id`);--> statement-breakpoint
CREATE TABLE `staff_attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`branch_id` text,
	`in_at` integer NOT NULL,
	`out_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`branch_id`) REFERENCES `branches`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_attendance_client_uq` ON `staff_attendance` (`store_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `staff_attendance_user_idx` ON `staff_attendance` (`store_id`,`user_id`,`in_at`);--> statement-breakpoint
CREATE TABLE `sync_ops` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`client_id` text NOT NULL,
	`device_id` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_ops_client_uq` ON `sync_ops` (`store_id`,`client_id`);--> statement-breakpoint
ALTER TABLE `store_members` ADD `pin_hash` text;--> statement-breakpoint
ALTER TABLE `store_members` ADD `branch_ids` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `credit_limit` integer;--> statement-breakpoint
ALTER TABLE `customers` ADD `price_level` text DEFAULT 'retail' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `birth_date` text;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `pos_config` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- دفتر الزبون (دين/محفظة/نقاط) إلحاق فقط زي دفتر الحسابات: التصحيح بحركة عكسية. الحذف مسموح بس لما المتجر نفسه ينحذف.
CREATE TRIGGER `customer_ledger_no_update` BEFORE UPDATE ON `customer_ledger` BEGIN SELECT RAISE(ABORT, 'customer_ledger is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `customer_ledger_no_delete` BEFORE DELETE ON `customer_ledger` WHEN EXISTS (SELECT 1 FROM `stores` WHERE `id` = OLD.`store_id`) BEGIN SELECT RAISE(ABORT, 'customer_ledger is append-only'); END;
