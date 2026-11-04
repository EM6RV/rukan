// الباقات الافتراضية (نظام المدد): بداية / نمو / احترافي + المجانية (مخفية لين يفعّلها الأدمن).
// الأسعار بالدرهم (1 د.ل = 1000). كل شي يتعدل بعدين من /admin/plans: هذي قيم البداية للـ seed والـ migration بس.
import type { DurationPerks, PlanLimits, PlanPrices } from "@/db/schema/platform";
import type { ProductLine } from "./product-lines";

export type CatalogPlan = {
  slug: string; line?: ProductLine; nameAr: string; descriptionAr: string; prices: PlanPrices; durationPerks: DurationPerks;
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

// ===== باقات المنظومات (ماركت/بلاي/فِت): أساسية/نمو/احترافية =====
// مميزات المتجر الأونلاين كلها مقفولة فيها (تجي من اشتراك «store» لو موجود). الأسعار مبدئية وتتعدل من الأدمن.

/** مميزات المتجر الأونلاين مقفولة (لباقات المنظومات الثانية) */
export const NO_STORE_FEATURES = {
  maxProducts: null, allTemplates: false, coupons: false, customDomain: false, pixels: false, removeBranding: false,
  abandonedCarts: false, bundles: false, analytics: false,
} as const satisfies Partial<PlanLimits>;
/** حدود النشاط اللي ما عندوش متجر أونلاين (الموارد المشتركة تتحسب بعدين من منظوماته) */
export const NO_STORE_LIMITS: PlanLimits = {
  ...NO_STORE_FEATURES, maxStaff: 1, maxWarehouses: 1, reports: false, customRoles: false, advancedReports: false,
  modules: { warehouses: false, purchasing: false, accounting: false, marketplaceInbox: false },
};
const mods = (o: { warehouses?: boolean; purchasing?: boolean; accounting?: boolean }) => ({ warehouses: false, purchasing: false, accounting: false, marketplaceInbox: false, ...o });

export const MARKET_BASIC: PlanLimits = {
  ...NO_STORE_FEATURES, maxStaff: 2, maxBranches: 1, maxRegisters: 1, maxWarehouses: 1, reports: true, customRoles: false, advancedReports: false,
  debtBook: true, modules: mods({ purchasing: true }),
};
export const MARKET_GROWTH: PlanLimits = {
  ...MARKET_BASIC, maxStaff: 6, maxRegisters: 3, wholesale: true, batches: true, promotions: true, cameraScan: true,
  modules: mods({ purchasing: true, warehouses: true, accounting: true }),
};
export const MARKET_PRO: PlanLimits = {
  ...MARKET_GROWTH, maxStaff: null, maxBranches: null, maxRegisters: null, maxWarehouses: null, onlineOrders: true, hardware: true, advancedReports: true, customRoles: true,
  modules: mods({ purchasing: true, warehouses: true, accounting: true }),
};

export const LOUNGE_BASIC: PlanLimits = {
  ...NO_STORE_FEATURES, maxStaff: 2, maxBranches: 1, maxStations: 6, maxWarehouses: 1, reports: true, customRoles: false, advancedReports: false,
  modules: mods({}),
};
export const LOUNGE_GROWTH: PlanLimits = { ...LOUNGE_BASIC, maxStaff: 5, maxStations: 15, bookings: true, hourPacks: true, wallScreen: true, modules: mods({ accounting: true }) };
export const LOUNGE_PRO: PlanLimits = {
  ...LOUNGE_GROWTH, maxStaff: null, maxBranches: null, maxStations: null, tournaments: true, powerControl: true, advancedReports: true, customRoles: true,
  modules: mods({ accounting: true, warehouses: true }),
};

export const GYM_BASIC: PlanLimits = {
  ...NO_STORE_FEATURES, maxStaff: 3, maxBranches: 1, maxMembers: 150, maxWarehouses: 1, reports: true, customRoles: false, advancedReports: false,
  modules: mods({}),
};
export const GYM_GROWTH: PlanLimits = { ...GYM_BASIC, maxStaff: 8, maxMembers: 600, classes: true, trainers: true, installments: true, memberPortal: true, modules: mods({ accounting: true }) };
export const GYM_PRO: PlanLimits = {
  ...GYM_GROWTH, maxStaff: null, maxBranches: null, maxMembers: null, kiosk: true, progress: true, advancedMessages: true, advancedReports: true, customRoles: true,
  modules: mods({ accounting: true, warehouses: true }),
};

const tiers = (line: ProductLine, order: number, t: [PlanLimits, PlanLimits, PlanLimits], p: [number, number, number, number][], desc: [string, string, string]): CatalogPlan[] =>
  (["basic", "growth", "pro"] as const).map((k, i) => ({
    slug: `${line}-${k}`, line, nameAr: ["أساسية", "نمو", "احترافية"][i]!, descriptionAr: desc[i]!,
    prices: { m1: d(p[i]![0]), m3: d(p[i]![1]), m6: d(p[i]![2]), m12: d(p[i]![3]) }, durationPerks: {},
    isFeatured: k === "growth", isFree: false, sortOrder: order + i, limits: t[i]!,
  }));

export const LINE_PLANS: CatalogPlan[] = [
  ...tiers("market", 10, [MARKET_BASIC, MARKET_GROWTH, MARKET_PRO], [[150, 420, 800, 1500], [250, 700, 1350, 2500], [400, 1100, 2100, 3900]], [
    "كاشير واحد ودفتر الدين وتقارير أساسية: كل اللي يحتاجه المحل الصغير.",
    "3 كاشيرات، الجملة، الصلاحية والدفعات، العروض والجرد بالكاميرا.",
    "غير محدود: فروع، طلبات أونلاين، تقارير متقدمة، الطابعة والميزان.",
  ]),
  ...tiers("lounge", 20, [LOUNGE_BASIC, LOUNGE_GROWTH, LOUNGE_PRO], [[100, 280, 540, 1000], [180, 500, 960, 1800], [300, 840, 1600, 3000]], [
    "حتى 6 أجهزة، بالساعة وبالماتش، والبار.",
    "حتى 15 جهاز، الحجوزات، باقات الساعات وشاشة الحائط.",
    "غير محدود: البطولات، الفروع، وتقارير متقدمة.",
  ]),
  ...tiers("gym", 30, [GYM_BASIC, GYM_GROWTH, GYM_PRO], [[120, 330, 640, 1200], [220, 600, 1150, 2200], [380, 1050, 2000, 3800]], [
    "حتى 150 عضو، الدخول بالـ QR، الاشتراكات والتجميد.",
    "حتى 600 عضو، الحصص، المدربين، الأقساط وصفحة العضو.",
    "غير محدود: الفروع، الكشك، القياسات والبرامج، ورسائل متقدمة.",
  ]),
];

/** الإضافات الافتراضية: سعر شهري لكل وحدة (بالدرهم) */
export const DEFAULT_ADDONS = [
  { slug: "extra-staff", nameAr: "موظف إضافي", kind: "staff" as const, units: 1, monthlyPrice: d(20), sortOrder: 1 },
  { slug: "extra-warehouse", nameAr: "مخزن إضافي", kind: "warehouse" as const, units: 1, monthlyPrice: d(30), sortOrder: 2 },
  { slug: "products-pack", nameAr: "حزمة 500 منتج", kind: "products" as const, units: 500, monthlyPrice: d(25), sortOrder: 3 },
  { slug: "custom-domain", nameAr: "دومين خاص", kind: "custom_domain" as const, units: 1, monthlyPrice: d(40), sortOrder: 4 },
  { slug: "extra-branch", nameAr: "فرع إضافي", kind: "branch" as const, units: 1, monthlyPrice: d(60), sortOrder: 5 },
  { slug: "extra-register", nameAr: "كاشير إضافي", kind: "register" as const, units: 1, monthlyPrice: d(30), sortOrder: 6 },
  { slug: "station-pack", nameAr: "5 أجهزة إضافية", kind: "station_pack" as const, units: 5, monthlyPrice: d(40), sortOrder: 7 },
  { slug: "member-pack", nameAr: "100 عضو إضافي", kind: "member_pack" as const, units: 100, monthlyPrice: d(40), sortOrder: 8 },
];
