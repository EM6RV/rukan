// منطق الاشتراكات المشترك (محايد: يشتغل على السيرفر والواجهة)
const DAY = 86_400_000;
const LIBYA_OFFSET = 2 * 3_600_000;

/** يضيف شهور تقويمية (31 يناير + شهر = 28/29 فبراير) */
export function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

export type BillingPeriod = "monthly" | "quarterly" | "semiannual" | "yearly";
export type DurationKey = "m1" | "m3" | "m6" | "m12";

const MONTHS: Record<BillingPeriod, number> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };
export const cycleMonths = (cycle: BillingPeriod) => MONTHS[cycle];

/** المدد بالترتيب: مفتاح السعر (m1…) ↔ مدة الاشتراك */
export const DURATIONS: { key: DurationKey; cycle: BillingPeriod; months: number; toggle: string; unit: string }[] = [
  { key: "m1", cycle: "monthly", months: 1, toggle: "شهري", unit: "شهر" },
  { key: "m3", cycle: "quarterly", months: 3, toggle: "3 شهور", unit: "3 شهور" },
  { key: "m6", cycle: "semiannual", months: 6, toggle: "6 شهور", unit: "6 شهور" },
  { key: "m12", cycle: "yearly", months: 12, toggle: "سنوي", unit: "سنة" },
];
export const durationOf = (cycle: BillingPeriod) => DURATIONS.find((d) => d.cycle === cycle)!;
export const durationByKey = (key: DurationKey) => DURATIONS.find((d) => d.key === key)!;

type Priced = { prices: Partial<Record<DurationKey, number | null>>; comparePrices?: Partial<Record<DurationKey, number | null>> };
/** سعر الباقة لمدة معينة بالدرهم، أو null لو ما تطلعش فيها */
export const planPrice = (plan: Priced, cycle: BillingPeriod): number | null => plan.prices[durationOf(cycle).key] ?? null;
/** المدد المتاحة للباقة */
export const offeredCycles = (plan: Priced): BillingPeriod[] => DURATIONS.filter((d) => plan.prices[d.key] != null).map((d) => d.cycle);
/** نسبة التوفير مقارنة بالسعر الشهري × عدد الشهور (0 لو ما فيه سعر شهري أو ما فيه توفير) */
export function savingsPercent(plan: Priced, cycle: BillingPeriod): number {
  const m1 = plan.prices.m1, price = planPrice(plan, cycle), months = cycleMonths(cycle);
  if (months === 1 || m1 == null || price == null || m1 <= 0) return 0;
  const pct = Math.round((1 - price / (m1 * months)) * 100);
  return pct > 0 ? pct : 0;
}
/** السعر الشهري المكافئ بالدرهم، مقرّب لأقرب دينار */
export const monthlyEquivalent = (price: number, cycle: BillingPeriod) => Math.round(price / cycleMonths(cycle) / 1000) * 1000;

/** "2026-03" بتوقيت ليبيا (لتجميع الإيرادات شهرياً) */
export const monthKey = (ms: number) => new Date(ms + LIBYA_OFFSET).toISOString().slice(0, 7);

/** رسالة واتساب جاهزة من الأدمن لصاحب المتجر قبل انتهاء الاشتراك */
export function renewalMessage(o: { ownerName: string; storeName: string; daysLeft: number; endDate: string; planName?: string | null; lineName?: string }): string {
  const when = o.daysLeft <= 0 ? "انتهى" : o.daysLeft === 1 ? "ينتهي بكرة" : `ينتهي بعد ${o.daysLeft} أيام`;
  const what = o.lineName ? `اشتراك «${o.storeName}» في ${o.lineName}` : `اشتراك متجرك «${o.storeName}» في رُكن`;
  return `السلام عليكم ${o.ownerName}، ${what}${o.planName ? ` (باقة ${o.planName})` : ""} ${when} (${o.endDate}). للتجديد كلمنا وحنفعّل اشتراكك أول ما يوصلنا الدفع. شكراً لثقتك!`;
}

/** رسالة من البياع للدعم لطلب ترقية/تجديد (lineName: اسم المنظومة لو مش المتجر الأونلاين) */
export function upgradeRequestMessage(o: { storeName: string; slug: string; planName?: string | null; wantedPlan?: string; lineName?: string }): string {
  const who = o.lineName ? `صاحب «${o.storeName}» (${o.slug}) في ${o.lineName}` : `صاحب متجر «${o.storeName}» (${o.slug}) في رُكن`;
  return `السلام عليكم، أنا ${who}${o.planName ? ` وباقتي الحالية ${o.planName}` : ""}. نبي ${o.wantedPlan ? `نرقّي/نجدد على باقة ${o.wantedPlan}` : "نجدد اشتراكي"}. كيف ندفع؟`;
}

export const daysBetween = (from: number, to: number) => Math.ceil((to - from) / DAY);

/** "شهر" أو "3 شهور" أو "6 شهور" أو "سنة" لعرض السعر: «220 د.ل / شهر» */
export const periodUnit = (period: BillingPeriod) => durationOf(period).unit;
/** "شهري" أو "3 شهور" أو "6 شهور" أو "سنوي" */
export const periodLabel = (period: BillingPeriod) => durationOf(period).toggle;
/** «تدفع مرة وحدة X د.ل …» حسب المدة */
export const payOnceText = (period: BillingPeriod) => (period === "yearly" ? "في السنة" : period === "monthly" ? "في الشهر" : `كل ${durationOf(period).unit}`);

/** "3 أيام" / "يوم" / "14 يوم" (عدد الأيام بصيغة عربية سليمة) */
export function daysText(n: number): string {
  if (n === 1) return "يوم";
  if (n === 2) return "يومين";
  return `${n} ${n >= 3 && n <= 10 ? "أيام" : "يوم"}`;
}
