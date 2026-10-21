// صفوف جدول مقارنة الباقات + مجموعات المميزات في كروت الأسعار (مصدر واحد للاثنين).
// الأسماء الافتراضية هنا، والأدمن يقدر يغيّرها من «محتوى الموقع» (pricing.rows).
import type { DurationPerks, PlanLimits } from "@/db/schema/platform";

export type CompareValue = boolean | number | "unlimited" | string;
type PlanLike = { limits: PlanLimits; durationPerks: DurationPerks };

export type FeatureRow = {
  key: string; label: string; group: CompareGroup;
  /** المجموعة في كرت الباقة (لو null الصف يبان في الجدول بس) */
  card: CardGroup | null;
  value: (p: PlanLike) => CompareValue;
};

export const COMPARE_GROUPS = ["الكتالوج", "الطلبيات", "التوصيل", "التسويق", "التقارير", "الفريق", "الوحدات"] as const;
export type CompareGroup = (typeof COMPARE_GROUPS)[number];
export const CARD_GROUPS = ["المتجر", "الطلبيات", "التسويق", "التصميم"] as const;
export type CardGroup = (typeof CARD_GROUPS)[number];

const num = (n: number | null | undefined, missing: number | "unlimited" = "unlimited"): CompareValue => (n === undefined ? missing : n === null ? "unlimited" : n);
const designs = (p: PlanLike): CompareValue => {
  if ((p.limits.freeDesigns ?? 0) > 0) return `${p.limits.freeDesigns} في كل فترة`;
  const perk = Object.entries(p.durationPerks).find(([, v]) => (v?.freeDesigns ?? 0) > 0 || v?.note);
  return perk ? (perk[1]?.note || "مع مدة معينة") + (perk[0] === "m12" ? " (السنوي)" : "") : false;
};

export const FEATURE_ROWS: FeatureRow[] = [
  { key: "products", label: "عدد المنتجات", group: "الكتالوج", card: null, value: (p) => num(p.limits.maxProducts) },
  { key: "templates", label: "كل القوالب", group: "الكتالوج", card: "المتجر", value: (p) => p.limits.allTemplates },
  { key: "orders", label: "الطلبيات في الشهر", group: "الطلبيات", card: null, value: (p) => num(p.limits.maxOrdersPerMonth) },
  { key: "cod", label: "الدفع عند الاستلام", group: "الطلبيات", card: "الطلبيات", value: () => true },
  { key: "abandoned", label: "السلات المتروكة", group: "الطلبيات", card: "الطلبيات", value: (p) => p.limits.abandonedCarts === true },
  { key: "couriers", label: "المندوبين والكاش", group: "التوصيل", card: "الطلبيات", value: () => true },
  { key: "delivery", label: "أسعار التوصيل لكل مدينة", group: "التوصيل", card: null, value: () => true },
  { key: "coupons", label: "كوبونات الخصم", group: "التسويق", card: "التسويق", value: (p) => p.limits.coupons },
  { key: "pixels", label: "Meta و TikTok Pixel", group: "التسويق", card: "التسويق", value: (p) => p.limits.pixels },
  { key: "domain", label: "دومين خاص", group: "التسويق", card: "المتجر", value: (p) => p.limits.customDomain },
  { key: "branding", label: "بدون شعار رُكن", group: "التسويق", card: "المتجر", value: (p) => p.limits.removeBranding },
  { key: "designs", label: "تصميم مجاني (ريل أو لوجو)", group: "التسويق", card: "التصميم", value: designs },
  { key: "reports", label: "التقارير وتصدير Excel", group: "التقارير", card: "الطلبيات", value: (p) => p.limits.reports },
  { key: "advancedReports", label: "تقارير متقدمة", group: "التقارير", card: null, value: (p) => p.limits.advancedReports === true },
  { key: "analytics", label: "تحليلات الزيارات", group: "التقارير", card: null, value: (p) => p.limits.analytics === true },
  { key: "staff", label: "الموظفين (غير المالك)", group: "الفريق", card: null, value: (p) => num(p.limits.maxStaff) },
  { key: "customRoles", label: "صلاحيات مخصصة", group: "الفريق", card: null, value: (p) => p.limits.customRoles === true },
  { key: "warehouses", label: "المخازن المتعددة", group: "الوحدات", card: "المتجر", value: (p) => p.limits.modules?.warehouses === true },
  { key: "purchasing", label: "المشتريات والموردين", group: "الوحدات", card: "المتجر", value: (p) => p.limits.modules?.purchasing === true },
  { key: "accounting", label: "الحسابات", group: "الوحدات", card: "المتجر", value: (p) => p.limits.modules?.accounting === true },
];

export const DEFAULT_ROW_LABELS: Record<string, string> = Object.fromEntries(FEATURE_ROWS.map((r) => [r.key, r.label]));
/** اسم الصف بعد تعديل الأدمن */
export const rowLabel = (key: string, overrides?: Record<string, string>) => overrides?.[key]?.trim() || DEFAULT_ROW_LABELS[key] || key;
