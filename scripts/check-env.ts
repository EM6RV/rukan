// يفحص إعدادات الإنتاج قبل النشر: NODE_ENV=production STRICT_PRODUCTION=1 pnpm check:env
import { getEnv } from "../src/lib/env";

const env = getEnv(); // يرمي خطأ بالمشاكل لو الإعداد غير آمن
const warn: string[] = [];
if (env.STORAGE_DRIVER === "turso") warn.push("الصور تتخزن داخل قاعدة Turso (STORAGE_DRIVER=turso). مناسب للبداية؛ مع نمو الصور فكّر في R2.");
if (!env.ADMIN_PHONE || !env.ADMIN_PASSWORD) warn.push("ADMIN_PHONE/ADMIN_PASSWORD غير موجودين: ما حيتنشأ حساب أدمن (عادي لو أنشأته من قبل).");
if (!env.CUSTOM_DOMAIN_TARGET) warn.push(`CUSTOM_DOMAIN_TARGET غير محدد: الدومينات الخاصة حتتوجه لـ cname.${env.ROOT_DOMAIN} (لازم تنشئ هذا السجل) — أو حدد هدفاً مثل your-service.onrender.com.`);
console.log("✓ الإعدادات سليمة للإنتاج");
console.log(`  APP_URL=${env.APP_URL}  ROOT_DOMAIN=${env.ROOT_DOMAIN}  STORAGE_DRIVER=${env.STORAGE_DRIVER}  TRUSTED_PROXY_HOPS=${env.TRUSTED_PROXY_HOPS}`);
for (const w of warn) console.log(`! ${w}`);
