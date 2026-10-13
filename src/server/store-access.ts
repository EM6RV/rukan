import type { Store } from "./types";

export type StoreAccess = {
  state: "trial" | "active" | "expired" | "suspended";
  daysLeft: number | null; // أيام باقية في التجربة/الاشتراك
  writable: boolean; // الكتابة في اللوحة مسموحة؟
};

const DAY = 86_400_000;

/** الحالة الفعلية: التجربة/الاشتراك المنتهي يتحول لـ expired تلقائياً بدون انتظار cron. */
export function computeStoreAccess(
  store: Pick<Store, "status" | "trialEndsAt" | "currentPeriodEnd">,
  now = Date.now(),
): StoreAccess {
  if (store.status === "suspended") return { state: "suspended", daysLeft: null, writable: false };
  const end = store.status === "trial" ? store.trialEndsAt : store.currentPeriodEnd;
  const daysLeft = end ? Math.ceil((end.getTime() - now) / DAY) : null;
  const expired = store.status === "expired" || (end !== null && end.getTime() <= now);
  if (expired) return { state: "expired", daysLeft: 0, writable: false };
  return { state: store.status === "trial" ? "trial" : "active", daysLeft, writable: true };
}

/** واجهة المتجر للزباين: متاحة أثناء التجربة والاشتراك فقط. */
export const isStoreOpenToCustomers = (access: StoreAccess) => access.state === "trial" || access.state === "active";
