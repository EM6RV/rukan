import { unstable_cache } from "next/cache";
import { getDb } from "@/db";
import { getPlatformConfig, type Promo } from "./settings";
import type { PricingPlan } from "./plans";
import { publicPlans } from "./plans";
import { DEFAULT_SITE_CONTENT } from "@/lib/site-content";
import { getSiteContent } from "./site-content";

/** وسم كاش الموقع التسويقي: يتفرغ عند أي تعديل في المحتوى أو الباقات أو إعدادات المنصة */
export const SITE_TAG = "site-content";

/** كل ما تحتاجه الصفحة التسويقية (محتوى + باقات فعّالة + واتساب الدعم) في كاش واحد */
const cachedMarketingData = unstable_cache(
  async () => {
    const db = getDb();
    const [content, config] = await Promise.all([getSiteContent(db), getPlatformConfig(db)]);
    return {
      content,
      plans: await publicPlans(db, config.freePlanEnabled),
      linePlans: { market: await publicPlans(db, false, "market"), lounge: await publicPlans(db, false, "lounge"), gym: await publicPlans(db, false, "gym") },
      trialDays: config.trialDays,
      supportWhatsapp: config.supportWhatsapp,
      startMode: config.startMode,
      promo: config.promo,
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
    return { content: DEFAULT_SITE_CONTENT, plans: [] as PricingPlan[], linePlans: { market: [] as PricingPlan[], lounge: [] as PricingPlan[], gym: [] as PricingPlan[] }, trialDays: 3, supportWhatsapp: null as string | null, startMode: "trial" as const, promo: { enabled: false, text: "", linkLabel: "", endsAt: null } as Promo };
  }
}
