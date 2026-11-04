ALTER TABLE `plans` ADD `billing_period` text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` ADD `price` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` ADD `is_featured` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- الباقات القديمة: السعر الشهري يصير هو `price` (مدتها شهرية)، قبل ما نحذف العمودين
UPDATE `plans` SET `price` = `price_monthly`, `billing_period` = 'monthly';--> statement-breakpoint
ALTER TABLE `plans` DROP COLUMN `price_monthly`;--> statement-breakpoint
ALTER TABLE `plans` DROP COLUMN `price_yearly`;--> statement-breakpoint
-- الباقات الثلاث الجديدة (نزرعها هنا بس لو فيه باقات قديمة، يعني قاعدة شغالة. القاعدة الجديدة تزرعها seed)
INSERT OR IGNORE INTO `plans` (`id`, `slug`, `name_ar`, `description_ar`, `billing_period`, `price`, `is_featured`, `limits`, `sort_order`, `is_active`)
SELECT lower(hex(randomblob(8))), 'economy', 'اقتصادية', 'للبداية: متجر بسيط بسعر شهري', 'monthly', 100000, 0,
  '{"maxProducts":50,"maxStaff":1,"allTemplates":false,"coupons":false,"reports":false,"customDomain":false,"pixels":false,"removeBranding":false}', 1, 1
WHERE EXISTS (SELECT 1 FROM `plans` WHERE `slug` IN ('starter', 'growth', 'pro'));--> statement-breakpoint
INSERT OR IGNORE INTO `plans` (`id`, `slug`, `name_ar`, `description_ar`, `billing_period`, `price`, `is_featured`, `limits`, `sort_order`, `is_active`)
SELECT lower(hex(randomblob(8))), 'yearly', 'سنوية', 'كل القوالب والكوبونات والتقارير', 'yearly', 500000, 0,
  '{"maxProducts":500,"maxStaff":3,"allTemplates":true,"coupons":true,"reports":true,"customDomain":false,"pixels":false,"removeBranding":false}', 2, 1
WHERE EXISTS (SELECT 1 FROM `plans` WHERE `slug` IN ('starter', 'growth', 'pro'));--> statement-breakpoint
INSERT OR IGNORE INTO `plans` (`id`, `slug`, `name_ar`, `description_ar`, `billing_period`, `price`, `is_featured`, `limits`, `sort_order`, `is_active`)
SELECT lower(hex(randomblob(8))), 'yearly-pro', 'سنوية برو', 'كل شي غير محدود، دومين خاص وPixels وبدون شعار رُكن', 'yearly', 800000, 1,
  '{"maxProducts":null,"maxStaff":null,"allTemplates":true,"coupons":true,"reports":true,"customDomain":true,"pixels":true,"removeBranding":true}', 3, 1
WHERE EXISTS (SELECT 1 FROM `plans` WHERE `slug` IN ('starter', 'growth', 'pro'));--> statement-breakpoint
-- نقل المتاجر المشتركة للباقات الجديدة (ما نلمس تاريخ التجربة ولا نهاية الاشتراك، فما يضيع أي اشتراك)
UPDATE `stores` SET `plan_id` = (SELECT `id` FROM `plans` WHERE `slug` = 'economy')
  WHERE `plan_id` = (SELECT `id` FROM `plans` WHERE `slug` = 'starter');--> statement-breakpoint
UPDATE `stores` SET `plan_id` = (SELECT `id` FROM `plans` WHERE `slug` = 'yearly')
  WHERE `plan_id` = (SELECT `id` FROM `plans` WHERE `slug` = 'growth');--> statement-breakpoint
UPDATE `stores` SET `plan_id` = (SELECT `id` FROM `plans` WHERE `slug` = 'yearly-pro')
  WHERE `plan_id` = (SELECT `id` FROM `plans` WHERE `slug` = 'pro');--> statement-breakpoint
-- الباقات القديمة تنخبّى (سجل الدفعات القديمة يحتفظ بأسمائها)
UPDATE `plans` SET `is_active` = 0, `sort_order` = `sort_order` + 10 WHERE `slug` IN ('starter', 'growth', 'pro');--> statement-breakpoint
-- إعدادات المنصة: باقة التجربة تتحول للمقابل الجديد، والتجربة الافتراضية 3 أيام (لو الأدمن ما غيّرها عن 14)
UPDATE `platform_settings` SET `value` = '"economy"' WHERE `key` = 'trial_plan_slug' AND `value` = '"starter"' AND EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'economy');--> statement-breakpoint
UPDATE `platform_settings` SET `value` = '"yearly"' WHERE `key` = 'trial_plan_slug' AND `value` = '"growth"' AND EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'yearly');--> statement-breakpoint
UPDATE `platform_settings` SET `value` = '"yearly-pro"' WHERE `key` = 'trial_plan_slug' AND `value` = '"pro"' AND EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'yearly-pro');--> statement-breakpoint
UPDATE `platform_settings` SET `value` = '3' WHERE `key` = 'trial_days' AND `value` = '14' AND EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'yearly');
