// الباقات الافتراضية (نظام المدد): بداية / نمو / احترافي + المجانية (مخفية لين يفعّلها الأدمن).
// الأسعار بالدرهم (1 د.ل = 1000). كل شي يتعدل بعدين من /admin/plans: هذي قيم البداية للـ seed والـ migration بس.
import type { DurationPerks, PlanLimits, PlanPrices } from "@/db/schema/platform";

export type CatalogPlan = {
  slug: string; nameAr: string; descriptionAr: string; prices: PlanPrices; durationPerks: DurationPerks;
  isFeatured: boolean; isFree: boolean; sortOrder: number; limits: PlanLimits;
};

const d = (n: number) => n * 1000;

export const STARTER_LIMITS: PlanLimits = {
  maxProducts: 100, maxStaff: 1, maxOrdersPerMonth: null, maxWarehouses: 1,
  allTemplates: true, coupons: false, reports: false, customDomain: false, pixels: false, removeBranding: false,
  abandonedCarts: false, bundles: false, customRoles: false, advancedReports: false, analytics: false,
  modules: { warehouses: false, purchasing: false, accounting: false, marketplaceInbox: false },
};

export const GROWTH_LIMITS: PlanLimits = {
  maxProducts: null, maxStaff: 3, maxOrdersPerMonth: null, maxWarehouses: 1,
  allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: false, removeBranding: true,
  abandonedCarts: true, bundles: false, customRoles: false, advancedReports: false, analytics: false,
  modules: { warehouses: false, purchasing: false, accounting: false, marketplaceInbox: false },
};

export const PRO_LIMITS: PlanLimits = {
  maxProducts: null, maxStaff: null, maxOrdersPerMonth: null, maxWarehouses: null,
  allTemplates: true, coupons: true, reports: true, customDomain: true, pixels: true, removeBranding: true,
  abandonedCarts: true, bundles: true, customRoles: true, advancedReports: true, analytics: true,
  modules: { warehouses: true, purchasing: true, accounting: true, marketplaceInbox: true },
};

export const FREE_LIMITS: PlanLimits = {
  maxProducts: 15, maxStaff: 1, maxOrdersPerMonth: 30, maxWarehouses: 1,
  allTemplates: false, coupons: false, reports: false, customDomain: false, pixels: false, removeBranding: false,
  abandonedCarts: false, bundles: false, customRoles: false, advancedReports: false, analytics: false,
  modules: { warehouses: false, purchasing: false, accounting: false, marketplaceInbox: false },
};

export const DEFAULT_PLANS: CatalogPlan[] = [
  { slug: "starter", nameAr: "بداية", descriptionAr: "لأول متجر: كل اللي تحتاجه باش تبدا تبيع.", prices: { m1: d(120), m3: d(330), m6: d(620), m12: d(1150) }, durationPerks: {}, isFeatured: false, isFree: false, sortOrder: 1, limits: STARTER_LIMITS },
  { slug: "growth", nameAr: "نمو", descriptionAr: "للمتجر اللي يكبر: كوبونات وتقارير وسلات متروكة.", prices: { m1: d(220), m3: d(600), m6: d(1150), m12: d(2100) }, durationPerks: {}, isFeatured: true, isFree: false, sortOrder: 2, limits: GROWTH_LIMITS },
  { slug: "pro", nameAr: "احترافي", descriptionAr: "كل شي غير محدود، دومين خاص، والمخازن والمشتريات والحسابات.", prices: { m1: null, m3: null, m6: d(1900), m12: d(3400) }, durationPerks: { m12: { freeDesigns: 1, note: "ريل أو لوجو مجاناً" } }, isFeatured: false, isFree: false, sortOrder: 3, limits: PRO_LIMITS },
  { slug: "free", nameAr: "مجانية", descriptionAr: "جرّب البيع أونلاين بدون ما تدفع.", prices: { m1: 0, m3: null, m6: null, m12: null }, durationPerks: {}, isFeatured: false, isFree: true, sortOrder: 0, limits: FREE_LIMITS },
];

/** الإضافات الافتراضية: سعر شهري لكل وحدة (بالدرهم) */
export const DEFAULT_ADDONS = [
  { slug: "extra-staff", nameAr: "موظف إضافي", kind: "staff" as const, units: 1, monthlyPrice: d(20), sortOrder: 1 },
  { slug: "extra-warehouse", nameAr: "مخزن إضافي", kind: "warehouse" as const, units: 1, monthlyPrice: d(30), sortOrder: 2 },
  { slug: "products-pack", nameAr: "حزمة 500 منتج", kind: "products" as const, units: 500, monthlyPrice: d(25), sortOrder: 3 },
  { slug: "custom-domain", nameAr: "دومين خاص", kind: "custom_domain" as const, units: 1, monthlyPrice: d(40), sortOrder: 4 },
];
