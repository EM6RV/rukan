import { unstable_cache } from "next/cache";
import { getDb } from "@/db";
import { getPlatformConfig } from "./settings";
import { listPlans } from "./plans";
import { DEFAULT_SITE_CONTENT } from "@/lib/site-content";
import { getSiteContent } from "./site-content";

/** وسم كاش الموقع التسويقي: يتفرغ عند أي تعديل في المحتوى أو الباقات أو إعدادات المنصة */
export const SITE_TAG = "site-content";

/** كل ما تحتاجه الصفحة التسويقية (محتوى + باقات فعّالة + واتساب الدعم) في كاش واحد */
const cachedMarketingData = unstable_cache(
  async () => {
    const db = getDb();
    const [content, plans, config] = await Promise.all([getSiteContent(db), listPlans(db), getPlatformConfig(db)]);
    return {
      content,
      plans: plans.filter((p) => p.isActive).map((p) => ({ id: p.id, slug: p.slug, name: p.nameAr, description: p.descriptionAr, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly, limits: p.limits })),
      trialDays: config.trialDays,
      supportWhatsapp: config.supportWhatsapp,
    };
  },
  ["marketing-data"],
  { tags: [SITE_TAG], revalidate: 300 },
);

/** لو القاعدة ما ردت (انقطاع/ما اتجهزتش بعد) الموقع يعرض المحتوى الافتراضي بدل ما يطيّح بخطأ 500 */
export async function getMarketingData() {
  try {
    return await cachedMarketingData();
  } catch (e) {
    console.error("marketing data unavailable, using defaults", e);
    return { content: DEFAULT_SITE_CONTENT, plans: [], trialDays: 14, supportWhatsapp: null as string | null };
  }
}
