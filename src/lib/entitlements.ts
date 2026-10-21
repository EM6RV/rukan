// المميزات والحدود حسب الباقة: مصدر وحيد لـ «هل المتجر يقدر يستعمل الميزة؟» (سيرفر وواجهة).
// الفحص الحقيقي يصير في السيرفر (canUse في كل action/route/page)، والواجهة تستعمل نفس الدالة باش تعرض القفل.
import type { AddonKind, DurationPerks, PlanLimits } from "@/db/schema/platform";
import { durationOf, type BillingPeriod } from "./billing";

export const FEATURES = [
  "coupons", "reports", "abandonedCarts", "pixels", "customDomain", "removeBranding", "allTemplates",
  "bundles", "customRoles", "advancedReports", "analytics",
] as const;
export type Feature = (typeof FEATURES)[number];

/** اسم الميزة وفايدتها (لنافذة «رقّي باقتك» وجدول المقارنة) */
export const FEATURE_INFO: Record<Feature, { title: string; benefit: string }> = {
  coupons: { title: "الكوبونات", benefit: "أكواد خصم بنسبة أو مبلغ، بحد أدنى وتاريخ انتهاء، تشجّع الزبون يكمّل الطلب." },
  reports: { title: "التقارير", benefit: "مبيعاتك وأرباحك وأكثر المنتجات مبيعاً، مع تصدير Excel." },
  abandonedCarts: { title: "السلات المتروكة", benefit: "شوف الزباين اللي ما كملوش الطلب، وذكّرهم على واتساب برسالة جاهزة." },
  pixels: { title: "Meta Pixel و TikTok Pixel", benefit: "اربط إعلاناتك وقيس شن جابتلك من طلبيات." },
  customDomain: { title: "دومين خاص", benefit: "متجرك على اسمك (مثلاً shop.ly) بدل رابط رُكن." },
  removeBranding: { title: "بدون شعار رُكن", benefit: "متجرك يبان باسمك بس، بدون «مدعوم من رُكن» تحت." },
  allTemplates: { title: "كل القوالب", benefit: "اختار أي قالب يناسب نشاطك وغيّره وقت ما تبي." },
  bundles: { title: "الباقات المجمعة", benefit: "بيع منتجات مع بعض بسعر خاص، والمخزون ينقص من كل منتج." },
  customRoles: { title: "صلاحيات مخصصة", benefit: "اختار صلاحيات كل موظف وحدة وحدة." },
  advancedReports: { title: "تقارير متقدمة", benefit: "تحليل أعمق للمبيعات والأرباح والمرتجعات." },
  analytics: { title: "تحليلات المتجر", benefit: "الزيارات ومعدل التحويل ومصادر الزباين (إنستا، تيك توك، واتساب)." },
};

/** المتجر يقدر يستعمل الميزة؟ (غير موجودة في الباقة = لا) */
export const canUse = (limits: Partial<Pick<PlanLimits, Feature>>, feature: Feature): boolean => limits[feature] === true;

type AddonLine = { kind: AddonKind; units: number; quantity: number };
const add = (base: number | null | undefined, extra: number, missing: number | null) => {
  const b = base === undefined ? missing : base;
  return b === null ? null : b + extra;
};

/**
 * الحدود الفعلية للمتجر = حدود الباقة + الإضافات المدفوعة + ميزة المدة (مثلاً تصميم مجاني في السنوية).
 * الإضافة تزيد العدد (موظف/مخزن/منتجات) أو تفتح الدومين الخاص.
 */
export function effectiveLimits(base: PlanLimits, o: { cycle?: BillingPeriod | null; perks?: DurationPerks | null; addons?: AddonLine[] } = {}): PlanLimits {
  const sum = (k: AddonKind) => (o.addons ?? []).filter((a) => a.kind === k).reduce((s, a) => s + a.units * Math.max(0, a.quantity), 0);
  const perk = o.cycle && o.perks ? o.perks[durationOf(o.cycle).key] : undefined;
  return {
    ...base,
    maxStaff: add(base.maxStaff, sum("staff"), null),
    maxProducts: add(base.maxProducts, sum("products"), null),
    maxWarehouses: add(base.maxWarehouses, sum("warehouse"), 1),
    customDomain: base.customDomain || sum("custom_domain") > 0,
    freeDesigns: (base.freeDesigns ?? 0) + (perk?.freeDesigns ?? 0),
  };
}

/** أرخص باقة ظاهرة فيها الميزة (لنص «متاحة في باقة X») */
export function cheapestPlanWith<T extends { nameAr: string; limits: PlanLimits; sortOrder: number }>(plans: T[], feature: Feature): T | null {
  return [...plans].sort((a, b) => a.sortOrder - b.sortOrder).find((p) => canUse(p.limits, feature)) ?? null;
}
