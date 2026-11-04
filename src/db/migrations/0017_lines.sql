CREATE TABLE `line_bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`name_ar` text NOT NULL,
	`lines` text NOT NULL,
	`discount_percent` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `line_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`line` text NOT NULL,
	`plan_id` text,
	`billing_cycle` text DEFAULT 'monthly' NOT NULL,
	`status` text DEFAULT 'trial' NOT NULL,
	`trial_ends_at` integer,
	`current_period_end` integer,
	`setup` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `line_subs_store_line_uq` ON `line_subscriptions` (`store_id`,`line`);--> statement-breakpoint
CREATE INDEX `line_subs_line_status_idx` ON `line_subscriptions` (`line`,`status`);--> statement-breakpoint
DROP INDEX `store_addons_uq`;--> statement-breakpoint
ALTER TABLE `store_addons` ADD `line` text DEFAULT 'store' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `store_addons_line_uq` ON `store_addons` (`store_id`,`line`,`addon_id`);--> statement-breakpoint
ALTER TABLE `plans` ADD `line` text DEFAULT 'store' NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `line_beta` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_payments` ADD `line` text DEFAULT 'store' NOT NULL;--> statement-breakpoint
-- منظومات رُكن: اشتراك كل متجر موجود يتنقل لسطر line='store' بنفس الباقة والمدة والحالة والتواريخ (أعمدة stores تبقى للتوافق)
INSERT INTO `line_subscriptions` (`id`, `store_id`, `line`, `plan_id`, `billing_cycle`, `status`, `trial_ends_at`, `current_period_end`, `setup`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(8))), `id`, 'store', `plan_id`, `billing_cycle`, `status`, `trial_ends_at`, `current_period_end`,
  CASE WHEN `onboarded_at` IS NOT NULL THEN '{"done":true}' ELSE '{}' END, `created_at`, `updated_at`
FROM `stores`
WHERE NOT EXISTS (SELECT 1 FROM `line_subscriptions` ls WHERE ls.`store_id` = `stores`.`id` AND ls.`line` = 'store');
