import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import type { PlanLimits } from "@/db/schema/platform";
import { cities, plans, stores, users } from "@/db/schema/platform";
import { saveProduct } from "@/server/catalog/products";
import { saveCourier } from "@/server/orders/couriers";
import { createOrder } from "@/server/orders/create";
import { changeOrderStatus, registerReturn } from "@/server/orders/manage";
import { startOfDay } from "@/server/orders/stats";
import { getReport, parseRange } from "@/server/reports";
import { buildReportWorkbook } from "@/server/reports-export";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t, type StoreScope } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

const LIMITS: PlanLimits = { maxProducts: null, maxStaff: 3, allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: false, removeBranding: false };
let db: Db;
let close: () => void;
let city: string;
let seq = 0;
let phoneSeq = 0;
const DAY = 86_400_000;

async function shop(slug: string) {
  const [plan] = await db.insert(plans).values({ slug: `rp-${slug}`, nameAr: "x", price: 1, limits: LIMITS }).returning();
  const [u] = await db.insert(users).values({ phone: `0918${String(++seq).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  await db.update(stores).set({ planId: plan!.id, onboardedAt: new Date() }).where(eq(stores.id, r.data.storeId));
  const scope = forStore(db, r.data.storeId);
  await scope.insert(t.deliveryRates, [{ cityId: city, fee: 10_000 }]);
  return { id: r.data.storeId, scope };
}
async function product(scope: StoreScope, name: string, price: number, costPrice: number | null) {
  const p = await saveProduct(scope, { name, price, costPrice, variants: [{ valueIds: [], stock: 500 }] }, { limits: LIMITS });
  if (!p.ok) throw new Error(p.error);
  return (await scope.from(t.productVariants, eq(t.productVariants.productId, p.data.id)))[0]!.id;
}
async function order(s: { id: string; scope: StoreScope }, variantId: string, qty: number, extra: Record<string, unknown> = {}) {
  const r = await createOrder(db, s.id, { items: [{ variantId, quantity: qty }], name: "زبون", phone: `09130${String(++phoneSeq).padStart(5, "0")}`, cityId: city, address: "عنوان طويل كفاية", paymentMethod: "cod", ...extra });
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
const setDate = (s: { scope: StoreScope }, id: string, ms: number) => s.scope.update(t.orders, { createdAt: new Date(ms) }, eq(t.orders.id, id));

beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  city = (await db.insert(cities).values({ nameAr: "طرابلس", region: "west", sortOrder: 1 }).returning())[0]!.id;
});
afterAll(() => close());

describe("نطاق التقرير", () => {
  it("تحليل التواريخ بتوقيت ليبيا وحدود السنة", () => {
    const now = Date.UTC(2026, 5, 15, 12);
    const d = parseRange(undefined, undefined, now)!;
    expect(d.to - d.from + 1).toBe(30 * DAY); // افتراضي: آخر 30 يوم
    expect(parseRange("2026-03-01", "2026-03-31")).toEqual({ from: Date.UTC(2026, 1, 28, 22), to: Date.UTC(2026, 2, 31, 21, 59, 59, 999) });
    expect(parseRange("2026-03-01", undefined)).toBeNull();
    expect(parseRange("2026-03-10", "2026-03-01")).toBeNull();
    expect(parseRange("x", "y")).toBeNull();
    expect(parseRange("2025-01-01", "2026-06-01")).toBeNull(); // أكثر من سنة
  });
});

describe("التقرير", () => {
  it("المبيعات والمنتجات والمدن والدفع والمرتجعات والأرباح", async () => {
    const s = await shop("rep-1");
    const now = Date.now();
    const today = startOfDay(now);
    const perfume = await product(s.scope, "عطر", 100_000, 60_000); // ربح 40
    const bag = await product(s.scope, "شنطة", 50_000, null); // بدون تكلفة
    const c = (await saveCourier(s.scope, { name: "مندوب", kind: "person" }));
    if (!c.ok) throw new Error(c.error);
    const deliver = async (id: string) => { await changeOrderStatus(s.scope, { orderId: id, to: "confirmed", actorUserId: null }); await changeOrderStatus(s.scope, { orderId: id, to: "with_courier", actorUserId: null, courierId: c.data.id }); await changeOrderStatus(s.scope, { orderId: id, to: "delivered", actorUserId: null }); };

    const o1 = await order(s, perfume, 2); // 200 + 10 توصيل = 210، مسلّم، ربح 80
    await deliver(o1.orderId);
    const o2 = await order(s, bag, 1); // 60، جديد، بدون تكلفة
    const o3 = await order(s, perfume, 1); // يتلغى
    await changeOrderStatus(s.scope, { orderId: o3.orderId, to: "cancelled", actorUserId: null });
    const o4 = await order(s, perfume, 1); // يرجع
    await changeOrderStatus(s.scope, { orderId: o4.orderId, to: "confirmed", actorUserId: null });
    await changeOrderStatus(s.scope, { orderId: o4.orderId, to: "with_courier", actorUserId: null, courierId: c.data.id });
    await registerReturn(s.scope, { orderId: o4.orderId, reason: "refused", shippingLoss: 10_000 }, null);
    const o5 = await order(s, perfume, 1); // قديم خارج الفترة
    await setDate(s, o5.orderId, today - 40 * DAY);
    await setDate(s, o2.orderId, today - 1 * DAY + 3_600_000);

    const r = await getReport(s.scope, { from: today - 29 * DAY, to: today + DAY - 1 });
    expect(r.sales).toMatchObject({ total: 270_000, orders: 2, average: 135_000, deliveredTotal: 210_000, deliveredOrders: 1 });
    expect(r.byStatus).toEqual({ delivered: 1, new: 1, cancelled: 1, returned: 1 });
    expect(r.daily).toHaveLength(30);
    expect(r.daily.at(-1)).toMatchObject({ total: 210_000, orders: 1 });
    expect(r.daily.at(-2)).toMatchObject({ total: 60_000, orders: 1 });
    expect(r.daily.reduce((x, d) => x + d.total, 0)).toBe(270_000);
    expect(r.topProducts).toEqual([{ productId: expect.any(String), name: "عطر", quantity: 2, revenue: 200_000 }, { productId: expect.any(String), name: "شنطة", quantity: 1, revenue: 50_000 }]);
    expect(r.byCity).toEqual([{ city: "طرابلس", orders: 2, total: 270_000 }]);
    expect(r.byPayment).toEqual([{ method: "cod", orders: 2, total: 270_000 }]);
    expect(r.returns).toMatchObject({ count: 1, items: 1, refundValue: 100_000, shippingLoss: 10_000 });
    expect(r.returns.byReason).toEqual([{ reason: "refused", label: "رفض الاستلام", count: 1 }]);
    expect(r.profit).toMatchObject({ revenue: 200_000, cost: 120_000, gross: 80_000, discounts: 0, shippingLoss: 10_000, net: 70_000, coverage: 1 });
  });

  it("الخصم يتخصم من الربح، والمنتج بدون تكلفة يقلل التغطية", async () => {
    const s = await shop("rep-2");
    const a = await product(s.scope, "بتكلفة", 100_000, 50_000);
    const b = await product(s.scope, "بدون", 100_000, null);
    await s.scope.insert(t.coupons, { code: "TEN", type: "percent", value: 10 });
    const c = await saveCourier(s.scope, { name: "مندوب", kind: "person" });
    if (!c.ok) throw new Error(c.error);
    const o = await order(s, a, 1, { couponCode: "TEN" }); // خصم 10
    const o2 = await order(s, b, 1);
    for (const id of [o.orderId, o2.orderId]) for (const to of ["confirmed", "with_courier", "delivered"] as const) await changeOrderStatus(s.scope, { orderId: id, to, actorUserId: null, courierId: c.data.id });
    const now = Date.now();
    const r = await getReport(s.scope, { from: startOfDay(now), to: startOfDay(now) + DAY - 1 });
    expect(r.profit).toMatchObject({ revenue: 100_000, cost: 50_000, gross: 50_000, discounts: 10_000, net: 40_000, coverage: 0.5 });
    expect(r.sales.discounts).toBe(10_000);
  });

  it("فترة فاضية وعزل المتاجر", async () => {
    const [a, b] = [await shop("rep-3"), await shop("rep-4")];
    const v = await product(b.scope, "منتج", 10_000, null);
    await order(b, v, 1);
    const now = Date.now();
    const r = await getReport(a.scope, { from: startOfDay(now), to: startOfDay(now) + DAY - 1 });
    expect(r.sales).toMatchObject({ total: 0, orders: 0, average: 0 });
    expect(r.topProducts).toEqual([]);
    expect(r.profit.coverage).toBeNull();
    expect((await getReport(b.scope, { from: startOfDay(now), to: startOfDay(now) + DAY - 1 })).sales.orders).toBe(1);
  });

  it("ملف Excel صالح (ZIP) وفيه أوراق", async () => {
    const s = await shop("rep-5");
    const v = await product(s.scope, "منتج", 10_000, 5_000);
    await order(s, v, 1);
    const now = Date.now();
    const buf = await buildReportWorkbook(s.scope, { from: startOfDay(now), to: startOfDay(now) + DAY - 1 });
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(buf.length).toBeGreaterThan(2000);
    const { readSheet } = await import("read-excel-file/node");
    const rows = await readSheet(buf, "الطلبيات");
    expect(rows[0]![0]).toBe("رقم الطلبية");
    expect(rows).toHaveLength(2);
  });
});
