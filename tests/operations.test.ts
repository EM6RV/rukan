import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cities, media, plans, stores, users } from "@/db/schema/platform";
import type { PlanLimits } from "@/db/schema/platform";
import { saveProduct } from "@/server/catalog/products";
import { courierBalance, deleteCourier, getLedger, listCouriers, recordAdjustment, recordSettlement, saveCourier } from "@/server/orders/couriers";
import { createOrder } from "@/server/orders/create";
import { getCustomerDetail, listCustomers, setCustomerFlag } from "@/server/orders/customers";
import { bulkAssignCourier, changeOrderStatus, getOrderDetail, listOrders, registerReturn, reviewReceipt, setPaymentStatus, updateOrderDetails } from "@/server/orders/manage";
import { getDashboardStats, startOfDay } from "@/server/orders/stats";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t, type StoreScope } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

const GROWTH: PlanLimits = { maxProducts: null, maxStaff: 3, allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: false, removeBranding: false };
let db: Db;
let close: () => void;
let n = 0;
let tripoli: string, benghazi: string;

type Shop = { id: string; scope: StoreScope; productId: string; variantId: string };

async function makeShop(slug: string, stock = 20): Promise<Shop> {
  const [plan] = await db.insert(plans).values({ slug: `p-${slug}`, nameAr: "x", priceMonthly: 1, priceYearly: 1, limits: GROWTH }).returning();
  const [u] = await db.insert(users).values({ phone: `0914${String(++n).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  await db.update(stores).set({ planId: plan!.id, onboardedAt: new Date(), onboardingStep: 6 }).where(eq(stores.id, r.data.storeId));
  const scope = forStore(db, r.data.storeId);
  await scope.insert(t.deliveryRates, [{ cityId: tripoli, fee: 10_000 }, { cityId: benghazi, fee: 25_000 }]);
  const p = await saveProduct(scope, { name: "عطر", price: 50_000, variants: [{ valueIds: [], stock }] }, { limits: GROWTH });
  if (!p.ok) throw new Error(p.error);
  const [v] = await scope.from(t.productVariants, eq(t.productVariants.productId, p.data.id));
  return { id: r.data.storeId, scope, productId: p.data.id, variantId: v!.id };
}

let phoneSeq = 0;
async function place(s: Shop, over: Record<string, unknown> = {}, qty = 2) {
  const r = await createOrder(db, s.id, { items: [{ variantId: s.variantId, quantity: qty }], name: "سالم", phone: `09120${String(++phoneSeq).padStart(5, "0")}`, cityId: tripoli, address: "طرابلس شارع الجمهورية", paymentMethod: "cod", ...over });
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
const courier = async (s: Shop, name = "مندوب") => { const r = await saveCourier(s.scope, { name, kind: "person" }); if (!r.ok) throw new Error(r.error); return r.data.id; };
const stock = async (s: Shop) => (await s.scope.from(t.productVariants, eq(t.productVariants.id, s.variantId)))[0]!.stock;
const status = async (s: Shop, id: string) => (await s.scope.from(t.orders, eq(t.orders.id, id)))[0]!;
const go = (s: Shop, orderId: string, to: Parameters<typeof changeOrderStatus>[1]["to"], extra: Record<string, unknown> = {}) => changeOrderStatus(s.scope, { orderId, to, actorUserId: null, ...extra });

beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  [tripoli, benghazi] = (await db.insert(cities).values([{ nameAr: "طرابلس", region: "west", sortOrder: 1 }, { nameAr: "بنغازي", region: "east", sortOrder: 2 }]).returning()).map((c) => c.id) as [string, string];
});
afterAll(() => close());

describe("دورة حياة الطلبية", () => {
  it("جديدة ← مؤكدة ← مع المندوب ← تم التوصيل: كاش المندوب والدفع وإحصائيات الزبون", async () => {
    const s = await makeShop("flow-1");
    const o = await place(s);
    const c = await courier(s);
    expect((await go(s, o.orderId, "confirmed")).ok).toBe(true);
    expect(await go(s, o.orderId, "with_courier")).toEqual({ ok: false, error: expect.stringContaining("اختار المندوب") });
    expect((await go(s, o.orderId, "with_courier", { courierId: c, shipmentNumber: " SH-77 " })).ok).toBe(true);
    expect(await status(s, o.orderId)).toMatchObject({ status: "with_courier", courierId: c, shipmentNumber: "SH-77" });
    expect(await courierBalance(s.scope, c)).toBe(0); // لسا ما استلم من الزبون

    expect((await go(s, o.orderId, "delivered")).ok).toBe(true);
    expect(await status(s, o.orderId)).toMatchObject({ status: "delivered", paymentStatus: "paid" });
    expect(await courierBalance(s.scope, c)).toBe(110_000);
    const [cust] = await s.scope.from(t.customers);
    expect(cust).toMatchObject({ ordersCount: 1, deliveredCount: 1, totalSpent: 110_000 });
    const hist = (await s.scope.from(t.orderStatusHistory, eq(t.orderStatusHistory.orderId, o.orderId)).orderBy(t.orderStatusHistory.createdAt)).map((h) => h.toStatus);
    expect(hist).toEqual(["new", "confirmed", "with_courier", "delivered"]);
    const [entry] = await s.scope.from(t.courierCashEntries);
    expect(entry).toMatchObject({ type: "collected", amount: 110_000, orderId: o.orderId });
  });

  it("انتقالات غير مسموحة", async () => {
    const s = await makeShop("flow-2");
    const o = await place(s);
    expect(await go(s, o.orderId, "delivered")).toEqual({ ok: false, error: expect.stringContaining("ما تقدرش") });
    expect(await go(s, o.orderId, "returned")).toEqual({ ok: false, error: expect.stringContaining("تسجيل مرتجع") });
    expect((await go(s, o.orderId, "cancelled")).ok).toBe(true);
    for (const to of ["new", "confirmed", "with_courier", "delivered", "cancelled"] as const) expect((await go(s, o.orderId, to)).ok, to).toBe(false);
    expect((await go(s, "nope", "confirmed")).ok).toBe(false);
  });

  it("ضغطتين على «تم التوصيل» بالتزامن: كاش واحد فقط", async () => {
    const s = await makeShop("flow-3");
    const o = await place(s);
    const c = await courier(s);
    await go(s, o.orderId, "confirmed");
    await go(s, o.orderId, "with_courier", { courierId: c });
    const results = await Promise.all([go(s, o.orderId, "delivered"), go(s, o.orderId, "delivered"), go(s, o.orderId, "delivered")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await s.scope.count(t.courierCashEntries)).toBe(1);
    expect((await s.scope.from(t.customers))[0]!.deliveredCount).toBe(1);
  });

  it("الإلغاء يرجع المخزون ويحرر الكوبون ويقلل عدّاد الزبون، والمدفوع يصير مسترجع", async () => {
    const s = await makeShop("cancel-1");
    const [cp] = await s.scope.insert(t.coupons, { code: "C10", type: "percent", value: 10, maxUses: 5 });
    const o = await place(s, { couponCode: "c10" });
    expect(await stock(s)).toBe(18);
    expect((await s.scope.from(t.coupons))[0]!.usedCount).toBe(1);
    await s.scope.update(t.orders, { paymentStatus: "paid" }, eq(t.orders.id, o.orderId));

    expect((await go(s, o.orderId, "cancelled", { note: "الزبون غير رأيه" })).ok).toBe(true);
    expect(await stock(s)).toBe(20);
    expect((await s.scope.from(t.coupons, eq(t.coupons.id, cp!.id)))[0]!.usedCount).toBe(0);
    expect(await s.scope.count(t.couponRedemptions)).toBe(0);
    expect((await s.scope.from(t.customers))[0]!.ordersCount).toBe(0);
    expect(await status(s, o.orderId)).toMatchObject({ status: "cancelled", paymentStatus: "refunded" });
    const moves = await s.scope.from(t.stockMovements, eq(t.stockMovements.reason, "cancel"));
    expect(moves.map((m) => m.delta)).toEqual([2]);
    expect((await s.scope.from(t.orderStatusHistory)).at(-1)).toMatchObject({ toStatus: "cancelled", note: "الزبون غير رأيه" });
  });

  it("المندوب: لازم موجود ونشط ومن نفس المتجر", async () => {
    const [a, b] = [await makeShop("cr-a"), await makeShop("cr-b")];
    const o = await place(a);
    const foreign = await courier(b);
    const off = await courier(a, "موقوف");
    await saveCourier(a.scope, { id: off, name: "موقوف", kind: "person", isActive: false });
    await go(a, o.orderId, "confirmed");
    expect((await go(a, o.orderId, "with_courier", { courierId: foreign })).ok).toBe(false);
    expect((await go(a, o.orderId, "with_courier", { courierId: off })).ok).toBe(false);
    expect((await go(a, o.orderId, "with_courier", { courierId: "ghost" })).ok).toBe(false);
  });

  it("متجر ما يقدر يتعامل مع طلبية متجر ثاني", async () => {
    const [a, b] = [await makeShop("iso-a"), await makeShop("iso-b")];
    const ob = await place(b);
    expect((await go(a, ob.orderId, "confirmed")).ok).toBe(false);
    expect(await getOrderDetail(a.scope, ob.orderId)).toBeNull();
    expect((await updateOrderDetails(a.scope, ob.orderId, { address: "اختراق" }, null)).ok).toBe(false);
    expect((await registerReturn(a.scope, { orderId: ob.orderId, reason: "refused" }, null)).ok).toBe(false);
    expect((await go(b, ob.orderId, "confirmed")).ok).toBe(true);
  });

  it("المندوب يشوف طلبياته ويسجل التوصيل فقط", async () => {
    const s = await makeShop("courier-role");
    const [mine, other] = [await place(s), await place(s)];
    const [c1, c2] = [await courier(s, "أول"), await courier(s, "ثاني")];
    for (const [o, c] of [[mine, c1], [other, c2]] as const) { await go(s, o.orderId, "confirmed"); await go(s, o.orderId, "with_courier", { courierId: c }); }

    expect(await getOrderDetail(s.scope, other.orderId, c1)).toBeNull();
    expect(await getOrderDetail(s.scope, mine.orderId, c1)).not.toBeNull();
    expect((await go(s, other.orderId, "delivered", { restrictCourierId: c1 })).ok).toBe(false);
    expect(await go(s, mine.orderId, "cancelled", { restrictCourierId: c1 })).toEqual({ ok: false, error: expect.stringContaining("التوصيل فقط") });
    expect((await go(s, mine.orderId, "delivered", { restrictCourierId: c1 })).ok).toBe(true);
    const list = await listOrders(s.scope, { restrictCourierId: c2 });
    expect(list.items.map((i) => i.id)).toEqual([other.orderId]);
  });
});

describe("المرتجعات", () => {
  it("رفض الاستلام من المندوب: مرتجعة، المخزون يرجع، تكلفة التوصيل تتسجل، بدون كاش", async () => {
    const s = await makeShop("ret-1");
    const o = await place(s);
    const c = await courier(s);
    await go(s, o.orderId, "confirmed");
    await go(s, o.orderId, "with_courier", { courierId: c });
    expect(await stock(s)).toBe(18);
    const r = await registerReturn(s.scope, { orderId: o.orderId, reason: "refused", reasonNote: "ما فتح الباب", shippingLoss: 10_000 }, "u1");
    expect(r).toMatchObject({ ok: true, data: { fullyReturned: true } });
    expect(await stock(s)).toBe(20);
    expect(await status(s, o.orderId)).toMatchObject({ status: "returned" });
    expect(await courierBalance(s.scope, c)).toBe(0);
    expect((await s.scope.from(t.returns))[0]).toMatchObject({ reason: "refused", restocked: true, shippingLoss: 10_000, actorUserId: "u1" });
    expect((await s.scope.from(t.customers))[0]).toMatchObject({ returnedCount: 1, deliveredCount: 0, totalSpent: 0 });
    expect((await s.scope.from(t.stockMovements, eq(t.stockMovements.reason, "return"))).map((m) => m.delta)).toEqual([2]);
    expect((await registerReturn(s.scope, { orderId: o.orderId, reason: "refused" }, null)).ok).toBe(false); // ما ينسجل مرتين
  });

  it("مرتجع جزئي بعد التوصيل ثم كامل، والكميات تتحقق، وبدون إرجاع للمخزون", async () => {
    const s = await makeShop("ret-2");
    const o = await place(s, {}, 4);
    const c = await courier(s);
    await go(s, o.orderId, "confirmed");
    await go(s, o.orderId, "with_courier", { courierId: c });
    // الجزئي ما ينفعش والطلبية مع المندوب
    const [item] = await s.scope.from(t.orderItems);
    expect((await registerReturn(s.scope, { orderId: o.orderId, reason: "defective", items: [{ orderItemId: item!.id, quantity: 1 }] }, null)).ok).toBe(false);
    await go(s, o.orderId, "delivered");
    expect(await stock(s)).toBe(16);

    expect((await registerReturn(s.scope, { orderId: o.orderId, reason: "defective", items: [{ orderItemId: item!.id, quantity: 5 }] }, null)).ok).toBe(false);
    expect((await registerReturn(s.scope, { orderId: o.orderId, reason: "defective", items: [{ orderItemId: item!.id, quantity: 0 }] }, null)).ok).toBe(false);
    const part = await registerReturn(s.scope, { orderId: o.orderId, reason: "defective", items: [{ orderItemId: item!.id, quantity: 1 }], restock: false }, null);
    expect(part).toMatchObject({ ok: true, data: { fullyReturned: false, refund: 50_000 } });
    expect(await stock(s)).toBe(16); // restock=false
    expect((await status(s, o.orderId)).status).toBe("delivered");
    expect((await s.scope.from(t.customers))[0]).toMatchObject({ deliveredCount: 1, returnedCount: 1, totalSpent: 210_000 - 50_000 + 10_000 - 10_000 });

    expect((await registerReturn(s.scope, { orderId: o.orderId, reason: "changed_mind", items: [{ orderItemId: item!.id, quantity: 4 }] }, null)).ok).toBe(false); // المتبقي 3
    const rest = await registerReturn(s.scope, { orderId: o.orderId, reason: "changed_mind" }, null); // الباقي كله
    expect(rest).toMatchObject({ ok: true, data: { fullyReturned: true } });
    expect(await status(s, o.orderId)).toMatchObject({ status: "returned", paymentStatus: "refunded" });
    expect(await stock(s)).toBe(19); // رجّعنا 3 بس (الأولى بدون restock)
    const d = await getOrderDetail(s.scope, o.orderId);
    expect(d!.returnedQty[item!.id]).toBe(4);
    expect(d!.returns).toHaveLength(2);
  });

  it("المرتجع ما ينفعش لطلبية جديدة أو ملغية، والسبب إجباري", async () => {
    const s = await makeShop("ret-3");
    const o = await place(s);
    expect((await registerReturn(s.scope, { orderId: o.orderId, reason: "refused" }, null)).ok).toBe(false);
    expect((await registerReturn(s.scope, { orderId: o.orderId }, null)).ok).toBe(false);
    expect((await registerReturn(s.scope, { orderId: o.orderId, reason: "xx" }, null)).ok).toBe(false);
  });
});

describe("الإيصالات والدفع", () => {
  it("قبول الإيصال يخلي الطلبية مدفوعة، والرفض لا", async () => {
    const s = await makeShop("rcpt");
    await s.scope.update(t.storePaymentMethods, { isEnabled: true, config: { bankName: "x", accountNumber: "1" } }, eq(t.storePaymentMethods.method, "bank_transfer"));
    const mk = async () => (await db.insert(media).values({ storeId: s.id, mime: "image/webp", size: 1, driver: "turso", isPrivate: true }).returning())[0]!.id;
    const a = await place(s, { paymentMethod: "bank_transfer", receiptMediaId: await mk() });
    const b = await place(s, { paymentMethod: "bank_transfer", receiptMediaId: await mk() });
    const receipts = await s.scope.from(t.paymentReceipts);
    const ra = receipts.find((r) => r.orderId === a.orderId)!;
    const rb = receipts.find((r) => r.orderId === b.orderId)!;

    expect((await reviewReceipt(s.scope, ra.id, "approved", "u")).ok).toBe(true);
    expect((await reviewReceipt(s.scope, rb.id, "rejected", "u")).ok).toBe(true);
    expect((await status(s, a.orderId)).paymentStatus).toBe("paid");
    expect((await status(s, b.orderId)).paymentStatus).toBe("pending");
    expect((await s.scope.from(t.paymentReceipts, eq(t.paymentReceipts.id, rb.id)))[0]!.status).toBe("rejected");
    expect((await reviewReceipt(s.scope, "ghost", "approved", null)).ok).toBe(false);

    expect((await setPaymentStatus(s.scope, b.orderId, "paid", "u")).ok).toBe(true);
    // تحويل مدفوع ما يتحصّلش كاش من المندوب
    const c = await courier(s);
    await go(s, a.orderId, "confirmed"); await go(s, a.orderId, "with_courier", { courierId: c }); await go(s, a.orderId, "delivered");
    expect(await courierBalance(s.scope, c)).toBe(0);
  });
});

describe("تعديل الطلبية", () => {
  it("بيانات الزبون والتوصيل وإعادة حساب الإجمالي، والقفل بعد التوصيل", async () => {
    const s = await makeShop("edit");
    const o = await place(s);
    expect((await updateOrderDetails(s.scope, o.orderId, { customerPhone: "+218 92 111 2233", address: "عنوان جديد مفصل", deliveryFee: 15_000, internalNotes: "اتصل قبل الوصول" }, "u")).ok).toBe(true);
    expect(await status(s, o.orderId)).toMatchObject({ customerPhone: "0921112233", address: "عنوان جديد مفصل", deliveryFee: 15_000, total: 115_000, internalNotes: "اتصل قبل الوصول" });
    expect((await updateOrderDetails(s.scope, o.orderId, { customerPhone: "0961234567" }, null)).ok).toBe(false);
    expect((await updateOrderDetails(s.scope, o.orderId, { address: "x" }, null)).ok).toBe(false);
    expect((await updateOrderDetails(s.scope, o.orderId, { deliveryFee: -5 }, null)).ok).toBe(false);

    const c = await courier(s);
    await go(s, o.orderId, "confirmed"); await go(s, o.orderId, "with_courier", { courierId: c }); await go(s, o.orderId, "delivered");
    expect(await updateOrderDetails(s.scope, o.orderId, { address: "تغيير بعد التوصيل" }, null)).toEqual({ ok: false, error: expect.stringContaining("مقفولة") });
    expect((await updateOrderDetails(s.scope, o.orderId, { internalNotes: "ملاحظة بعد التوصيل" }, null)).ok).toBe(true);
  });

  it("تعيين مندوب لعدة طلبيات (المقفولة تتجاهل)", async () => {
    const s = await makeShop("bulk");
    const [a, b, c2] = [await place(s), await place(s), await place(s)];
    await go(s, c2.orderId, "cancelled");
    const cid = await courier(s);
    expect(await bulkAssignCourier(s.scope, [a.orderId, b.orderId, c2.orderId], cid, "u")).toEqual({ ok: true, data: { count: 2 } });
    expect((await status(s, a.orderId)).courierId).toBe(cid);
    expect((await status(s, c2.orderId)).courierId).toBeNull();
    expect((await bulkAssignCourier(s.scope, [], cid, null)).ok).toBe(false);
    expect((await bulkAssignCourier(s.scope, [a.orderId], "ghost", null)).ok).toBe(false);
    expect(await bulkAssignCourier(s.scope, [a.orderId], null, null)).toEqual({ ok: true, data: { count: 1 } });
  });
});

describe("المندوبون والكاش", () => {
  it("الأرصدة والتسوية والتعديل والحذف", async () => {
    const s = await makeShop("cash", 100);
    const [c1, c2] = [await courier(s, "أحمد"), await courier(s, "شركة النور")];
    const deliver = async (c: string, qty: number) => { const o = await place(s, {}, qty); await go(s, o.orderId, "confirmed"); await go(s, o.orderId, "with_courier", { courierId: c }); await go(s, o.orderId, "delivered"); return o; };
    await deliver(c1, 1); // 60
    await deliver(c1, 2); // 110
    await deliver(c2, 1); // 60
    const pending = await place(s, {}, 3); // 160 مع المندوب لسا
    await go(s, pending.orderId, "confirmed"); await go(s, pending.orderId, "with_courier", { courierId: c1 });

    let list = await listCouriers(s.scope);
    const a = list.find((c) => c.id === c1)!;
    expect(a).toMatchObject({ balance: 170_000, pendingOrders: 1, pendingCash: 160_000, deliveredCount: 2, lastSettlementAt: null });
    expect(list.find((c) => c.id === c2)!.balance).toBe(60_000);

    expect(await recordSettlement(s.scope, { courierId: c1, amount: 500_000 }, "u")).toEqual({ ok: false, error: expect.stringContaining("أكبر من الكاش") });
    expect((await recordSettlement(s.scope, { courierId: c1, amount: 0 }, "u")).ok).toBe(false);
    expect((await recordSettlement(s.scope, { courierId: c1, amount: 1.5 }, "u")).ok).toBe(false);
    expect(await recordSettlement(s.scope, { courierId: c1, amount: 100_000, note: "تسليم نقدي" }, "u")).toEqual({ ok: true, data: { balance: 70_000 } });
    expect(await recordSettlement(s.scope, { courierId: "ghost", amount: 1 }, null)).toMatchObject({ ok: false });
    list = await listCouriers(s.scope);
    expect(list.find((c) => c.id === c1)).toMatchObject({ balance: 70_000 });
    expect(list.find((c) => c.id === c1)!.lastSettlementAt).toBeGreaterThan(0);

    expect((await recordAdjustment(s.scope, { courierId: c1, amount: -20_000, note: "" }, "u")).ok).toBe(false);
    expect((await recordAdjustment(s.scope, { courierId: c1, amount: 0, note: "سبب" }, "u")).ok).toBe(false);
    expect((await recordAdjustment(s.scope, { courierId: c1, amount: -20_000, note: "خصم تالف" }, "u")).ok).toBe(true);
    expect(await courierBalance(s.scope, c1)).toBe(50_000);

    const ledger = await getLedger(s.scope, c1);
    expect(ledger.entries.map((e) => e.type).sort()).toEqual(["adjustment", "collected", "collected", "settlement"]);
    expect(ledger.entries.find((e) => e.type === "collected")!.orderNumber).toBeGreaterThan(1000);

    expect(await deleteCourier(s.scope, c1)).toEqual({ ok: false, error: expect.stringContaining("أوقفه") });
    const fresh = await courier(s, "جديد");
    expect((await deleteCourier(s.scope, fresh)).ok).toBe(true);
    expect((await deleteCourier(s.scope, fresh)).ok).toBe(false);
  });

  it("تحقق بيانات المندوب", async () => {
    const s = await makeShop("courier-validate");
    expect((await saveCourier(s.scope, { name: "x", kind: "person" })).ok).toBe(false);
    expect((await saveCourier(s.scope, { name: "مندوب", kind: "bike" })).ok).toBe(false);
    expect((await saveCourier(s.scope, { name: "مندوب", kind: "person", phone: "0961234567" })).ok).toBe(false);
    const r = await saveCourier(s.scope, { name: "مندوب", kind: "company", phone: "+218 91 234 5678", notes: "شركة" });
    if (!r.ok) throw new Error(r.error);
    expect((await listCouriers(s.scope))[0]).toMatchObject({ phone: "0912345678", kind: "company" });
    expect((await saveCourier(forStore(db, (await makeShop("other-c")).id), { id: r.data.id, name: "اختراق", kind: "person" })).ok).toBe(false);
  });
});

describe("قائمة الطلبيات والزبائن", () => {
  it("فلاتر وبحث وعدّادات الحالات وصفحات", async () => {
    const s = await makeShop("list", 200);
    const c = await courier(s, "مندوب القائمة");
    const orders = [];
    for (let i = 0; i < 6; i++) orders.push(await place(s, { name: i === 0 ? "خالد التاجوري" : `زبون ${i}`, cityId: i % 2 ? benghazi : tripoli, paymentMethod: "cod" }, 1));
    await go(s, orders[0]!.orderId, "confirmed");
    await go(s, orders[1]!.orderId, "cancelled");
    await go(s, orders[2]!.orderId, "confirmed"); await go(s, orders[2]!.orderId, "with_courier", { courierId: c });

    const all = await listOrders(s.scope, {});
    expect(all).toMatchObject({ total: 6, allCount: 6, counts: { new: 3, confirmed: 1, cancelled: 1, with_courier: 1 } });
    expect(all.items[0]!.number).toBeGreaterThan(all.items.at(-1)!.number); // الأحدث أول
    const confirmed = await listOrders(s.scope, { status: "confirmed" });
    expect(confirmed.items.map((i) => i.id)).toEqual([orders[0]!.orderId]);
    expect(confirmed.counts.new).toBe(3); // العدّادات ما تتأثرش بفلتر الحالة

    expect((await listOrders(s.scope, { q: "خالد" })).total).toBe(1);
    expect((await listOrders(s.scope, { q: String(orders[3]!.number) })).items.map((i) => i.id)).toEqual([orders[3]!.orderId]);
    expect((await listOrders(s.scope, { q: `#${orders[3]!.number}` })).total).toBe(1);
    expect((await listOrders(s.scope, { q: "%" })).total).toBe(0);
    expect((await listOrders(s.scope, { cityId: benghazi })).total).toBe(3);
    expect((await listOrders(s.scope, { cityId: benghazi, status: "new" })).total).toBe(2);
    expect((await listOrders(s.scope, { courierId: c })).items[0]!.courierName).toBe("مندوب القائمة");
    expect((await listOrders(s.scope, { payment: "bank_transfer" })).total).toBe(0);
    expect((await listOrders(s.scope, { from: Date.now() + 86_400_000 })).total).toBe(0);
    expect((await listOrders(s.scope, { to: Date.now() + 1000, from: Date.now() - 100_000 })).total).toBe(6);
    const p2 = await listOrders(s.scope, { pageSize: 4, page: 2 });
    expect(p2).toMatchObject({ page: 2, pageCount: 2 });
    expect(p2.items).toHaveLength(2);
    expect((await listOrders(s.scope, { pageSize: 4, page: 99 })).page).toBe(2);
  });

  it("الزبائن: بحث وعلامة مزعج وكثير الإرجاع", async () => {
    const s = await makeShop("cust", 100);
    const c = await courier(s);
    const send = async (phone: string, name: string, ret: boolean) => {
      const o = await place(s, { phone, name }, 1);
      await go(s, o.orderId, "confirmed"); await go(s, o.orderId, "with_courier", { courierId: c });
      if (ret) await registerReturn(s.scope, { orderId: o.orderId, reason: "refused" }, null); else await go(s, o.orderId, "delivered");
    };
    await send("0911110001", "ممتاز", false); await send("0911110001", "ممتاز", false);
    await send("0911110002", "مرتجع", true); await send("0911110002", "مرتجع", true); await send("0911110002", "مرتجع", false);

    const all = await listCustomers(s.scope, {});
    expect(all.total).toBe(2);
    const good = all.items.find((x) => x.phone === "0911110001")!;
    expect(good).toMatchObject({ ordersCount: 2, deliveredCount: 2, returnedCount: 0, totalSpent: 120_000 });
    expect((await listCustomers(s.scope, { flag: "returns" })).items.map((x) => x.name)).toEqual(["مرتجع"]);
    expect((await listCustomers(s.scope, { q: "0911110001" })).total).toBe(1);
    expect((await listCustomers(s.scope, { q: "ممتاز" })).total).toBe(1);
    expect((await listCustomers(s.scope, { q: "%" })).total).toBe(0);

    expect((await setCustomerFlag(s.scope, good.id, "problematic", "ما بيرد")).ok).toBe(true);
    expect((await listCustomers(s.scope, { flag: "problematic" })).items.map((x) => x.id)).toEqual([good.id]);
    const detail = await getCustomerDetail(s.scope, good.id);
    expect(detail!.customer).toMatchObject({ flag: "problematic", notes: "ما بيرد" });
    expect(detail!.orders).toHaveLength(2);
    expect((await listOrders(s.scope, {})).items.filter((i) => i.flagged)).toHaveLength(2);
    expect((await setCustomerFlag(s.scope, good.id, "none", null)).ok).toBe(true);
    expect((await setCustomerFlag(s.scope, "ghost", "none", null)).ok).toBe(false);
    expect(await getCustomerDetail(forStore(db, (await makeShop("cust-other")).id), good.id)).toBeNull();
  });
});

describe("إحصائيات الرئيسية", () => {
  it("المبيعات والعدّادات والرسم ومعدل المرتجعات والمخزون المنخفض", async () => {
    const s = await makeShop("stats", 100);
    const c = await courier(s);
    const now = Date.now();
    const day = 86_400_000;
    const mk = async (qty: number, ageDays: number, to?: "cancelled" | "delivered" | "returned") => {
      const o = await place(s, {}, qty);
      if (to === "cancelled") await go(s, o.orderId, "cancelled");
      if (to === "delivered" || to === "returned") {
        await go(s, o.orderId, "confirmed"); await go(s, o.orderId, "with_courier", { courierId: c });
        if (to === "delivered") await go(s, o.orderId, "delivered"); else await registerReturn(s.scope, { orderId: o.orderId, reason: "refused" }, null);
      }
      await s.scope.update(t.orders, { createdAt: new Date(startOfDay(now) - ageDays * day + 3 * 3_600_000) }, eq(t.orders.id, o.orderId));
    };
    await mk(1, 0); // اليوم: 60
    await mk(2, 0, "delivered"); // اليوم: 110
    await mk(1, 3, "delivered"); // قبل 3 أيام: 60
    await mk(1, 10, "delivered"); // قبل 10 أيام (الشهر فقط): 60
    await mk(1, 20, "returned"); // مرتجع: ما ينحسبش مبيعات
    await mk(3, 1, "cancelled"); // ملغي: ما ينحسبش
    await mk(1, 45, "delivered"); // خارج الشهر

    const st = await getDashboardStats(s.scope, now);
    expect(st.sales.today).toEqual({ total: 170_000, orders: 2 });
    expect(st.sales.week).toEqual({ total: 230_000, orders: 3 });
    expect(st.sales.month).toEqual({ total: 290_000, orders: 4 });
    expect(st.newOrders).toBe(1);
    expect(st.chart).toHaveLength(7);
    expect(st.chart.at(-1)).toMatchObject({ total: 170_000, orders: 2 });
    expect(st.chart.at(-4)).toMatchObject({ total: 60_000, orders: 1 });
    expect(st.chart.reduce((x, d) => x + d.total, 0)).toBe(230_000);
    expect(st.returnRate).toBeCloseTo(1 / 4, 5); // مرتجع واحد من 4 (3 مسلّمة + 1 مرتجع خلال 30 يوم)
    expect(st.cashWithCouriers).toBe(110_000 + 60_000 + 60_000 + 60_000);
    expect(st.lowStock).toEqual([]);

    await s.scope.update(t.productVariants, { stock: 2 }, eq(t.productVariants.id, s.variantId));
    expect((await getDashboardStats(s.scope, now)).lowStock).toEqual([{ id: s.productId, name: "عطر", stock: 2, variants: 1 }]);
    expect((await getDashboardStats(s.scope, now)).pendingReceipts).toBe(0);
  });

  it("متجر بدون طلبيات", async () => {
    const s = await makeShop("stats-empty");
    const st = await getDashboardStats(s.scope);
    expect(st).toMatchObject({ newOrders: 0, returnRate: null, cashWithCouriers: 0, lowStockCount: 0 });
    expect(st.sales.today).toEqual({ total: 0, orders: 0 });
    expect(st.chart.every((d) => d.total === 0)).toBe(true);
  });

  it("حدود اليوم بتوقيت ليبيا (UTC+2)", () => {
    const utc2330 = Date.UTC(2026, 0, 10, 23, 30); // 01:30 يوم 11 بتوقيت ليبيا
    expect(startOfDay(utc2330)).toBe(Date.UTC(2026, 0, 10, 22, 0));
    expect(startOfDay(Date.UTC(2026, 0, 10, 21, 59))).toBe(Date.UTC(2026, 0, 9, 22, 0));
  });
});
