CREATE TABLE `cash_closings` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`account_id` text NOT NULL,
	`expected` integer NOT NULL,
	`actual` integer NOT NULL,
	`difference` integer NOT NULL,
	`note` text,
	`actor_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`account_id`) REFERENCES `fin_accounts`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_store_id_uq` ON `expense_categories` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_name_uq` ON `expense_categories` (`store_id`,`name`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`category_id` text,
	`account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text,
	`receipt_media_id` text,
	`spent_at` integer NOT NULL,
	`ledger_entry_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`category_id`) REFERENCES `expense_categories`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`account_id`) REFERENCES `fin_accounts`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`receipt_media_id`) REFERENCES `media`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_store_id_uq` ON `expenses` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`store_id`,`spent_at`);--> statement-breakpoint
CREATE TABLE `fin_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fin_accounts_store_id_uq` ON `fin_accounts` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `fin_accounts_name_uq` ON `fin_accounts` (`store_id`,`name`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`kind` text NOT NULL,
	`ref_type` text,
	`ref_id` text,
	`group_id` text,
	`reverses_id` text,
	`memo` text,
	`actor_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`account_id`) REFERENCES `fin_accounts`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_store_id_uq` ON `ledger_entries` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_reverses_uq` ON `ledger_entries` (`store_id`,`reverses_id`);--> statement-breakpoint
CREATE INDEX `ledger_account_idx` ON `ledger_entries` (`store_id`,`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `purchase_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`number` integer NOT NULL,
	`supplier_id` text NOT NULL,
	`warehouse_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`supplier_id`) REFERENCES `suppliers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoices_store_id_uq` ON `purchase_invoices` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoices_number_uq` ON `purchase_invoices` (`store_id`,`number`);--> statement-breakpoint
CREATE TABLE `purchase_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`received_quantity` integer DEFAULT 0 NOT NULL,
	`unit_cost` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`invoice_id`) REFERENCES `purchase_invoices`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_items_store_id_uq` ON `purchase_items` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `purchase_items_invoice_idx` ON `purchase_items` (`store_id`,`invoice_id`);--> statement-breakpoint
CREATE TABLE `receivables` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text,
	`amount` integer NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`due_date` integer,
	`note` text,
	`order_id` text,
	`created_at` integer NOT NULL,
	`reminded_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receivables_store_id_uq` ON `receivables` (`store_id`,`id`);--> statement-breakpoint
CREATE TABLE `stock_transfer_items` (
	`store_id` text NOT NULL,
	`transfer_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`transfer_id`, `variant_id`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`transfer_id`) REFERENCES `stock_transfers`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stock_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`number` integer NOT NULL,
	`from_warehouse_id` text NOT NULL,
	`to_warehouse_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`from_warehouse_id`) REFERENCES `warehouses`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`to_warehouse_id`) REFERENCES `warehouses`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_transfers_store_id_uq` ON `stock_transfers` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `stock_transfers_number_uq` ON `stock_transfers` (`store_id`,`number`);--> statement-breakpoint
CREATE TABLE `stocktake_items` (
	`store_id` text NOT NULL,
	`stocktake_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`expected` integer NOT NULL,
	`counted` integer,
	PRIMARY KEY(`stocktake_id`, `variant_id`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`stocktake_id`) REFERENCES `stocktakes`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stocktakes` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`lock_warehouse` integer DEFAULT false NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`warehouse_id`) REFERENCES `warehouses`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stocktakes_store_id_uq` ON `stocktakes` (`store_id`,`id`);--> statement-breakpoint
CREATE TABLE `supplier_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`account_id` text,
	`amount` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`supplier_id`) REFERENCES `suppliers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`account_id`) REFERENCES `fin_accounts`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `supplier_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`warehouse_id` text,
	`quantity` integer NOT NULL,
	`unit_cost` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`supplier_id`) REFERENCES `suppliers`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`city` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_store_id_uq` ON `suppliers` (`store_id`,`id`);--> statement-breakpoint
CREATE TABLE `warehouse_stock` (
	`store_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`warehouse_id`, `variant_id`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`warehouse_id`) REFERENCES `warehouses`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`,`variant_id`) REFERENCES `product_variants`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`is_locked` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `warehouses_store_id_uq` ON `warehouses` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `warehouses_name_uq` ON `warehouses` (`store_id`,`name`);--> statement-breakpoint
ALTER TABLE `orders` ADD `warehouse_id` text;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `warehouse_id` text;--> statement-breakpoint
CREATE TRIGGER `ledger_entries_no_update` BEFORE UPDATE ON `ledger_entries` BEGIN SELECT RAISE(ABORT, 'ledger_entries is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `ledger_entries_no_delete` BEFORE DELETE ON `ledger_entries` WHEN EXISTS (SELECT 1 FROM `stores` WHERE `id` = OLD.`store_id`) BEGIN SELECT RAISE(ABORT, 'ledger_entries is append-only'); END;
