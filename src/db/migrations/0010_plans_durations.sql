CREATE TABLE `addons` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name_ar` text NOT NULL,
	`kind` text NOT NULL,
	`units` integer DEFAULT 1 NOT NULL,
	`monthly_price` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `addons_slug_unique` ON `addons` (`slug`);--> statement-breakpoint
CREATE TABLE `phone_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`code_hash` text NOT NULL,
	`channel` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`verified_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `phone_verifications_phone_idx` ON `phone_verifications` (`phone`,`created_at`);--> statement-breakpoint
CREATE TABLE `store_addons` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`addon_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`addon_id`) REFERENCES `addons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_addons_uq` ON `store_addons` (`store_id`,`addon_id`);--> statement-breakpoint
ALTER TABLE `plans` ADD `prices` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` ADD `compare_prices` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` ADD `duration_perks` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` ADD `is_free` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `plan_notice` text;--> statement-breakpoint
ALTER TABLE `subscription_payments` ADD `addons` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone_verified_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `month_rank` integer;--> statement-breakpoint
-- ===== تحويل الباقات للنظام الجديد (بداية / نمو / احترافي + مجانية مخفية) =====
-- يتطبق بس على قاعدة فيها الباقات القديمة (monthly/semiannual/yearly بدون prices). القاعدة الجديدة تزرعها من seed.
-- المتاجر: شهرية ← نمو (شهر)، ست شهور ← نمو (6 شهور)، سنوية ← احترافي (سنة). نفس تاريخ الانتهاء، والمبلغ ما يتغيرش لين التجديد.

-- 1) الباقات القديمة المخفية من 0006 (starter/growth/pro) تاخذ أسماء legacy باش ما تتعارضش مع الجديدة
UPDATE `plans` SET `slug` = 'legacy-' || `slug` WHERE `slug` IN ('starter', 'growth', 'pro') AND `prices` = '{}';--> statement-breakpoint
-- 2) رسالة التحويل للمتاجر المشتركة (مش التجريبية) + مدة الاشتراك الصحيحة
UPDATE `stores` SET `plan_notice` = 'monthly', `billing_cycle` = 'monthly' WHERE `plan_id` = (SELECT `id` FROM `plans` WHERE `slug` = 'monthly' AND `prices` = '{}') AND `status` != 'trial';--> statement-breakpoint
UPDATE `stores` SET `plan_notice` = 'semiannual', `billing_cycle` = 'semiannual' WHERE `plan_id` = (SELECT `id` FROM `plans` WHERE `slug` = 'semiannual' AND `prices` = '{}') AND `status` != 'trial';--> statement-breakpoint
UPDATE `stores` SET `plan_notice` = 'yearly', `billing_cycle` = 'yearly' WHERE `plan_id` = (SELECT `id` FROM `plans` WHERE `slug` = 'yearly' AND `prices` = '{}') AND `status` != 'trial';--> statement-breakpoint
-- 3) المتاجر والدفعات على «ست شهور» تنتقل لباقة «شهرية» القديمة (اللي تولي «نمو»)
UPDATE `stores` SET `plan_id` = (SELECT `id` FROM `plans` WHERE `slug` = 'monthly' AND `prices` = '{}') WHERE `plan_id` = (SELECT `id` FROM `plans` WHERE `slug` = 'semiannual' AND `prices` = '{}') AND EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'monthly' AND `prices` = '{}');--> statement-breakpoint
UPDATE `subscription_payments` SET `plan_id` = (SELECT `id` FROM `plans` WHERE `slug` = 'monthly' AND `prices` = '{}') WHERE `plan_id` = (SELECT `id` FROM `plans` WHERE `slug` = 'semiannual' AND `prices` = '{}') AND EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'monthly' AND `prices` = '{}');--> statement-breakpoint
-- 4) باقة التجربة: تتبع المقابل الجديد
UPDATE `platform_settings` SET `value` = CASE `value` WHEN '"yearly"' THEN '"pro"' ELSE '"growth"' END WHERE `key` = 'trial_plan_slug' AND `value` IN ('"monthly"', '"semiannual"', '"yearly"') AND EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'monthly' AND `prices` = '{}');--> statement-breakpoint
-- 5) الباقات نفسها (نفس الـ id، فما يضيع أي ربط)
UPDATE `plans` SET `slug` = 'growth', `name_ar` = 'نمو', `description_ar` = 'للمتجر اللي يكبر: كوبونات وتقارير وسلات متروكة.', `prices` = '{"m1":220000,"m3":600000,"m6":1150000,"m12":2100000}', `compare_prices` = '{}', `duration_perks` = '{}', `is_featured` = 1, `is_free` = 0, `is_active` = 1, `sort_order` = 2, `limits` = '{"maxProducts":null,"maxStaff":3,"maxOrdersPerMonth":null,"maxWarehouses":1,"allTemplates":true,"coupons":true,"reports":true,"customDomain":false,"pixels":false,"removeBranding":true,"abandonedCarts":true,"bundles":false,"customRoles":false,"advancedReports":false,"analytics":false,"modules":{"warehouses":false,"purchasing":false,"accounting":false,"marketplaceInbox":false}}' WHERE `slug` = 'monthly' AND `prices` = '{}';--> statement-breakpoint
UPDATE `plans` SET `slug` = 'starter', `name_ar` = 'بداية', `description_ar` = 'لأول متجر: كل اللي تحتاجه باش تبدا تبيع.', `prices` = '{"m1":120000,"m3":330000,"m6":620000,"m12":1150000}', `compare_prices` = '{}', `duration_perks` = '{}', `is_featured` = 0, `is_free` = 0, `is_active` = 1, `sort_order` = 1, `limits` = '{"maxProducts":100,"maxStaff":1,"maxOrdersPerMonth":null,"maxWarehouses":1,"allTemplates":true,"coupons":false,"reports":false,"customDomain":false,"pixels":false,"removeBranding":false,"abandonedCarts":false,"bundles":false,"customRoles":false,"advancedReports":false,"analytics":false,"modules":{"warehouses":false,"purchasing":false,"accounting":false,"marketplaceInbox":false}}' WHERE `slug` = 'semiannual' AND `prices` = '{}';--> statement-breakpoint
UPDATE `plans` SET `slug` = 'pro', `name_ar` = 'احترافي', `description_ar` = 'كل شي غير محدود، دومين خاص، والمخازن والمشتريات والحسابات.', `prices` = '{"m1":null,"m3":null,"m6":1900000,"m12":3400000}', `compare_prices` = '{}', `duration_perks` = '{"m12":{"freeDesigns":1,"note":"ريل أو لوجو مجاناً"}}', `is_featured` = 0, `is_free` = 0, `is_active` = 1, `sort_order` = 3, `limits` = '{"maxProducts":null,"maxStaff":null,"maxOrdersPerMonth":null,"maxWarehouses":null,"allTemplates":true,"coupons":true,"reports":true,"customDomain":true,"pixels":true,"removeBranding":true,"abandonedCarts":true,"bundles":true,"customRoles":true,"advancedReports":true,"analytics":true,"modules":{"warehouses":true,"purchasing":true,"accounting":true,"marketplaceInbox":true}}' WHERE `slug` = 'yearly' AND `prices` = '{}';--> statement-breakpoint
-- 6) الباقة المجانية (مخفية: تبان بس لما الأدمن يفعّلها من الإعدادات)
INSERT INTO `plans` (`id`, `slug`, `name_ar`, `description_ar`, `billing_period`, `price`, `prices`, `compare_prices`, `duration_perks`, `is_free`, `is_featured`, `limits`, `sort_order`, `is_active`)
  SELECT lower(hex(randomblob(8))), 'free', 'مجانية', 'جرّب البيع أونلاين بدون ما تدفع.', 'monthly', 0, '{"m1":0}', '{}', '{}', 1, 0, '{"maxProducts":15,"maxStaff":1,"maxOrdersPerMonth":30,"maxWarehouses":1,"allTemplates":false,"coupons":false,"reports":false,"customDomain":false,"pixels":false,"removeBranding":false,"abandonedCarts":false,"bundles":false,"customRoles":false,"advancedReports":false,"analytics":false,"modules":{"warehouses":false,"purchasing":false,"accounting":false,"marketplaceInbox":false}}', 0, 1
  WHERE EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'growth') AND NOT EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'free');
