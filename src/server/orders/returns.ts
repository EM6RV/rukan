import { count, desc, inArray, sql } from "drizzle-orm";
import { t, type StoreScope } from "../tenant";

/** قائمة المرتجعات مع ملخص (العدد، تكلفة التوصيل الضايعة، حسب السبب) */
export async function listReturns(scope: StoreScope, f: { page?: number; pageSize?: number } = {}) {
  const size = Math.min(f.pageSize ?? 25, 100);
  const total = await scope.count(t.returns);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, f.page ?? 1), pageCount);

  const [rows, byReason, [totals]] = await Promise.all([
    scope.from(t.returns).orderBy(desc(t.returns.createdAt), t.returns.id).limit(size).offset((page - 1) * size),
    scope.aggregate(t.returns, { reason: t.returns.reason, n: count() }, { groupBy: [t.returns.reason] }),
    scope.aggregate(t.returns, { loss: sql<number>`coalesce(sum(${t.returns.shippingLoss}), 0)` }),
  ]);
  const orderIds = [...new Set(rows.map((r) => r.orderId))];
  const returnIds = rows.map((r) => r.id);
  const [orders, returnItems] = await Promise.all([
    orderIds.length ? scope.from(t.orders, inArray(t.orders.id, orderIds)) : [],
    returnIds.length ? scope.from(t.returnItems, inArray(t.returnItems.returnId, returnIds)) : [],
  ]);
  const orderItems = orderIds.length ? await scope.from(t.orderItems, inArray(t.orderItems.orderId, orderIds)) : [];

  return {
    total, page, pageCount,
    totalShippingLoss: (totals as { loss: number } | undefined)?.loss ?? 0,
    byReason: Object.fromEntries((byReason as { reason: string; n: number }[]).map((r) => [r.reason, r.n])),
    items: rows.map((r) => {
      const o = orders.find((x) => x.id === r.orderId);
      return {
        id: r.id, orderId: r.orderId, orderNumber: o?.number ?? 0, customerName: o?.customerName ?? "—", orderTotal: o?.total ?? 0,
        reason: r.reason, note: r.reasonNote, restocked: r.restocked, shippingLoss: r.shippingLoss, createdAt: r.createdAt.getTime(),
        items: returnItems.filter((ri) => ri.returnId === r.id).map((ri) => ({ name: orderItems.find((i) => i.id === ri.orderItemId)?.name ?? "—", quantity: ri.quantity })),
      };
    }),
  };
}
