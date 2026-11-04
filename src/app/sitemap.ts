import type { MetadataRoute } from "next";
import { STORE_TEMPLATES } from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { getMarketingData } from "@/server/admin/site-cache";

export const dynamic = "force-dynamic";

/** خريطة موقع رُكن التسويقي (الرئيسية + صفحات الأنشطة + معاينات القوالب). المتاجر لها sitemap خاص بها. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getEnv().APP_URL.replace(/\/$/, "");
  const { content } = await getMarketingData();
  return [
    { url: `${base}/`, priority: 1 },
    ...content.systems.items.map((x) => ({ url: `${base}/systems/${x.slug}`, priority: 0.8 })),
    ...content.niches.items.map((n) => ({ url: `${base}/for/${n.slug}`, priority: 0.8 })),
    ...STORE_TEMPLATES.map((k) => ({ url: `${base}/templates/${k}`, priority: 0.6 })),
    { url: `${base}/register`, priority: 0.7 },
  ];
}
