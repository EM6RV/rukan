import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cities, media, plans, storeDomains, stores, users } from "@/db/schema/platform";
import type { PlanLimits } from "@/db/schema/platform";
import { contrastRatio, mix, readableOn } from "@/lib/contrast";
import { discountPercent, priceRange, variantCompareAt, variantPrice } from "@/lib/pricing";
import { saveCategory } from "@/server/catalog/categories";
import { saveProduct } from "@/server/catalog/products";
import { checkCoupon, createOrder, getOrderByToken, trackOrder } from "@/server/orders/create";
import { loadPage, loadStorefront, queryDeliveryRates, queryProductDetail, queryProducts, queryRelated, querySitemap, resolveCart } from "@/server/storefront/queries";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t, type StoreScope } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

const GROWTH: PlanLimits = { maxProducts: null, maxStaff: 3, allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: false, removeBranding: false };
const STARTER: PlanLimits = { ...GROWTH, coupons: false };

let db: Db;
let close: () => void;
let n = 0;
let tripoli: string, benghazi: string, sebha: string;

type Shop = { id: string; scope: StoreScope; slug: string };

async function makeShop(slug: string, opts: { planLimits?: PlanLimits; freeOver?: number | null; bank?: boolean } = {}): Promise<Shop> {
  const [plan] = await db.insert(plans).values({ slug: `plan-${slug}`, nameAr: "x", price: 1, limits: opts.planLimits ?? GROWTH }).returning();
  const [u] = await db.insert(users).values({ phone: `0913${String(++n).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  const id = r.data.storeId;
  await db.update(stores).set({ planId: plan!.id, onboardedAt: new Date(), onboardingStep: 6 }).where(eq(stores.id, id));
  const scope = forStore(db, id);
  await scope.insert(t.deliveryRates, [
    { cityId: tripoli, fee: 10_000, etaText: "يوم" }, { cityId: benghazi, fee: 25_000 }, { cityId: sebha, fee: 40_000, isActive: false },
  ]);
  await scope.update(t.storeSettings, { freeDeliveryOver: opts.freeOver ?? null, cityId: tripoli });
  if (opts.bank) await scope.update(t.storePaymentMethods, { isEnabled: true, config: { bankName: "x", accountNumber: "1" } }, eq(t.storePaymentMethods.method, "bank_transfer"));
  return { id, scope, slug };
}

const mkProduct = async (s: Shop, over: Record<string, unknown> = {}) => {
  const r = await saveProduct(s.scope, { name: "عطر", price: 50_000, variants: [{ valueIds: [], stock: 10 }], ...over }, { limits: GROWTH });
  if (!r.ok) throw new Error(r.error);
  const [v] = await s.scope.from(t.productVariants, eq(t.productVariants.productId, r.data.id));
  return { productId: r.data.id, variantId: v!.id };
};
const order = (s: Shop, items: { variantId: string; quantity: number }[], over: Record<string, unknown> = {}) =>
  createOrder(db, s.id, { items, name: "سالم المختار", phone: "0912345678", cityId: tripoli, address: "طرابلس، شارع الجمهورية", paymentMethod: "cod", ...over });
const stockOf = async (s: Shop, variantId: string) => (await s.scope.from(t.productVariants, eq(t.productVariants.id, variantId)))[0]!.stock;

beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  const rows = await db.insert(cities).values([{ nameAr: "طرابلس", region: "west", sortOrder: 1 }, { nameAr: "بنغازي", region: "east", sortOrder: 2 }, { nameAr: "سبها", region: "south", sortOrder: 3 }]).returning();
  [tripoli, benghazi, sebha] = rows.map((r) => r.id) as [string, string, string];
});
afterAll(() => close());

describe("أدوات التسعير والألوان", () => {
  it("سعر المتغير والسعر القديم", () => {
    const p = { price: 100, compareAtPrice: 150 };
    expect(variantPrice(p, { price: null, compareAtPrice: null })).toBe(100);
    expect(variantPrice(p, { price: 120, compareAtPrice: null })).toBe(120);
    expect(variantCompareAt(p, { price: null, compareAtPrice: null })).toBe(150);
    expect(variantCompareAt(p, { price: 120, compareAtPrice: null })).toBeNull(); // السعر القديم للمنتج ما ينطبقش على سعر خاص
    expect(variantCompareAt(p, { price: 120, compareAtPrice: 200 })).toBe(200);
    expect(variantCompareAt({ price: 100, compareAtPrice: 90 }, { price: null, compareAtPrice: null })).toBeNull();
    expect(discountPercent(100, 150)).toBe(33);
    expect(discountPercent(100, null)).toBeNull();
    expect(priceRange(p, [{ price: null, compareAtPrice: null }, { price: 80, compareAtPrice: 100 }])).toEqual({ min: 80, max: 100, compareAt: 100 });
    expect(priceRange(p, [])).toEqual({ min: 100, max: 100, compareAt: 150 });
  });

  it("لون النص المقروء", () => {
    expect(readableOn("#0D263E")).toBe("#FFFFFF");
    expect(readableOn("#FFFFFF")).toBe("#0D263E");
    expect(readableOn("#C19E58")).toBe("#0D263E"); // الذهبي: نص كحلي مش أبيض
    expect(readableOn("#111111")).toBe("#FFFFFF");
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("إنشاء الطلب", () => {
  it("طلب عادي: المجاميع والمخزون والزبون والسجل", async () => {
    const s = await makeShop("shop-basic");
    const p = await mkProduct(s, { name: "عطر ملكي", price: 50_000, costPrice: 30_000 });
    const r = await order(s, [{ variantId: p.variantId, quantity: 2 }]);
    if (!r.ok) throw new Error(r.error);
    expect(r.data).toMatchObject({ number: 1001, total: 110_000, paymentMethod: "cod" });
    expect(r.data.trackingToken).toHaveLength(20);

    const [o] = await s.scope.from(t.orders);
    expect(o).toMatchObject({ status: "new", subtotal: 100_000, discount: 0, deliveryFee: 10_000, total: 110_000, customerPhone: "0912345678", cityName: "طرابلس", paymentStatus: "pending" });
    const [item] = await s.scope.from(t.orderItems);
    expect(item).toMatchObject({ name: "عطر ملكي", unitPrice: 50_000, unitCost: 30_000, quantity: 2 });
    expect(await stockOf(s, p.variantId)).toBe(8);
    const moves = await s.scope.from(t.stockMovements, eq(t.stockMovements.reason, "order"));
    expect(moves.map((m) => m.delta)).toEqual([-2]);
    expect((await s.scope.from(t.orderStatusHistory)).map((h) => h.toStatus)).toEqual(["new"]);
    expect(await s.scope.count(t.customers)).toBe(1);

    // نفس الزبون: رقم الطلبية يزيد، والعدّاد يزيد، والاسم يتحدث
    const r2 = await order(s, [{ variantId: p.variantId, quantity: 1 }], { name: "سالم محمد", phone: "+218 91 234 5678" });
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.data.number).toBe(1002);
    const [c] = await s.scope.from(t.customers);
    expect(c).toMatchObject({ ordersCount: 2, name: "سالم محمد" });
    expect(await s.scope.count(t.customers)).toBe(1);
  });

  it("الأسعار من القاعدة (سعر المتغير الخاص) والخيارات في الاسم", async () => {
    const s = await makeShop("shop-variants");
    const saved = await saveProduct(s.scope, {
      name: "تيشرت", price: 20_000, options: [{ id: "o", name: "المقاس", values: [{ id: "a", value: "S" }, { id: "b", value: "L" }] }],
      variants: [{ valueIds: ["a"], stock: 5 }, { valueIds: ["b"], stock: 5, price: 30_000 }],
    }, { limits: GROWTH });
    if (!saved.ok) throw new Error(saved.error);
    const vs = await s.scope.from(t.productVariants, eq(t.productVariants.productId, saved.data.id));
    const large = vs.find((v) => v.price === 30_000)!;
    const r = await order(s, [{ variantId: large.id, quantity: 1 }], { price: 1, total: 1 }); // حقول زايدة من العميل تتجاهل
    if (!r.ok) throw new Error(r.error);
    expect(r.data.total).toBe(40_000);
    const [item] = await s.scope.from(t.orderItems);
    expect(item).toMatchObject({ unitPrice: 30_000, variantLabel: "L" });
  });

  it("المخزون: لا بيع زايد، والسباق يبيع المتوفر فقط", async () => {
    const s = await makeShop("shop-stock");
    const p = await mkProduct(s, { variants: [{ valueIds: [], stock: 3 }] });
    expect(await order(s, [{ variantId: p.variantId, quantity: 4 }])).toEqual({ ok: false, error: expect.stringContaining("المتوفر منه 3") });
    expect(await stockOf(s, p.variantId)).toBe(3);

    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => order(s, [{ variantId: p.variantId, quantity: 1 }], { phone: `091234560${i}` })));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(await stockOf(s, p.variantId)).toBe(0);
    const numbers = (await s.scope.from(t.orders)).map((o) => o.number).sort();
    expect(numbers).toEqual([1001, 1002, 1003]); // أرقام متسلسلة بدون فجوات أو تكرار
    expect(results.find((r) => !r.ok)).toMatchObject({ error: expect.stringContaining("نفد") });
    expect(await s.scope.count(t.stockMovements, eq(t.stockMovements.reason, "order"))).toBe(3);
  });

  it("الطلب اللي يفشل ما يترك أثر (rollback كامل)", async () => {
    const s = await makeShop("shop-rollback");
    const a = await mkProduct(s, { name: "أ", variants: [{ valueIds: [], stock: 5 }] });
    const b = await mkProduct(s, { name: "ب", variants: [{ valueIds: [], stock: 1 }] });
    const r = await order(s, [{ variantId: a.variantId, quantity: 2 }, { variantId: b.variantId, quantity: 2 }]);
    expect(r.ok).toBe(false);
    expect(await stockOf(s, a.variantId)).toBe(5);
    expect(await s.scope.count(t.orders)).toBe(0);
    expect(await s.scope.count(t.customers)).toBe(0);
    const [store] = await db.select().from(stores).where(eq(stores.id, s.id));
    expect(store!.nextOrderNumber).toBe(1001); // العدّاد ما اتحركش
  });

  it("منتج من متجر ثاني أو مخفي أو محذوف أو متغير معطل يترفض", async () => {
    const [a, b] = [await makeShop("shop-iso-a"), await makeShop("shop-iso-b")];
    const pa = await mkProduct(a);
    const pb = await mkProduct(b);
    expect(await order(a, [{ variantId: pb.variantId, quantity: 1 }])).toEqual({ ok: false, error: expect.stringContaining("لم يعد متوفراً") });
    expect(await stockOf(b, pb.variantId)).toBe(10);

    await a.scope.update(t.products, { isVisible: false }, eq(t.products.id, pa.productId));
    expect((await order(a, [{ variantId: pa.variantId, quantity: 1 }])).ok).toBe(false);
    await a.scope.update(t.products, { isVisible: true, deletedAt: new Date() }, eq(t.products.id, pa.productId));
    expect((await order(a, [{ variantId: pa.variantId, quantity: 1 }])).ok).toBe(false);
    await a.scope.update(t.products, { deletedAt: null }, eq(t.products.id, pa.productId));
    await a.scope.update(t.productVariants, { isActive: false }, eq(t.productVariants.id, pa.variantId));
    expect((await order(a, [{ variantId: pa.variantId, quantity: 1 }])).ok).toBe(false);
    await a.scope.update(t.productVariants, { isActive: true }, eq(t.productVariants.id, pa.variantId));
    expect((await order(a, [{ variantId: pa.variantId, quantity: 1 }])).ok).toBe(true);
  });

  it("التوصيل: مدينة غير مخدومة، وتوصيل مجاني فوق مبلغ", async () => {
    const s = await makeShop("shop-delivery", { freeOver: 100_000 });
    const p = await mkProduct(s, { price: 60_000 });
    expect(await order(s, [{ variantId: p.variantId, quantity: 1 }], { cityId: sebha })).toEqual({ ok: false, error: expect.stringContaining("ما نوصلوش") });
    expect(await order(s, [{ variantId: p.variantId, quantity: 1 }], { cityId: "fake" })).toMatchObject({ ok: false });
    const small = await order(s, [{ variantId: p.variantId, quantity: 1 }], { cityId: benghazi });
    expect(small).toMatchObject({ ok: true, data: { total: 85_000 } }); // 60 + 25
    const big = await order(s, [{ variantId: p.variantId, quantity: 2 }], { cityId: benghazi });
    expect(big).toMatchObject({ ok: true, data: { total: 120_000 } }); // مجاني
  });

  it("الدفع: عند الاستلام والتحويل بإيصال", async () => {
    const s = await makeShop("shop-pay", { bank: true });
    const other = await makeShop("shop-pay-other");
    const p = await mkProduct(s);
    const line = [{ variantId: p.variantId, quantity: 1 }];
    const mk = async (storeId: string, isPrivate: boolean) => (await db.insert(media).values({ storeId, mime: "image/webp", size: 1, driver: "turso", isPrivate }).returning())[0]!.id;

    expect(await order(s, line, { paymentMethod: "bank_transfer" })).toEqual({ ok: false, error: expect.stringContaining("إيصال") });
    expect((await order(s, line, { paymentMethod: "bank_transfer", receiptMediaId: await mk(other.id, true) })).ok).toBe(false); // إيصال متجر ثاني
    expect((await order(s, line, { paymentMethod: "bank_transfer", receiptMediaId: await mk(s.id, false) })).ok).toBe(false); // مش خاص
    const good = await order(s, line, { paymentMethod: "bank_transfer", receiptMediaId: await mk(s.id, true) });
    if (!good.ok) throw new Error(good.error);
    expect(await s.scope.count(t.paymentReceipts)).toBe(1);

    const noBank = await makeShop("shop-nobank");
    const p2 = await mkProduct(noBank);
    expect(await order(noBank, [{ variantId: p2.variantId, quantity: 1 }], { paymentMethod: "bank_transfer", receiptMediaId: "x" })).toEqual({ ok: false, error: expect.stringContaining("غير متاحة") });
    expect(await order(noBank, [{ variantId: p2.variantId, quantity: 1 }], { paymentMethod: "gateway" })).toMatchObject({ ok: false });
  });

  it("المتجر المنتهي أو الموقوف ما يستقبلش طلبات", async () => {
    const s = await makeShop("shop-closed");
    const p = await mkProduct(s);
    const line = [{ variantId: p.variantId, quantity: 1 }];
    await db.update(stores).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(stores.id, s.id));
    expect(await order(s, line)).toEqual({ ok: false, error: expect.stringContaining("مغلق") });
    await db.update(stores).set({ trialEndsAt: new Date(Date.now() + 86_400_000), status: "suspended" }).where(eq(stores.id, s.id));
    expect((await order(s, line)).ok).toBe(false);
    expect(await stockOf(s, p.variantId)).toBe(10);
  });

  it("تحقق المدخلات برسائل عربية", async () => {
    const s = await makeShop("shop-validate");
    const p = await mkProduct(s);
    const line = [{ variantId: p.variantId, quantity: 1 }];
    expect(await order(s, line, { phone: "0961234567" })).toEqual({ ok: false, error: expect.stringContaining("رقم الهاتف") });
    expect(await order(s, line, { address: "x" })).toEqual({ ok: false, error: expect.stringContaining("العنوان") });
    expect(await order(s, line, { name: "ا" })).toMatchObject({ ok: false });
    expect(await order(s, [])).toEqual({ ok: false, error: "السلة فاضية" });
    expect((await order(s, [{ variantId: p.variantId, quantity: 0 }])).ok).toBe(false);
    expect((await order(s, [{ variantId: p.variantId, quantity: 21 }])).ok).toBe(false);
    expect((await order(s, [{ variantId: p.variantId, quantity: 1.5 }])).ok).toBe(false);
    expect(await order(s, line, { notes: "x".repeat(301) })).toMatchObject({ ok: false });
    expect(await order(s, line, { paymentMethod: undefined })).toMatchObject({ ok: false });
  });
});

describe("الكوبونات", () => {
  const coupon = (s: Shop, over: Record<string, unknown> = {}) =>
    s.scope.insert(t.coupons, { code: "SAVE10", type: "percent", value: 10, ...over } as never).then((r) => r[0]!);

  it("نسبة ومبلغ ثابت وتحقق الشروط", async () => {
    const s = await makeShop("shop-coupons");
    await coupon(s, { code: "PCT", type: "percent", value: 10, minOrder: 40_000 });
    await coupon(s, { code: "FIX", type: "fixed", value: 500_000 });
    await coupon(s, { code: "OFF", isActive: false });
    await coupon(s, { code: "OLD", expiresAt: new Date(Date.now() - 1000) });
    await coupon(s, { code: "SOON", startsAt: new Date(Date.now() + 86_400_000) });
    await coupon(s, { code: "FULL", maxUses: 1, usedCount: 1 });

    expect(await checkCoupon(s.scope, "pct", 100_000)).toMatchObject({ ok: true, discount: 10_000 }); // حساسية الحروف
    expect(await checkCoupon(s.scope, "PCT", 30_000)).toEqual({ ok: false, error: expect.stringContaining("الحد الأدنى") });
    expect(await checkCoupon(s.scope, "FIX", 100_000)).toMatchObject({ ok: true, discount: 100_000 }); // ما يزيدش عن المجموع
    for (const [code, msg] of [["OFF", "ما لقينا"], ["OLD", "انتهى"], ["SOON", "ما بدا"], ["FULL", "استعماله"], ["NOPE", "ما لقينا"], ["", "اكتب"]] as const) {
      expect(await checkCoupon(s.scope, code, 100_000), code).toEqual({ ok: false, error: expect.stringContaining(msg) });
    }
  });

  it("الطلب بكوبون: الخصم والتوصيل والاستهلاك والاستخدام الأقصى", async () => {
    const s = await makeShop("shop-coupon-order", { freeOver: 90_000 });
    const p = await mkProduct(s, { price: 100_000, variants: [{ valueIds: [], stock: 10 }] });
    const c = await coupon(s, { code: "ONCE", type: "percent", value: 20, maxUses: 1 });
    const line = [{ variantId: p.variantId, quantity: 1 }];

    const r = await order(s, line, { couponCode: "once" });
    if (!r.ok) throw new Error(r.error);
    expect(r.data.total).toBe(90_000); // 100 - 20% = 80، والخصم نزّل الطلب تحت حد التوصيل المجاني (90) فانضاف 10
    const [o] = await s.scope.from(t.orders);
    expect(o).toMatchObject({ subtotal: 100_000, discount: 20_000, deliveryFee: 10_000, couponCode: "ONCE" });
    expect((await s.scope.from(t.coupons, eq(t.coupons.id, c.id)))[0]!.usedCount).toBe(1);
  });

  it("التوصيل المجاني يتحسب بعد الخصم", async () => {
    const s = await makeShop("shop-coupon-free", { freeOver: 90_000 });
    const p = await mkProduct(s, { price: 100_000 });
    await coupon(s, { code: "TEN", type: "percent", value: 5 });
    const r = await order(s, [{ variantId: p.variantId, quantity: 1 }], { couponCode: "TEN" });
    expect(r).toMatchObject({ ok: true, data: { total: 95_000 } }); // 100 - 5 = 95 >= 90 → توصيل مجاني
  });

  it("الكوبون بعد الاستهلاك + rollback كامل عند الفشل", async () => {
    const s = await makeShop("shop-coupon-limit");
    const p = await mkProduct(s, { price: 100_000, variants: [{ valueIds: [], stock: 10 }] });
    const c = await coupon(s, { code: "ONCE", type: "fixed", value: 10_000, maxUses: 1 });
    const line = [{ variantId: p.variantId, quantity: 1 }];
    expect((await order(s, line, { couponCode: "ONCE" })).ok).toBe(true);
    expect(await order(s, line, { couponCode: "ONCE" })).toEqual({ ok: false, error: expect.stringContaining("استعماله") });
    expect(await stockOf(s, p.variantId)).toBe(9); // الطلب الفاشل ما خصمش مخزون
    expect((await s.scope.from(t.coupons, eq(t.coupons.id, c.id)))[0]!.usedCount).toBe(1);
    expect(await s.scope.count(t.couponRedemptions)).toBe(1);
    expect(await s.scope.count(t.orders)).toBe(1);
  });

  it("سباق على كوبون باستخدام واحد: طلب واحد بس ينجح", async () => {
    const s = await makeShop("shop-coupon-race");
    const p = await mkProduct(s, { price: 100_000, variants: [{ valueIds: [], stock: 10 }] });
    await coupon(s, { code: "RACE", type: "fixed", value: 1_000, maxUses: 1 });
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => order(s, [{ variantId: p.variantId, quantity: 1 }], { couponCode: "RACE", phone: `091999000${i}` })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await stockOf(s, p.variantId)).toBe(9);
  });

  it("باقة بدون ميزة الكوبونات", async () => {
    const s = await makeShop("shop-no-coupons", { planLimits: STARTER });
    const p = await mkProduct(s);
    await coupon(s, { code: "X10" });
    expect(await order(s, [{ variantId: p.variantId, quantity: 1 }], { couponCode: "X10" })).toEqual({ ok: false, error: expect.stringContaining("غير متاح") });
  });

  it("كوبون متجر ثاني ما ينفعش", async () => {
    const [a, b] = [await makeShop("shop-cp-a"), await makeShop("shop-cp-b")];
    await coupon(b, { code: "ONLYB" });
    expect(await checkCoupon(a.scope, "ONLYB", 100_000)).toMatchObject({ ok: false });
  });
});

describe("التتبع", () => {
  it("بالـ token وبرقم الطلبية + الهاتف", async () => {
    const [a, b] = [await makeShop("shop-track-a"), await makeShop("shop-track-b")];
    const p = await mkProduct(a, { name: "منتج التتبع" });
    const r = await order(a, [{ variantId: p.variantId, quantity: 2 }], { couponCode: undefined });
    if (!r.ok) throw new Error(r.error);

    const byToken = await getOrderByToken(a.scope, r.data.trackingToken);
    expect(byToken).toMatchObject({ number: 1001, status: "new", items: [{ name: "منتج التتبع", quantity: 2 }], history: [{ status: "new" }] });
    expect(await getOrderByToken(b.scope, r.data.trackingToken)).toBeNull(); // متجر ثاني
    expect(await getOrderByToken(a.scope, "short")).toBeNull();

    expect(await trackOrder(a.scope, 1001, "091 234 5678")).toMatchObject({ number: 1001 });
    expect(await trackOrder(a.scope, 1001, "+218912345678")).toMatchObject({ number: 1001 });
    expect(await trackOrder(a.scope, 1001, "0919999999")).toBeNull(); // هاتف غلط
    expect(await trackOrder(a.scope, 1002, "0912345678")).toBeNull(); // رقم غلط
    expect(await trackOrder(a.scope, 1001, "xx")).toBeNull();
    expect(await trackOrder(b.scope, 1001, "0912345678")).toBeNull(); // نفس الرقم في متجر ثاني
    expect(await trackOrder(a.scope, Number.NaN, "0912345678")).toBeNull();
  });
});

describe("استعلامات الواجهة", () => {
  it("المتجر: slug ودومين خاص متحقق وغير مكتمل الإعداد", async () => {
    const s = await makeShop("shop-sf", { planLimits: { ...GROWTH, customDomain: true } });
    const sf = (await loadStorefront(db, "SHOP-SF"))!;
    expect(sf).toMatchObject({ id: s.id, name: "shop-sf", status: "trial", template: "naqa" });
    expect(sf.pages.map((p) => p.slug)).toContain("about");
    expect(sf.payments.map((p) => p.method)).toEqual(["cod"]);
    expect(sf.limits.coupons).toBe(true);
    expect(sf.homeSections.map((h) => h.type)).toEqual(["hero", "categories", "featured"]);

    expect(await loadStorefront(db, "nope")).toBeNull();
    await db.insert(storeDomains).values({ storeId: s.id, domain: "shop.example.com", status: "pending" });
    expect(await loadStorefront(db, "shop.example.com")).toBeNull(); // غير متحقق
    await db.update(storeDomains).set({ status: "verified" }).where(eq(storeDomains.domain, "shop.example.com"));
    expect((await loadStorefront(db, "Shop.Example.com"))?.id).toBe(s.id);

    await db.update(stores).set({ onboardedAt: null }).where(eq(stores.id, s.id));
    expect(await loadStorefront(db, "shop-sf")).toBeNull();
  });

  it("المنتجات: فلاتر وفرز وصفحات وبحث، المخفي والمحذوف ما يظهرش", async () => {
    const s = await makeShop("shop-catalog");
    const cat = await saveCategory(s.scope, { name: "عطور" });
    if (!cat.ok) throw new Error("setup");
    const hiddenCat = await saveCategory(s.scope, { name: "مخفي", isVisible: false });
    if (!hiddenCat.ok) throw new Error("setup");
    const make = (name: string, price: number, extra: Record<string, unknown> = {}) => saveProduct(s.scope, { name, price, variants: [{ valueIds: [], stock: 5 }], ...extra }, { limits: GROWTH });
    await make("رخيص", 10_000, { categoryIds: [cat.data.id] });
    await make("متوسط 100%", 50_000, { isFeatured: true });
    await make("غالي", 90_000, { categoryIds: [cat.data.id], isFeatured: true });
    await make("مخفي", 1, { isVisible: false });
    await make("منفد", 20_000, { variants: [{ valueIds: [], stock: 0 }] });
    const gone = await make("محذوف", 5);
    if (!gone.ok) throw new Error("setup");
    await s.scope.update(t.products, { deletedAt: new Date() }, eq(t.products.id, gone.data.id));

    const all = await queryProducts(s.scope, {});
    expect(all.total).toBe(4);
    expect(all.items.find((i) => i.name === "منفد")).toMatchObject({ inStock: false });
    expect(all.items.find((i) => i.name === "رخيص")).toMatchObject({ inStock: true, price: 10_000, hasOptions: false });
    expect((await queryProducts(s.scope, { sort: "price_asc" })).items.map((i) => i.price)).toEqual([10_000, 20_000, 50_000, 90_000]);
    expect((await queryProducts(s.scope, { sort: "price_desc" })).items[0]!.name).toBe("غالي");
    expect((await queryProducts(s.scope, { featured: true })).total).toBe(2);
    expect((await queryProducts(s.scope, { categorySlug: "عطور" })).items.map((i) => i.name).sort()).toEqual(["رخيص", "غالي"]);
    expect((await queryProducts(s.scope, { categorySlug: "مخفي" })).total).toBe(0); // قسم مخفي
    expect((await queryProducts(s.scope, { categorySlug: "غير-موجود" })).total).toBe(0);
    expect((await queryProducts(s.scope, { q: "100%" })).total).toBe(1);
    expect((await queryProducts(s.scope, { q: "%" })).total).toBe(1); // % مش wildcard
    expect((await queryProducts(s.scope, { pageSize: 2, page: 2 })).items).toHaveLength(2);
    expect((await queryProducts(s.scope, { pageSize: 2, page: 9 })).page).toBe(2);
  });

  it("تفاصيل المنتج: المتغيرات النشطة والأسعار الفعلية والخيارات", async () => {
    const s = await makeShop("shop-detail");
    const saved = await saveProduct(s.scope, {
      name: "فستان", price: 100_000, compareAtPrice: 150_000, description: "وصف",
      options: [{ id: "o", name: "المقاس", values: [{ id: "a", value: "S" }, { id: "b", value: "M" }, { id: "c", value: "L" }] }],
      variants: [
        { valueIds: ["a"], stock: 2 }, { valueIds: ["b"], stock: 0, price: 120_000 }, { valueIds: ["c"], stock: 4, isActive: false },
      ],
    }, { limits: GROWTH });
    if (!saved.ok) throw new Error(saved.error);
    const d = (await queryProductDetail(s.scope, "فستان"))!;
    expect(d.variants).toHaveLength(2); // L معطل
    expect(d.variants.find((v) => v.price === 100_000)).toMatchObject({ compareAt: 150_000, stock: 2 });
    expect(d.variants.find((v) => v.price === 120_000)).toMatchObject({ compareAt: null, stock: 0 });
    expect(d).toMatchObject({ price: 100_000, compareAt: 150_000 });
    expect(d.options[0]!.values.map((v) => v.value)).toEqual(["S", "M", "L"]);
    expect(await queryProductDetail(s.scope, "ghost")).toBeNull();
  });

  it("السلة: تقص الكمية، تدمج المكرر، وتشيل غير المتاح والأجنبي", async () => {
    const [a, b] = [await makeShop("shop-cart-a"), await makeShop("shop-cart-b")];
    const pa = await mkProduct(a, { variants: [{ valueIds: [], stock: 3 }] });
    const pb = await mkProduct(b);
    const out = await mkProduct(a, { name: "منفد", variants: [{ valueIds: [], stock: 0 }] });
    const lines = await resolveCart(a.scope, [
      { variantId: pa.variantId, quantity: 2 }, { variantId: pa.variantId, quantity: 5 }, { variantId: out.variantId, quantity: 1 },
      { variantId: pb.variantId, quantity: 1 }, { variantId: "ghost", quantity: 1 }, { variantId: pa.variantId, quantity: -1 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ variantId: pa.variantId, quantity: 3, stock: 3, price: 50_000 });
  });

  it("التوصيل، الصفحات، المنتجات المشابهة، خريطة الموقع", async () => {
    const s = await makeShop("shop-misc");
    const rates = await queryDeliveryRates(db, s.scope);
    expect(rates.map((r) => r.city)).toEqual(["طرابلس", "بنغازي"]); // سبها معطلة
    expect(rates[0]).toMatchObject({ fee: 10_000, eta: "يوم" });

    expect(await loadPage(s.scope, "about")).toMatchObject({ title: "من نحن" });
    expect(await loadPage(s.scope, "nope")).toBeNull();
    await s.scope.update(t.storePages, { isPublished: false }, eq(t.storePages.slug, "privacy"));
    expect(await loadPage(s.scope, "privacy")).toBeNull();

    const cat = await saveCategory(s.scope, { name: "قسم" });
    if (!cat.ok) throw new Error("setup");
    const p1 = await saveProduct(s.scope, { name: "أول", price: 1, categoryIds: [cat.data.id], variants: [{ valueIds: [], stock: 1 }] }, { limits: GROWTH });
    await saveProduct(s.scope, { name: "ثاني", price: 2, categoryIds: [cat.data.id], variants: [{ valueIds: [], stock: 1 }] }, { limits: GROWTH });
    await saveProduct(s.scope, { name: "ثالث", price: 3, variants: [{ valueIds: [], stock: 1 }] }, { limits: GROWTH });
    if (!p1.ok) throw new Error("setup");
    expect((await queryRelated(s.scope, p1.data.id, [cat.data.id])).map((p) => p.name)).toEqual(["ثاني"]);
    expect(await queryRelated(s.scope, p1.data.id, [])).toEqual([]);

    const map = await querySitemap(s.scope);
    expect(map.products).toHaveLength(3);
    expect(map.categories).toEqual([{ slug: "قسم" }]);
    expect(map.pages.map((p) => p.slug).sort()).toEqual(["about", "contact", "returns", "shipping"]);
  });
});
