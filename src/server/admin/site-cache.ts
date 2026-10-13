import { unstable_cache } from "next/cache";
import { getDb } from "@/db";
import { getPlatformConfig } from "./settings";
import { listPlans } from "./plans";
import { getSiteContent } from "./site-content";

/** وسم كاش الموقع التسويقي: يتفرغ عند أي تعديل في المحتوى أو الباقات أو إعدادات المنصة */
export const SITE_TAG = "site-content";

/** كل ما تحتاجه الصفحة التسويقية (محتوى + باقات فعّالة + واتساب الدعم) في كاش واحد */
export const getMarketingData = unstable_cache(
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
