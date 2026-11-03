// حالة اشتراك منظومة (محايد: بدون قاعدة). نفس منطق computeStoreAccess لكن لكل منظومة لحالها.
import type { PlanLimits } from "@/db/schema/platform";
import type { BillingPeriod } from "@/lib/billing";
import type { ProductLine } from "@/lib/product-lines";
import type { StoreAccess } from "./store-access";

const DAY = 86_400_000;

export type LineState = "trial" | "active" | "expired" | "suspended";

export type LineAccess = {
  line: ProductLine;
  /** النشاط مشترك (أو في تجربة) في المنظومة هذي؟ */
  subscribed: boolean;
  state: LineState | "none";
  daysLeft: number | null;
  /** الكتابة مسموحة (التعديل والإضافة) */
  writable: boolean;
  /**
   * البيع في الكاشير مسموح: زي writable، لكن الاشتراك اللي ينتهي في نص وردية مفتوحة يخلي الكاشير يكمّل لين تتقفل الوردية.
   */
  posWritable: boolean;
  planId: string | null;
  planSlug: string | null;
  planName: string | null;
  cycle: BillingPeriod;
  /** حدود الباقة الفعلية (+ الإضافات + ميزة المدة). null = مش مشترك */
  limits: PlanLimits | null;
  trialEndsAt: number | null;
  periodEnd: number | null;
};

type SubLike = { status: LineState; trialEndsAt: Date | null; currentPeriodEnd: Date | null };

/** الحالة الفعلية للمنظومة: التجربة/الفترة المنتهية تتحول expired تلقائياً بدون cron */
export function computeLineState(sub: SubLike, now = Date.now(), opts: { openShiftStartedAt?: number | null } = {}): Pick<LineAccess, "state" | "daysLeft" | "writable" | "posWritable"> {
  if (sub.status === "suspended") return { state: "suspended", daysLeft: null, writable: false, posWritable: false };
  const end = sub.status === "trial" ? sub.trialEndsAt : sub.currentPeriodEnd;
  const daysLeft = end ? Math.ceil((end.getTime() - now) / DAY) : null;
  const expired = sub.status === "expired" || (end !== null && end.getTime() <= now);
  if (expired) {
    // وردية فُتحت قبل الانتهاء: الكاشير يكمّل لين يقفلها
    const grace = opts.openShiftStartedAt != null && end !== null && opts.openShiftStartedAt < end.getTime();
    return { state: "expired", daysLeft: 0, writable: false, posWritable: grace };
  }
  return { state: sub.status === "trial" ? "trial" : "active", daysLeft, writable: true, posWritable: true };
}

export const notSubscribed = (line: ProductLine): LineAccess => ({
  line, subscribed: false, state: "none", daysLeft: null, writable: false, posWritable: false,
  planId: null, planSlug: null, planName: null, cycle: "monthly", limits: null, trialEndsAt: null, periodEnd: null,
});

const RANK: Record<LineAccess["state"], number> = { active: 4, trial: 3, expired: 2, suspended: 1, none: 0 };

/**
 * وصول النشاط كامل للوحة: المتجر الأونلاين لو مشترك فيه (نفس السلوك القديم)، وإلا أحسن حالة بين منظوماته.
 * (المنظومات لحالها تتفحص بـ lineAccess في صفحاتها وأكشناتها.)
 */
export function businessAccess(lines: Record<ProductLine, LineAccess>): StoreAccess {
  const subscribed = Object.values(lines).filter((l) => l.subscribed);
  const pick = lines.store.subscribed ? lines.store : subscribed.sort((a, b) => RANK[b.state] - RANK[a.state])[0];
  if (!pick || pick.state === "none") return { state: "expired", daysLeft: 0, writable: false };
  return { state: pick.state, daysLeft: pick.daysLeft, writable: pick.writable };
}
