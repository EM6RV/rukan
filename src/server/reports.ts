import { and, gte, inArray, lte } from "drizzle-orm";
import type { OrderStatus } from "@/lib/constants";
import { RETURN_REASON_LABELS } from "@/lib/order-flow";
import { TZ_OFFSET_MS, startOfDay } from "./orders/stats";
import { t, type StoreScope } from "./tenant";

const DAY = 86_400_000;
export const MAX_RANGE_DAYS = 366;
const MAX_ORDERS = 20_000;
const CHUNK = 400;

/** المبيعات المحسوبة: بدون الملغي والمرتجع */
const COUNTED: OrderStatus[] = ["new", "confirmed", "with_courier", "delivered"];

export type ReportRange = { from: number; to: number }; // ms، شاملة (to = آخر ملي ثانية في اليوم الأخير)

/** من تاريخين (yyyy-mm-dd) بتوقيت ليبيا. يرجع null لو غلط أو أطول من سنة. */
export function parseRange(from: string | undefined, to: string | undefined, now = Date.now()): ReportRange | null {
  const day = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) ? Date.parse(`${v}T00:00:00Z`) - TZ_OFFSET_MS : null);
  const f = day(from), tt = day(to);
  if (!from && !to) return { from: startOfDay(now) - 29 * DAY, to: startOfDay(now) + DAY - 1 };
  if (f === null || tt === null || tt < f) return null;
  if ((tt - f) / DAY + 1 > MAX_RANGE_DAYS) return null;
  return { from: f, to: tt + DAY - 1 };
}

export type Report = {
  range: ReportRange;
  sales: { total: number; orders: number; average: number; deliveredTotal: number; deliveredOrders: number; discounts: number };
  byStatus: Record<string, number>;
  daily: { dayStart: number; total: number; orders: number }[];
  topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
  byCity: { city: string; orders: number; total: number }[];
  byPayment: { method: string; orders: number; total: number }[];
  returns: { count: number; items: number; refundValue: number; shippingLoss: number; byReason: { reason: string; label: string; count: number }[] };
  profit: { revenue: number; cost: number; gross: number; discounts: number; shippingLoss: number; net: number; coverage: number | null };
};

export class ReportError extends Error {}

export async function getReport(scope: StoreScope, range: ReportRange): Promise<Report> {
  const orders = await scope.from(t.orders, and(gte(t.orders.createdAt, new Date(range.from)), lte(t.orders.createdAt, new Date(range.to)))!).limit(MAX_ORDERS + 1);
  if (orders.length > MAX_ORDERS) throw new ReportError("الفترة فيها طلبيات كثيرة. قلّل الفترة.");

  const byStatus: Record<string, number> = {};
  for (const o of orders) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;

  const counted = orders.filter((o) => COUNTED.includes(o.status));
  const delivered = orders.filter((o) => o.status === "delivered");
  const sum = (xs: { total: number }[]) => xs.reduce((s, o) => s + o.total, 0);

  // الأيام
  const first = startOfDay(range.from);
  const days = Math.round((startOfDay(range.to) - first) / DAY) + 1;
  const daily = Array.from({ length: days }, (_, i) => ({ dayStart: first + i * DAY, total: 0, orders: 0 }));
  for (const o of counted) {
    const d = daily[Math.round((startOfDay(o.createdAt.getTime()) - first) / DAY)];
    if (d) { d.total += o.total; d.orders += 1; }
  }

  // البنود (للمنتجات والأرباح): نقرا بدفعات
  const countedIds = counted.map((o) => o.id);
  const items: (typeof t.orderItems.$inferSelect)[] = [];
  for (let i = 0; i < countedIds.length; i += CHUNK) items.push(...(await scope.from(t.orderItems, inArray(t.orderItems.orderId, countedIds.slice(i, i + CHUNK)))));

  const products = new Map<string, { productId: string; name: string; quantity: number; revenue: number }>();
  for (const it of items) {
    const p = products.get(it.productId) ?? { productId: it.productId, name: it.name, quantity: 0, revenue: 0 };
    p.quantity += it.quantity; p.revenue += it.unitPrice * it.quantity;
    products.set(it.productId, p);
  }

  const group = <K extends string>(rows: typeof counted, key: (o: (typeof counted)[number]) => K) => {
    const m = new Map<K, { orders: number; total: number }>();
    for (const o of rows) { const g = m.get(key(o)) ?? { orders: 0, total: 0 }; g.orders += 1; g.total += o.total; m.set(key(o), g); }
    return [...m.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.total - a.total);
  };

  // المرتجعات (حسب تاريخ تسجيل المرتجع)
  const rets = await scope.from(t.returns, and(gte(t.returns.createdAt, new Date(range.from)), lte(t.returns.createdAt, new Date(range.to)))!);
  const retIds = rets.map((r) => r.id);
  const retItems: (typeof t.returnItems.$inferSelect)[] = [];
  for (let i = 0; i < retIds.length; i += CHUNK) retItems.push(...(await scope.from(t.returnItems, inArray(t.returnItems.returnId, retIds.slice(i, i + CHUNK)))));
  const retOrderItemIds = [...new Set(retItems.map((r) => r.orderItemId))];
  const retOrderItems: (typeof t.orderItems.$inferSelect)[] = [];
  for (let i = 0; i < retOrderItemIds.length; i += CHUNK) retOrderItems.push(...(await scope.from(t.orderItems, inArray(t.orderItems.id, retOrderItemIds.slice(i, i + CHUNK)))));
  const price = new Map(retOrderItems.map((i) => [i.id, i.unitPrice]));
  const reasons = new Map<string, number>();
  for (const r of rets) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
  const shippingLoss = rets.reduce((s, r) => s + r.shippingLoss, 0);

  // الأرباح: المسلّمة فقط، والبنود اللي لها تكلفة
  const deliveredIds = new Set(delivered.map((o) => o.id));
  const dItems = items.filter((i) => deliveredIds.has(i.orderId));
  const withCost = dItems.filter((i) => i.unitCost !== null);
  const revenue = withCost.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const cost = withCost.reduce((s, i) => s + (i.unitCost ?? 0) * i.quantity, 0);
  // الخصم يتخصم بس من الطلبيات اللي كل بنودها لها تكلفة (علشان الربح ما يتشوهش)
  const fullyCosted = delivered.filter((o) => dItems.filter((i) => i.orderId === o.id).every((i) => i.unitCost !== null));
  const discounts = fullyCosted.reduce((s, o) => s + o.discount, 0);
  const gross = revenue - cost;

  return {
    range,
    sales: { total: sum(counted), orders: counted.length, average: counted.length ? Math.round(sum(counted) / counted.length) : 0, deliveredTotal: sum(delivered), deliveredOrders: delivered.length, discounts: counted.reduce((s, o) => s + o.discount, 0) },
    byStatus,
    daily,
    topProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 10),
    byCity: group(counted, (o) => o.cityName).map((x) => ({ city: x.k, orders: x.orders, total: x.total })).slice(0, 10),
    byPayment: group(counted, (o) => o.paymentMethod).map((x) => ({ method: x.k, orders: x.orders, total: x.total })),
    returns: {
      count: rets.length, items: retItems.reduce((s, r) => s + r.quantity, 0), refundValue: retItems.reduce((s, r) => s + r.quantity * (price.get(r.orderItemId) ?? 0), 0), shippingLoss,
      byReason: [...reasons.entries()].map(([reason, count]) => ({ reason, label: RETURN_REASON_LABELS[reason as keyof typeof RETURN_REASON_LABELS] ?? reason, count })).sort((a, b) => b.count - a.count),
    },
    profit: { revenue, cost, gross, discounts, shippingLoss, net: gross - discounts - shippingLoss, coverage: dItems.length ? withCost.length / dItems.length : null },
  };
}

/** صفوف الطلبيات للتصدير */
export async function exportOrders(scope: StoreScope, range: ReportRange) {
  const rows = await scope.from(t.orders, and(gte(t.orders.createdAt, new Date(range.from)), lte(t.orders.createdAt, new Date(range.to)))!).orderBy(t.orders.createdAt).limit(MAX_ORDERS + 1);
  if (rows.length > MAX_ORDERS) throw new ReportError("الفترة فيها طلبيات كثيرة. قلّل الفترة.");
  return rows;
}
