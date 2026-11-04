// خطوط المنتجات (المنظومات): كل وحدة اشتراك مستقل داخل نفس النشاط ونفس الحساب.
// ملف محايد (سيرفر وواجهة). الأيقونة مفتاح يتحول لأيقونة في الواجهة.
import type { AddonKind, BusinessType } from "./constants";

export const PRODUCT_LINES = ["store", "market", "lounge", "gym"] as const;
export type ProductLine = (typeof PRODUCT_LINES)[number];
/** المنظومات الجديدة (غير المتجر الأونلاين) */
export const OPS_LINES = ["market", "lounge", "gym"] as const satisfies readonly ProductLine[];

export type LineIcon = "store" | "market" | "lounge" | "gym";

export const LINE_INFO: Record<ProductLine, {
  /** الاسم التجاري */
  brand: string;
  /** وصف قصير لكرت «شن نوع نشاطك؟» */
  card: string;
  description: string;
  who: string;
  icon: LineIcon;
  /** صفحة المنظومة في اللوحة */
  home: string;
  /** اسم شاشة التشغيل (الكاشير/الصالة/الاستقبال) */
  opsLabel: string;
  /** نوع النشاط اللي يتسجل لو المنظومة هذي هي الأساسية */
  businessType: BusinessType;
}> = {
  store: {
    brand: "رُكن ستور", card: "متجر أونلاين", icon: "store", home: "/dashboard", opsLabel: "لوحة المتجر", businessType: "other",
    description: "متجر إلكتروني جاهز بتصميم احترافي، دفع عند الاستلام، مندوبين ومرتجعات.",
    who: "البياعين على إنستغرام وتيك توك وأصحاب المحلات",
  },
  market: {
    brand: "رُكن ماركت", card: "محل مواد غذائية", icon: "market", home: "/dashboard/market", opsLabel: "الكاشير", businessType: "grocery",
    description: "كاشير ومخزون ودفتر دين، جملة وقطاعي، الكرتونة والحبة، ويشتغل بدون نت.",
    who: "المحلات والسوبرماركت والميني ماركت ومحلات الجملة",
  },
  lounge: {
    brand: "رُكن بلاي", card: "صالة ألعاب", icon: "lounge", home: "/dashboard/lounge", opsLabel: "شاشة الصالة", businessType: "lounge",
    description: "عداد لكل جهاز بالساعة أو بالماتش، البار، الحجوزات والبطولات وشاشة الحائط.",
    who: "صالات الصوني والإكس بوكس والبلياردو والبينغ بونغ",
  },
  gym: {
    brand: "رُكن فِت", card: "نادي رياضي", icon: "gym", home: "/dashboard/gym", opsLabel: "الاستقبال", businessType: "gym",
    description: "اشتراكات وتجميد وأقساط، دخول بالـ QR، حصص ومدربين، وساعات النساء.",
    who: "الجيمات والنوادي والأكاديميات وصالات اليوغا والسباحة",
  },
};

export const isProductLine = (v: unknown): v is ProductLine => typeof v === "string" && (PRODUCT_LINES as readonly string[]).includes(v);

/** مدة التجربة الافتراضية لكل منظومة (الأدمن يغيّرها من الإعدادات) */
export const DEFAULT_LINE_TRIAL_DAYS: Record<ProductLine, number> = { store: 3, market: 7, lounge: 7, gym: 7 };
/** باقة التجربة الافتراضية لكل منظومة (slug) */
export const DEFAULT_LINE_TRIAL_PLAN: Record<ProductLine, string> = { store: "growth", market: "market-growth", lounge: "lounge-growth", gym: "gym-growth" };

/** حالة إطلاق المنظومة للعموم: «قريباً» = تطلع بس للنشاطات اللي فتحها لها الأدمن كتجربة */
export type LineLaunch = "live" | "soon";
export const DEFAULT_LINE_LAUNCH: Record<ProductLine, LineLaunch> = { store: "live", market: "soon", lounge: "soon", gym: "soon" };

/**
 * الإضافة تتربط بأي منظومة؟ null = موارد مشتركة للنشاط كامل (موظف/مخزن/فرع) تنفع مع أي اشتراك.
 * كل إضافة تمشي مع فترة اشتراك المنظومة اللي اندفعت معاها.
 */
export const ADDON_KIND_LINE: Record<AddonKind, ProductLine | null> = {
  staff: null, warehouse: null, branch: null,
  products: "store", custom_domain: "store",
  register: "market", station_pack: "lounge", member_pack: "gym",
};
export const addonFitsLine = (kind: AddonKind, line: ProductLine) => {
  const l = ADDON_KIND_LINE[kind];
  return l === null || l === line;
};
