ALTER TABLE `sales` ADD `receipt_no` text;--> statement-breakpoint
CREATE INDEX `sales_receipt_idx` ON `sales` (`store_id`,`receipt_no`);