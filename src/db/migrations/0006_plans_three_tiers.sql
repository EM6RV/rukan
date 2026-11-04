-- الباقات الثلاث النهائية: شهرية (250 د.ل)، ست شهور (650 د.ل)، سنوية (1250 د.ل).
-- تتطبق فقط على قاعدة فيها باقات 0005 (economy/yearly/yearly-pro)؛ القاعدة الجديدة تزرع الباقات من seed.
-- المتاجر تبقى مربوطة بنفس الباقة (نفس id)، فما يضيع أي اشتراك، وما نلمس تواريخ التجربة ولا نهاية الاشتراك.

-- إعدادات المنصة أول: باقة التجربة تتحول للمقابل الجديد (قبل ما نغيّر الـ slugs)
UPDATE `platform_settings` SET `value` = CASE `value`
    WHEN '"yearly"' THEN '"semiannual"'
    WHEN '"economy"' THEN '"monthly"'
    WHEN '"yearly-pro"' THEN '"yearly"'
    ELSE `value` END
  WHERE `key` = 'trial_plan_slug' AND EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'economy');--> statement-breakpoint
-- الاقتصادية ← شهرية 250 د.ل (نص المزايا)
UPDATE `plans` SET `name_ar` = 'شهرية', `description_ar` = 'نص المزايا: كل القوالب والكوبونات والتقارير', `billing_period` = 'monthly', `price` = 250000, `is_featured` = 0, `sort_order` = 1,
  `limits` = '{"maxProducts":200,"maxStaff":2,"allTemplates":true,"coupons":true,"reports":true,"customDomain":false,"pixels":false,"removeBranding":false}'
  WHERE `slug` = 'economy';--> statement-breakpoint
-- السنوية القديمة ← ست شهور 650 د.ل
UPDATE `plans` SET `name_ar` = 'ست شهور', `description_ar` = 'أغلب المزايا مع Pixels للإعلانات', `billing_period` = 'semiannual', `price` = 650000, `is_featured` = 0, `sort_order` = 2,
  `limits` = '{"maxProducts":1000,"maxStaff":5,"allTemplates":true,"coupons":true,"reports":true,"customDomain":false,"pixels":true,"removeBranding":false}'
  WHERE `slug` = 'yearly' AND EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'economy');--> statement-breakpoint
-- سنوية برو ← سنوية فل مزايا 1250 د.ل (المميزة)
UPDATE `plans` SET `name_ar` = 'سنوية', `description_ar` = 'فل مزايا: كل شي غير محدود، دومين خاص وPixels وبدون شعار رُكن', `billing_period` = 'yearly', `price` = 1250000, `is_featured` = 1, `sort_order` = 3,
  `limits` = '{"maxProducts":null,"maxStaff":null,"allTemplates":true,"coupons":true,"reports":true,"customDomain":true,"pixels":true,"removeBranding":true}'
  WHERE `slug` = 'yearly-pro';--> statement-breakpoint
-- الـ slugs (بالترتيب علشان ما يتعارضوا): yearly ← semiannual، yearly-pro ← yearly، economy ← monthly
UPDATE `plans` SET `slug` = 'semiannual' WHERE `slug` = 'yearly' AND `billing_period` = 'semiannual' AND NOT EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'semiannual');--> statement-breakpoint
UPDATE `plans` SET `slug` = 'yearly' WHERE `slug` = 'yearly-pro' AND NOT EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'yearly');--> statement-breakpoint
UPDATE `plans` SET `slug` = 'monthly' WHERE `slug` = 'economy' AND NOT EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'monthly');
