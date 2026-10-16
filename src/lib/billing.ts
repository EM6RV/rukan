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

export const cycleMonths = (cycle: "monthly" | "yearly") => (cycle === "yearly" ? 12 : 1);

/** "2026-03" بتوقيت ليبيا (لتجميع الإيرادات شهرياً) */
export const monthKey = (ms: number) => new Date(ms + LIBYA_OFFSET).toISOString().slice(0, 7);

/** رسالة واتساب جاهزة من الأدمن لصاحب المتجر قبل انتهاء الاشتراك */
export function renewalMessage(o: { ownerName: string; storeName: string; daysLeft: number; endDate: string; planName?: string | null }): string {
  const when = o.daysLeft <= 0 ? "انتهى" : o.daysLeft === 1 ? "ينتهي بكرة" : `ينتهي بعد ${o.daysLeft} أيام`;
  return `السلام عليكم ${o.ownerName}، اشتراك متجرك «${o.storeName}» في رُكن${o.planName ? ` (باقة ${o.planName})` : ""} ${when} (${o.endDate}). للتجديد كلمنا وحنفعّل اشتراكك أول ما يوصلنا الدفع. شكراً لثقتك!`;
}

/** رسالة من البياع للدعم لطلب ترقية/تجديد */
export function upgradeRequestMessage(o: { storeName: string; slug: string; planName?: string | null; wantedPlan?: string }): string {
  return `السلام عليكم، أنا صاحب متجر «${o.storeName}» (${o.slug}) في رُكن${o.planName ? ` وباقتي الحالية ${o.planName}` : ""}. نبي ${o.wantedPlan ? `نرقّي/نجدد على باقة ${o.wantedPlan}` : "نجدد اشتراكي"}. كيف ندفع؟`;
}

export const daysBetween = (from: number, to: number) => Math.ceil((to - from) / DAY);

export type BillingPeriod = "monthly" | "yearly";

/** "شهر" أو "سنة" لعرض السعر: «100 د.ل / شهر» */
export const periodUnit = (period: BillingPeriod) => (period === "yearly" ? "سنة" : "شهر");
/** "شهرية" أو "سنوية" */
export const periodLabel = (period: BillingPeriod) => (period === "yearly" ? "سنوية" : "شهرية");

/** سعر الشهر التقريبي للباقة السنوية بالدرهم، مقرّب لأقرب دينار صحيح (500 د.ل ≈ 42 د.ل). الشهرية ترجع null. */
export function approxMonthly(price: number, period: BillingPeriod): number | null {
  return period === "yearly" ? Math.round(price / 12 / 1000) * 1000 : null;
}
