import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { storeMembers } from "@/db/schema/platform";
import { productQuota } from "./catalog/products";
import { ordersThisMonth } from "./entitlements";
import type { StoreContext } from "./store-context";

export type StoreUsage = { products: { used: number; limit: number | null }; staff: { used: number; limit: number | null }; orders: { used: number; limit: number | null } };

/** استهلاك المتجر مقابل حدود باقته الفعلية (للأشرطة في صفحة الاشتراك والرئيسية) */
export async function storeUsage(db: Db, ctx: Pick<StoreContext, "store" | "scope" | "limits">): Promise<StoreUsage> {
  const [products, staff, orders] = await Promise.all([
    productQuota(ctx.scope, ctx.limits),
    db.$count(storeMembers, and(eq(storeMembers.storeId, ctx.store.id), ne(storeMembers.role, "owner"))),
    ordersThisMonth(db, ctx.store.id),
  ]);
  return {
    products: { used: products.used, limit: ctx.limits.maxProducts },
    staff: { used: staff, limit: ctx.limits.maxStaff },
    orders: { used: orders, limit: ctx.limits.maxOrdersPerMonth ?? null },
  };
}
