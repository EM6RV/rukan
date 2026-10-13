import { eq } from "drizzle-orm";
import { t } from "../tenant";
import type { StoreContext } from "../store-context";

/** id مستحيل يطابق أي مندوب: لو المستخدم "مندوب" وما لقيناش سجله ما يشوف أي طلبية */
const NO_COURIER = "__no_courier__";

/** المندوب يتقيّد بطلبياته؛ باقي الأدوار null (بدون تقييد) */
export async function courierRestriction(ctx: Pick<StoreContext, "role" | "scope" | "user">): Promise<string | null> {
  if (ctx.role !== "courier") return null;
  const [c] = await ctx.scope.from(t.couriers, eq(t.couriers.userId, ctx.user.id)).limit(1);
  return c?.id ?? NO_COURIER;
}
