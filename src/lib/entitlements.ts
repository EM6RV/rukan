// المميزات والحدود حسب الباقة: مصدر وحيد لـ «هل المتجر يقدر يستعمل الميزة؟» (سيرفر وواجهة).
// الفحص الحقيقي يصير في السيرفر (canUse في كل action/route/page)، والواجهة تستعمل نفس الدالة باش تعرض القفل.
import type { AddonKind, DurationPerks, PlanLimits } from "@/db/schema/platform";
import { durationOf, type BillingPeriod } from "./billing";
import type { ProductLine } from "./product-lines";

export const FEATURES = [
  "coupons", "reports", "abandonedCarts", "pixels", "customDomain", "removeBranding", "allTemplates",
  "bundles", "customRoles", "advancedReports", "analytics",
  // ماركت
  "debtBook", "wholesale", "batches", "promotions", "cameraScan", "onlineOrders", "hardware",
  // بلاي
  "bookings", "hourPacks", "wallScreen", "tournaments", "powerControl",
  // فِت
  "classes", "trainers", "installments", "memberPortal", "kiosk", "progress", "advancedMessages",
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
  debtBook: { title: "دفتر الدين", benefit: "رصيد لكل زبون وحد أقصى، وكشف حساب يتبعت على واتساب." },
  wholesale: { title: "الجملة ونص الجملة", benefit: "أسعار جملة لمجموعات زباين، وتبديل مستوى السعر على الفاتورة." },
  batches: { title: "الصلاحية والدفعات", benefit: "رقم الدفعة وتاريخ الانتهاء، البيع بالأقرب انتهاءً، وتنبيه «قربت تنتهي»." },
  promotions: { title: "العروض التلقائية", benefit: "اشري X وخوذ Y، الحبة الثانية بنص السعر، وأسعار بوقت معين." },
  cameraScan: { title: "المسح والجرد بالكاميرا", benefit: "امسح الباركود بكاميرا الموبايل في الكاشير والجرد." },
  onlineOrders: { title: "طلبات المحل أونلاين", benefit: "الطلبيات من الأونلاين وواتساب تدخل طابور التجهيز في المحل." },
  hardware: { title: "الطابعة الحرارية والميزان", benefit: "طباعة مباشرة (ESC/POS) وفتح الدرج، وقراءة الميزان." },
  bookings: { title: "الحجوزات", benefit: "حجز جهاز أو غرفة بوقت، من اللوحة أو من صفحة الصالة، مع تأكيد واتساب." },
  hourPacks: { title: "باقات الساعات", benefit: "ساعات مسبقة الدفع واشتراك شهري للاعبين الدائمين." },
  wallScreen: { title: "شاشة الحائط", benefit: "تلفزيون يعرض حالة الأجهزة والوقت الباقي والعروض." },
  tournaments: { title: "البطولات", benefit: "قرعة وشجرة بطولة ونتايج وترتيب لحظي." },
  powerControl: { title: "التحكم في الكهرباء", benefit: "يطفي الجهاز لما يخلص الوقت (قريباً)." },
  classes: { title: "الحصص والحجز", benefit: "جدول أسبوعي، حجز من صفحة العضو، وقائمة انتظار." },
  trainers: { title: "المدربين والتدريب الخاص", benefit: "باقات PT لكل عضو وعمولة كل مدرب." },
  installments: { title: "الأقساط", benefit: "الاشتراك على دفعات بتواريخ، وتنبيه ومنع الدخول عند التأخير." },
  memberPortal: { title: "صفحة العضو", benefit: "العضو يشوف اشتراكه وحصصه ويحجز من موبايله." },
  kiosk: { title: "كشك الدخول", benefit: "تابلت عند الباب، العضو يمسح بروحه." },
  progress: { title: "القياسات والبرامج", benefit: "متابعة الوزن والدهون، وبرامج تمرين وتغذية." },
  advancedMessages: { title: "رسائل متقدمة", benefit: "رسائل تحفيز وعيد ميلاد ومتابعة اللي ما جددوش." },
};

/** مميزات كل منظومة (لجدول المقارنة وشاشة الباقات في الأدمن) */
export const LINE_FEATURES: Record<ProductLine, Feature[]> = {
  store: ["coupons", "reports", "abandonedCarts", "pixels", "customDomain", "removeBranding", "allTemplates", "bundles", "customRoles", "advancedReports", "analytics"],
  market: ["debtBook", "reports", "wholesale", "batches", "promotions", "cameraScan", "onlineOrders", "hardware", "customRoles", "advancedReports"],
  lounge: ["reports", "bookings", "hourPacks", "wallScreen", "tournaments", "powerControl", "customRoles", "advancedReports"],
  gym: ["reports", "classes", "trainers", "installments", "memberPortal", "kiosk", "progress", "advancedMessages", "customRoles", "advancedReports"],
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
    maxBranches: add(base.maxBranches, sum("branch"), 1),
    // حدود المنظومات: تتزاد بس لو المنظومة فيها الحد أصلاً (غير موجود = مش منظومتها)
    ...(base.maxRegisters !== undefined ? { maxRegisters: add(base.maxRegisters, sum("register"), 1) } : {}),
    ...(base.maxStations !== undefined ? { maxStations: add(base.maxStations, sum("station_pack"), 0) } : {}),
    ...(base.maxMembers !== undefined ? { maxMembers: add(base.maxMembers, sum("member_pack"), 0) } : {}),
    customDomain: base.customDomain || sum("custom_domain") > 0,
    freeDesigns: (base.freeDesigns ?? 0) + (perk?.freeDesigns ?? 0),
  };
}

/** أرخص باقة ظاهرة فيها الميزة (لنص «متاحة في باقة X») */
export function cheapestPlanWith<T extends { nameAr: string; limits: PlanLimits; sortOrder: number }>(plans: T[], feature: Feature): T | null {
  return [...plans].sort((a, b) => a.sortOrder - b.sortOrder).find((p) => canUse(p.limits, feature)) ?? null;
}

/** أكبر حد بين المنظومات (null = غير محدود يغلب) */
function maxLimit(values: (number | null | undefined)[], missing: number): number | null {
  let best: number | null = missing;
  for (const v of values) {
    const n = v === undefined ? missing : v;
    if (n === null) return null;
    if (best !== null && n > best) best = n;
  }
  return best;
}

/**
 * حدود النشاط كامل (للموارد المشتركة) من حدود منظوماته النشطة:
 * مميزات المتجر الأونلاين من اشتراك «store» بس (ولو مافيش: مقفولة)، والموارد المشتركة (الموظفين، الفروع، المخازن،
 * المنتجات، الصلاحيات المخصصة، الوحدات) = الأوسع بين المنظومات. حدود ومميزات كل منظومة لحالها تتقرا من حدودها هي.
 */
export function combineLimits(store: PlanLimits | null, others: PlanLimits[], noStore: PlanLimits): PlanLimits {
  const all = [...(store ? [store] : []), ...others];
  const base = store ?? noStore;
  if (!all.length) return base;
  const modules = { ...(base.modules ?? {}) };
  for (const l of all) for (const [k, v] of Object.entries(l.modules ?? {})) if (v) modules[k as keyof typeof modules] = true;
  return {
    ...base,
    maxStaff: maxLimit(all.map((l) => l.maxStaff), 1),
    maxProducts: maxLimit(all.map((l) => l.maxProducts), 0),
    maxWarehouses: maxLimit(all.map((l) => l.maxWarehouses), 1),
    maxBranches: maxLimit(all.map((l) => l.maxBranches), 1),
    customRoles: all.some((l) => l.customRoles === true),
    modules,
  };
}
