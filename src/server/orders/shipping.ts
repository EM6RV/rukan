import { SHIPPING_COMPANY_IDS } from "@/lib/shipping-companies";
import { fail, ok, type Result } from "../catalog/result";
import { t, type StoreScope } from "../tenant";

/** قوالب روابط التتبع لكل شركة: https فقط ولازم تحتوي {n} (رقم الشحنة). فاضي = ما فيه رابط. */
export async function saveTrackingUrls(scope: StoreScope, input: unknown): Promise<Result> {
  if (!input || typeof input !== "object") return fail("فيه خانة ناقصة أو غلط. راجع الخانات وجرّب.");
  const out: Record<string, string> = {};
  for (const id of SHIPPING_COMPANY_IDS) {
    const raw = String((input as Record<string, unknown>)[id] ?? "").trim();
    if (!raw) continue;
    if (raw.length > 300 || !/^https:\/\/[^\s]+$/i.test(raw) || !raw.includes("{n}")) return fail("الرابط لازم يبدا بـ https:// ويحتوي {n} مكان رقم الشحنة.");
    out[id] = raw;
  }
  const rows = await scope.update(t.storeSettings, { shippingTrackingUrls: out });
  return rows.length ? ok(undefined) : fail("ما قدرنا نحفظ. حدّث الصفحة.");
}
