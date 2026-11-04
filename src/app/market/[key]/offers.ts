import { t, type StoreScope } from "@/server/tenant";

/** أسماء العروض الفعّالة الحين (ضمن التاريخ) — الأسماء بس، بدون إعدادات داخلية */
export async function activePromotionNames(scope: StoreScope, now = Date.now()): Promise<string[]> {
  const rows = await scope.from(t.promotions);
  return rows.filter((r) => r.isActive && (!r.startsAt || r.startsAt.getTime() <= now) && (!r.endsAt || r.endsAt.getTime() >= now)).map((r) => r.name);
}
