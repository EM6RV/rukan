import { and, count, eq, inArray, lte, sql } from "drizzle-orm";
import { t, type StoreScope } from "../tenant";
import { listCouriers } from "./couriers";

// ليبيا UTC+2 بدون توقيت صيفي: حدود اليوم بتوقيت المتجر
export const TZ_OFFSET_MS = 2 * 3_600_000;
const DAY = 86_400_000;
export const startOfDay = (ms: number) => Math.floor((ms + TZ_OFFSET_MS) / DAY) * DAY - TZ_OFFSET_MS;

const COUNTED = ["new", "confirmed", "with_courier", "delivered"] as const; // المبيعات: بدون الملغي والمرتجع
const num = sql<number>;

export async function getDashboardStats(scope: StoreScope, now = Date.now()) {
  const today = startOfDay(now);
  const weekStart = today - 6 * DAY;
  const monthStart = today - 29 * DAY;

  const salesIn = async (from: number) => {
    const [r] = (await scope.aggregate(t.orders, { total: num`coalesce(sum(${t.orders.total}), 0)`, n: count() }, { where: and(inArray(t.orders.status, [...COUNTED]), sql`${t.orders.createdAt} >= ${from}`) })) as { total: number; n: number }[];
    return { total: r?.total ?? 0, orders: r?.n ?? 0 };
  };

  const [dToday, dWeek, dMonth, newOrders, daily, couriers, ret, lowRows, receipts] = await Promise.all([
    salesIn(today),
    salesIn(weekStart),
    salesIn(monthStart),
    scope.count(t.orders, eq(t.orders.status, "new")),
    scope.aggregate(
      t.orders,
      { day: num`cast((${t.orders.createdAt} + ${TZ_OFFSET_MS}) / ${DAY} as integer)`, total: num`coalesce(sum(${t.orders.total}), 0)`, n: count() },
      { where: and(inArray(t.orders.status, [...COUNTED]), sql`${t.orders.createdAt} >= ${weekStart}`), groupBy: [sql`cast((${t.orders.createdAt} + ${TZ_OFFSET_MS}) / ${DAY} as integer)`] },
    ) as Promise<{ day: number; total: number; n: number }[]>,
    listCouriers(scope),
    scope.aggregate(t.orders, { status: t.orders.status, n: count() }, { where: and(inArray(t.orders.status, ["delivered", "returned"]), sql`${t.orders.createdAt} >= ${monthStart}`), groupBy: [t.orders.status] }) as Promise<{ status: string; n: number }[]>,
    scope.from(t.productVariants, and(eq(t.productVariants.isActive, true), lte(t.productVariants.stock, 5))!),
    scope.count(t.paymentReceipts, eq(t.paymentReceipts.status, "pending")),
  ]);

  const delivered = ret.find((r) => r.status === "delivered")?.n ?? 0;
  const returned = ret.find((r) => r.status === "returned")?.n ?? 0;

  // منتجات قربت تخلص (أقل مخزون لكل منتج)
  const lowByProduct = new Map<string, { stock: number; variants: number }>();
  for (const v of lowRows) {
    const cur = lowByProduct.get(v.productId);
    lowByProduct.set(v.productId, { stock: Math.min(cur?.stock ?? Infinity, v.stock), variants: (cur?.variants ?? 0) + 1 });
  }
  const lowIds = [...lowByProduct.keys()];
  const lowProducts = lowIds.length ? await scope.from(t.products, and(inArray(t.products.id, lowIds), eq(t.products.isVisible, true), sql`${t.products.deletedAt} IS NULL`)!) : [];
  const lowStock = lowProducts.map((p) => ({ id: p.id, name: p.name, stock: lowByProduct.get(p.id)!.stock, variants: lowByProduct.get(p.id)!.variants })).sort((a, b) => a.stock - b.stock);

  const dayIndex = Math.floor((today + TZ_OFFSET_MS) / DAY);
  const chart = Array.from({ length: 7 }, (_, i) => {
    const d = dayIndex - 6 + i;
    const row = daily.find((x) => x.day === d);
    return { dayStart: d * DAY - TZ_OFFSET_MS, total: row?.total ?? 0, orders: row?.n ?? 0 };
  });

  return {
    sales: { today: dToday, week: dWeek, month: dMonth },
    newOrders,
    cashWithCouriers: couriers.reduce((s, c) => s + Math.max(0, c.balance), 0),
    pendingCash: couriers.reduce((s, c) => s + c.pendingCash, 0),
    returnRate: delivered + returned > 0 ? returned / (delivered + returned) : null,
    lowStock: lowStock.slice(0, 6),
    lowStockCount: lowStock.length,
    pendingReceipts: receipts,
    chart,
  };
}
