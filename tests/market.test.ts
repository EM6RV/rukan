import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { plans, storeMembers, stores, users } from "@/db/schema/platform";
import { withCheckDigit } from "@/lib/barcode";
import { LINE_PLANS } from "@/lib/plan-catalog";
import { saveProduct } from "@/server/catalog/products";
import { receiveInvoice, saveInvoice, saveSupplier } from "@/server/inventory/purchasing";
import { closeStocktake, ensureDefaultWarehouse, openStocktake } from "@/server/inventory/warehouses";
import { addBatch, expiringReport, listWriteoffs, remainingByBatch, writeOff } from "@/server/market/batches";
import { addGroceryCategories, generateInternalBarcode, getMarketProduct, lookupBarcode, saveMarketProduct } from "@/server/market/catalog";
import { applySubstitute, markPrepared, pickByScan, prepQueue, proposeSubstitute, suggestSubstitutes } from "@/server/market/prep";
import { savePromotion } from "@/server/market/promotions";
import { createPurchaseOrder, purchaseOrderMessage, getPurchaseOrder, purchaseOrderToInvoice, purchaseSuggestions, supplierDues } from "@/server/market/purchase-orders";
import { marketReport } from "@/server/market/reports";
import { addStocktakeCount, stocktakeVariance } from "@/server/market/stocktake";
import { posBootstrap } from "@/server/pos/bootstrap";
import { createDevice, ensureDefaultBranch, saveRegister } from "@/server/pos/branches";
import { upsertCustomer } from "@/server/pos/customers";
import { applyOps, loadDeviceContext, type DeviceCtx } from "@/server/pos/sync";
import { addStaff } from "@/server/staff-service";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t, type StoreScope } from "@/server/tenant";
import { makeCity, makeTestDb } from "./helpers/db";

const DAY = 86_400_000;
let db: Db;
let close: () => void;
let seq = 0;
const uid = () => randomUUID();
const limits = { maxProducts: null, maxStaff: null, customRoles: false } as never;

type Shop = { storeId: string; ownerId: string; cashierId: string; supervisorId: string; scope: StoreScope; dc: DeviceCtx; milk: string; milkP: string; rice: string; riceP: string; cheese: string; cheeseP: string };

async function shop(slug: string): Promise<Shop> {
  const [u] = await db.insert(users).values({ phone: `0915${String(++seq).padStart(6, "0")}`, name: `مالك ${slug}`, passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug, lines: ["market", "store"] });
  if (!r.ok) throw new Error(r.error);
  const storeId = r.data.storeId;
  await db.update(stores).set({ onboardedAt: new Date() }).where(eq(stores.id, storeId));
  const scope = forStore(db, storeId);
  const mk = async (name: string, price: number, stock: number, cost: number) => {
    const p = await saveProduct(scope, { name, price, costPrice: cost, variants: [{ valueIds: [], stock }] }, { limits });
    if (!p.ok) throw new Error(p.error);
    return { p: p.data.id, v: (await scope.from(t.productVariants, eq(t.productVariants.productId, p.data.id)))[0]!.id };
  };
  const milk = await mk("حليب", 3_000, 48, 2_000);
  const rice = await mk("رز", 5_000, 3, 4_000);
  const cheese = await mk("جبنة بالوزن", 40_000, 5_000, 30_000); // للكيلو، المخزون بالجرام
  const staff = async (role: "cashier" | "shift_supervisor") => {
    const a = await addStaff(db, storeId, u!.id, { name: role, phone: `0925${String(++seq).padStart(6, "0")}`, password: "staff-pass-1", role }, { maxStaff: null, customRoles: false });
    if (!a.ok) throw new Error(a.error);
    return (await db.select().from(storeMembers).where(eq(storeMembers.id, a.data.memberId)).get())!.userId;
  };
  const cashierId = await staff("cashier");
  const supervisorId = await staff("shift_supervisor");
  const branch = await ensureDefaultBranch(scope);
  const reg = await saveRegister(scope, 3, { branchId: branch.id, name: "كاشير 1" });
  if (!reg.ok) throw new Error(reg.error);
  const dev = await createDevice(scope, { line: "market", name: "تابلت", branchId: branch.id, registerId: reg.data.id }, u!.id);
  if (!dev.ok) throw new Error(dev.error);
  const dc = (await loadDeviceContext(db, dev.data.token))!;
  return { storeId, ownerId: u!.id, cashierId, supervisorId, scope, dc, milk: milk.v, milkP: milk.p, rice: rice.v, riceP: rice.p, cheese: cheese.v, cheeseP: cheese.p };
}

const stockOf = async (s: Shop, v: string) => (await s.scope.from(t.productVariants, eq(t.productVariants.id, v)))[0]!.stock;
const op = (kind: string, payload: Record<string, unknown>) => ({ kind, payload: { clientId: uid(), at: Date.now(), ...payload } });
async function sell(s: Shop, payload: Record<string, unknown>) {
  const res = await applyOps(s.dc, [op("sale", { userId: s.cashierId, payments: [{ method: "cash", amount: 10_000_000 }], ...payload }) as never]);
  expect(res[0]!.status, res[0]!.error).toBe("applied");
  return res[0]!.data as { saleId: string; total: number; needsReview: boolean; review: string[] };
}

let a: Shop, b: Shop;
beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  for (const p of LINE_PLANS) await db.insert(plans).values({ ...p, price: p.prices.m1 ?? 0 });
  a = await shop("market-a");
  b = await shop("market-b");
});
afterAll(() => close());

describe("بيانات الماركت للمنتج", () => {
  it("وحدات وباركودات وأسعار جملة، والباركود فريد في النشاط بس", async () => {
    const r = await saveMarketProduct(a.scope, {
      productId: a.milkP, shelf: "A1", quickPosition: 1, quickColor: "#C19E58",
      units: [{ name: "كرتونة", factor: 24, price: 66_000, wholesalePrice: 60_000 }],
      barcodes: [{ variantId: a.milk, code: "6291041500213" }, { variantId: a.milk, unit: "كرتونة", code: "16291041500210" }],
      levelPrices: [{ variantId: a.milk, semi: 2_900, wholesale: 2_700 }],
    }, { wholesale: true });
    expect(r.ok, !r.ok ? r.error : "").toBe(true);
    const m = (await getMarketProduct(a.scope, a.milkP))!;
    expect(m.units).toMatchObject([{ name: "كرتونة", factor: 24, price: 66_000, wholesalePrice: 60_000 }]);
    expect(m.barcodes.map((x) => x.unit)).toEqual(expect.arrayContaining([null, "كرتونة"]));
    expect(m.levelPrices[0]).toMatchObject({ semi: 2_900, wholesale: 2_700 });
    // نفس الباركود لمنتج ثاني في نفس النشاط: ممنوع
    const dup = await saveMarketProduct(a.scope, { productId: a.riceP, barcodes: [{ variantId: a.rice, code: "6291041500213" }] }, { wholesale: true });
    expect(dup).toMatchObject({ ok: false, error: "الباركود مستعمل في منتج ثاني." });
    // ونفس الباركود في نشاط ثاني: عادي (عزل)
    expect((await saveMarketProduct(b.scope, { productId: b.milkP, barcodes: [{ variantId: b.milk, code: "6291041500213" }] }, { wholesale: true })).ok).toBe(true);
    // باقة بدون الجملة: أسعار المستويات تتجاهل
    await saveMarketProduct(b.scope, { productId: b.riceP, levelPrices: [{ variantId: b.rice, semi: 1, wholesale: 1 }] }, { wholesale: false });
    expect((await getMarketProduct(b.scope, b.riceP))!.levelPrices[0]).toMatchObject({ semi: null, wholesale: null });
    // متغير من منتج ثاني (أو نشاط ثاني): مرفوض
    expect((await saveMarketProduct(a.scope, { productId: a.riceP, barcodes: [{ variantId: b.rice, code: "X-1000" }] }, { wholesale: true })).ok).toBe(false);
  });

  it("الموزون ورقم الميزان، والبحث بالباركود (حبة، كرتونة، SKU، ميزان)", async () => {
    expect((await saveMarketProduct(a.scope, { productId: a.cheeseP, soldBy: "weight", pluCode: "00123" }, { wholesale: true })).ok).toBe(true);
    expect(await lookupBarcode(a.scope, "6291041500213")).toMatchObject({ variantId: a.milk, factor: 1 });
    expect(await lookupBarcode(a.scope, "16291041500210")).toMatchObject({ variantId: a.milk, factor: 24 });
    const scale = withCheckDigit("20" + "00123" + "01250");
    expect(await lookupBarcode(a.scope, scale)).toMatchObject({ variantId: a.cheese, grams: 1_250 });
    expect(await lookupBarcode(b.scope, scale)).toBeNull(); // نشاط ثاني ما عندوش الصنف
    expect(await lookupBarcode(a.scope, "nothing-here")).toBeNull();
    const gen = await generateInternalBarcode(a.scope, a.rice);
    expect(gen.ok && gen.data.code).toMatch(/^29\d{11}$/);
    if (gen.ok) expect(await lookupBarcode(a.scope, gen.data.code)).toMatchObject({ variantId: a.rice });
  });

  it("أقسام البقالة الجاهزة ما تتكررش", async () => {
    const r1 = await addGroceryCategories(a.scope);
    const r2 = await addGroceryCategories(a.scope);
    expect(r1.ok && r1.data.added).toBeGreaterThan(10);
    expect(r2.ok && r2.data.added).toBe(0);
  });

  it("بيانات الجهاز فيها الوحدات والباركودات والأسعار والمميزات", async () => {
    const boot = await posBootstrap(a.dc);
    const milk = boot.products.find((p) => p.variantId === a.milk)!;
    expect(milk).toMatchObject({ semi: 2_900, wholesale: 2_700, quick: 1 });
    expect(boot.units.find((u) => u.productId === a.milkP)?.factor).toBe(24);
    expect(boot.barcodes.some((x) => x.code === "16291041500210")).toBe(true);
    expect(boot.products.find((p) => p.variantId === a.cheese)).toMatchObject({ soldBy: "weight", plu: "00123" });
    expect(boot.features).toMatchObject({ wholesale: true, promotions: true });
    expect(boot.config.scale?.prefixes).toContain("20");
  });
});

describe("البيع في الماركت: الوحدات والجملة والموزون والعروض", () => {
  it("كرتونة بسعرها، وموزون بالجرام، والمخزون بالحبة/الجرام", async () => {
    const unit = (await getMarketProduct(a.scope, a.milkP))!.units[0]!;
    const m0 = await stockOf(a, a.milk), c0 = await stockOf(a, a.cheese);
    const r = await sell(a, {
      lines: [
        { variantId: a.milk, name: "حليب كرتونة", quantity: 1, unitFactor: 24, unitId: unit.id, unitPrice: 66_000 },
        { variantId: a.cheese, name: "جبنة", quantity: 250, isWeighed: true, unitPrice: 40_000 },
      ], total: 76_000,
    });
    expect(r.needsReview, r.review.join(" | ")).toBe(false);
    expect(await stockOf(a, a.milk)).toBe(m0 - 24);
    expect(await stockOf(a, a.cheese)).toBe(c0 - 250);
    const items = await a.scope.from(t.saleItems, eq(t.saleItems.saleId, r.saleId));
    expect(items.find((i) => i.unitId === unit.id)?.baseQty).toBe(24);
  });

  it("سعر الجملة: لزبون الجملة يمشي، ولغيره يحتاج مشرف", async () => {
    const cust = await upsertCustomer(a.scope, { phone: "0911234567", name: "بقالة الحي" });
    await a.scope.update(t.customers, { priceLevel: "wholesale" }, eq(t.customers.id, cust.id));
    const ok1 = await sell(a, { customerId: cust.id, priceLevel: "wholesale", lines: [{ variantId: a.milk, name: "حليب", quantity: 2, unitPrice: 2_700 }], total: 5_400 });
    expect(ok1.needsReview, ok1.review.join(" | ")).toBe(false);
    const noApprove = await sell(a, { priceLevel: "wholesale", lines: [{ variantId: a.milk, name: "حليب", quantity: 1, unitPrice: 2_700 }], total: 2_700 });
    expect(noApprove.needsReview).toBe(true);
    const approved = await sell(a, { priceLevel: "semi", approvedBy: a.supervisorId, lines: [{ variantId: a.milk, name: "حليب", quantity: 1, unitPrice: 2_900 }], total: 2_900 });
    expect(approved.needsReview, approved.review.join(" | ")).toBe(false);
  });

  it("العرض التلقائي: يتقبل بدون موافقة، والعرض الوهمي يتعلم للمراجعة", async () => {
    const p = await savePromotion(a.scope, { name: "الثانية بنص", kind: "nth_discount", config: { variantIds: [a.milk], nth: 2, percent: 50 } });
    expect(p.ok).toBe(true);
    expect((await savePromotion(a.scope, { name: "غلط", kind: "nth_discount", config: { variantIds: [b.milk], nth: 2, percent: 50 } })).ok).toBe(false);
    const promoId = p.ok ? p.data.id : "";
    const good = await sell(a, { lines: [{ variantId: a.milk, name: "حليب", quantity: 2, unitPrice: 3_000, promotionId: promoId, promoDiscount: 1_500 }], total: 4_500 });
    expect(good.needsReview, good.review.join(" | ")).toBe(false); // 25% خصم بس من عرض: ما يحتاجش مشرف
    const [item] = await a.scope.from(t.saleItems, eq(t.saleItems.saleId, good.saleId));
    expect(item).toMatchObject({ promotionId: promoId, promoDiscount: 1_500, total: 4_500 });
    const fake = await sell(a, { lines: [{ variantId: a.rice, name: "رز", quantity: 1, unitPrice: 5_000, promotionId: promoId, promoDiscount: 2_000 }], total: 3_000 });
    expect(fake.needsReview).toBe(true);
    expect(fake.review.join(" ")).toContain("العروض");
  });
});

describe("الدفعات والصلاحية والإتلاف", () => {
  it("الاستلام بالكرتونة يسجل دفعة، و FEFO يحسب المتبقي، وتقرير الصلاحية يقترح خصم", async () => {
    const sup = await saveSupplier(a.scope, { name: "شركة الألبان", phone: "0912223334" });
    if (!sup.ok) throw new Error(sup.error);
    const v0 = await stockOf(a, a.rice);
    const soon = Date.now() + 5 * DAY, later = Date.now() + 90 * DAY;
    const inv = await saveInvoice(a.scope, { supplierId: sup.data.id, dueAt: Date.now() - DAY, items: [
      { variantId: a.rice, quantity: 1, unitFactor: 10, unitCost: 40_000, batchNo: "R-1", expiresAt: soon },
      { variantId: a.milk, quantity: 2, unitFactor: 24, unitCost: 48_000, batchNo: "M-9", expiresAt: later },
    ] });
    if (!inv.ok) throw new Error(inv.error);
    expect((await receiveInvoice(a.scope, inv.data.id, null)).ok).toBe(true);
    expect(await stockOf(a, a.rice)).toBe(v0 + 10);
    const batches = await a.scope.from(t.stockBatches, eq(t.stockBatches.variantId, a.rice));
    expect(batches[0]).toMatchObject({ quantity: 10, unitCost: 4_000, batchNo: "R-1" });
    // المخزون القديم بدون دفعة، فالدفعة كاملة باقية لين ينقص المخزون تحت كميتها
    expect((await remainingByBatch(a.scope, [a.rice])).get(a.rice)![0]!.remaining).toBe(10);
    await sell(a, { lines: [{ variantId: a.rice, name: "رز", quantity: v0 + 4, unitPrice: 5_000 }], total: 5_000 * (v0 + 4) });
    expect((await remainingByBatch(a.scope, [a.rice])).get(a.rice)![0]!.remaining).toBe(6);
    const rep = await expiringReport(a.scope, 7);
    const row = rep.find((r) => r.batchNo === "R-1")!;
    expect(row).toMatchObject({ quantity: 6, suggestedDiscount: 30, expired: false });
    expect(rep.some((r) => r.batchNo === "M-9")).toBe(false); // بعيد
    // مستحقات المورد: متأخرة (تاريخ الاستحقاق فات)
    const dues = await supplierDues(a.scope);
    expect(dues.find((d) => d.supplierId === sup.data.id)).toMatchObject({ balance: 40_000 + 96_000, overdue: 136_000 });
  });

  it("الإتلاف ينقص المخزون ويسجل التكلفة، وما يتعداش المخزون", async () => {
    const [batch] = await a.scope.from(t.stockBatches, eq(t.stockBatches.variantId, a.rice));
    const before = await stockOf(a, a.rice);
    const r = await writeOff(a.scope, { variantId: a.rice, batchId: batch!.id, quantity: 2, reason: "expired" }, a.ownerId);
    expect(r).toMatchObject({ ok: true, data: { totalCost: 8_000 } });
    expect(await stockOf(a, a.rice)).toBe(before - 2);
    expect((await writeOff(a.scope, { variantId: a.rice, quantity: 9_999, reason: "damaged" }, a.ownerId)).ok).toBe(false);
    expect((await writeOff(a.scope, { variantId: a.milk, batchId: batch!.id, quantity: 1, reason: "damaged" }, a.ownerId)).ok).toBe(false); // دفعة صنف ثاني
    const w = await listWriteoffs(a.scope, { from: Date.now() - DAY, to: Date.now() + DAY });
    expect(w.byReason.expired).toBe(8_000);
    const mov = await a.scope.from(t.stockMovements, eq(t.stockMovements.reason, "writeoff"));
    expect(mov.length).toBe(1);
    expect((await addBatch(a.scope, { variantId: a.milk, quantity: 5 })).ok).toBe(false); // بدون رقم ولا تاريخ
    expect((await addBatch(b.scope, { variantId: a.milk, batchNo: "X", quantity: 5 })).ok).toBe(false); // صنف نشاط ثاني
  });
});

describe("اقتراح الشراء وطلبات الشراء", () => {
  it("يقترح الناقص بالكرتونة ومن آخر مورد، والطلب يتحول لفاتورة", async () => {
    await a.scope.update(t.productVariants, { stock: 3, minStock: 10 }, eq(t.productVariants.id, a.milk));
    const sug = await purchaseSuggestions(a.scope);
    const milk = sug.find((x) => x.variantId === a.milk)!;
    expect(milk.unit).toMatchObject({ name: "كرتونة", factor: 24 });
    expect(milk.quantity % 24).toBe(0);
    expect(milk.supplierId).not.toBeNull();
    const po = await createPurchaseOrder(a.scope, { supplierId: milk.supplierId, items: [{ variantId: a.milk, quantity: milk.unitQty, unitFactor: 24, unitName: "كرتونة", unitCost: 48_000 }] }, a.ownerId);
    if (!po.ok) throw new Error(po.error);
    const full = (await getPurchaseOrder(a.scope, po.data.id))!;
    expect(purchaseOrderMessage({ shopName: "ماركت", number: full.number, items: full.items })).toContain("كرتونة");
    const inv = await purchaseOrderToInvoice(a.scope, po.data.id);
    expect(inv.ok).toBe(true);
    expect((await purchaseOrderToInvoice(a.scope, po.data.id))).toEqual(inv); // مرة ثانية: نفس الفاتورة
    expect((await createPurchaseOrder(b.scope, { supplierId: milk.supplierId, items: [{ variantId: a.milk, quantity: 1 }] }, b.ownerId)).ok).toBe(false);
  });
});

describe("الجرد بالمسح", () => {
  it("عدّادين، كرتونة بالمعامل، المسحة المكررة ما تنحسبش، والتسوية تعدل المخزون", async () => {
    const wh = await ensureDefaultWarehouse(a.scope);
    const cat = (await a.scope.from(t.categories))[0]!;
    await a.scope.insert(t.productCategories, { productId: a.milkP, categoryId: cat.id });
    const st = await openStocktake(a.scope, { warehouseId: wh.id, categoryId: cat.id });
    if (!st.ok) throw new Error(st.error);
    const items0 = await a.scope.from(t.stocktakeItems, eq(t.stocktakeItems.stocktakeId, st.data.id));
    expect(items0.map((i) => i.variantId)).toEqual([a.milk]); // جزئي: القسم بس
    const cid = uid();
    expect(await addStocktakeCount(a.scope, st.data.id, { clientId: cid, code: "16291041500210", quantity: 1 }, a.ownerId)).toMatchObject({ ok: true, data: { counted: 24 } });
    expect(await addStocktakeCount(a.scope, st.data.id, { clientId: cid, code: "16291041500210", quantity: 1 }, a.ownerId)).toMatchObject({ ok: true, data: { counted: 24, duplicate: true } });
    expect(await addStocktakeCount(a.scope, st.data.id, { clientId: uid(), code: "6291041500213", quantity: 2 }, a.supervisorId)).toMatchObject({ ok: true, data: { counted: 26 } });
    // صنف برا القسم: يدخل الجرد
    expect((await addStocktakeCount(a.scope, st.data.id, { clientId: uid(), variantId: a.rice, quantity: 1 }, a.ownerId)).ok).toBe(true);
    expect((await addStocktakeCount(a.scope, st.data.id, { clientId: uid(), code: "unknown", quantity: 1 }, a.ownerId)).ok).toBe(false);
    expect((await addStocktakeCount(b.scope, st.data.id, { clientId: uid(), variantId: b.milk, quantity: 1 }, b.ownerId)).ok).toBe(false); // جرد نشاط ثاني
    const vr = (await stocktakeVariance(a.scope, st.data.id))!;
    const milkRow = vr.rows.find((r) => r.variantId === a.milk)!;
    expect(milkRow).toMatchObject({ counted: 26, current: 3, diff: 23, counters: 2 });
    expect(vr.summary.counters).toBe(2);
    const closed = await closeStocktake(a.scope, st.data.id, a.ownerId);
    expect(closed.ok).toBe(true);
    expect(await stockOf(a, a.milk)).toBe(26);
  });
});

describe("تجهيز الطلبيات الأونلاين", () => {
  it("التجميع بالمسح، البديل بموافقة الزبون، وجاهزة", async () => {
    const city = await makeCity(db, "مصراتة");
    await a.scope.insert(t.deliveryRates, { cityId: city.id, fee: 10_000 });
    const { createOrder } = await import("@/server/orders/create");
    await a.scope.update(t.productVariants, { stock: 50 }, eq(t.productVariants.id, a.rice));
    const o = await createOrder(db, a.storeId, { name: "زبون", phone: "0912345678", cityId: city.id, address: "شارع", paymentMethod: "cod", items: [{ variantId: a.milk, quantity: 2 }, { variantId: a.rice, quantity: 1 }] });
    if (!o.ok) throw new Error(o.error);
    const q = await prepQueue(a.scope);
    expect(q.find((x) => x.id === o.data.orderId)?.units).toBe(3);
    expect(await pickByScan(a.scope, o.data.orderId, "6291041500213", a.ownerId)).toMatchObject({ ok: true, data: { picked: 1, complete: false } });
    expect(await pickByScan(a.scope, o.data.orderId, "6291041500213", a.ownerId)).toMatchObject({ ok: true, data: { picked: 2 } });
    expect((await pickByScan(a.scope, o.data.orderId, "6291041500213", a.ownerId)).ok).toBe(false); // اتجمع كامل
    expect((await markPrepared(a.scope, o.data.orderId, a.ownerId)).ok).toBe(false); // الرز ناقص
    // الرز خالص: بديل
    const riceItem = (await a.scope.from(t.orderItems, eq(t.orderItems.orderId, o.data.orderId))).find((i) => i.variantId === a.rice)!;
    const alt = await saveProduct(a.scope, { name: "رز بسمتي", price: 5_500, variants: [{ valueIds: [], stock: 9 }] }, { limits });
    if (!alt.ok) throw new Error(alt.error);
    const altV = (await a.scope.from(t.productVariants, eq(t.productVariants.productId, alt.data.id)))[0]!.id;
    const cats = await a.scope.from(t.productCategories, eq(t.productCategories.productId, a.riceP));
    const cat = cats[0]?.categoryId ?? (await a.scope.from(t.categories))[1]!.id;
    if (!cats.length) await a.scope.insert(t.productCategories, { productId: a.riceP, categoryId: cat });
    await a.scope.insert(t.productCategories, { productId: alt.data.id, categoryId: cat });
    expect((await suggestSubstitutes(a.scope, riceItem.id)).map((x) => x.variantId)).toContain(altV);
    const msg = await proposeSubstitute(a.scope, riceItem.id, altV, null, "ماركت");
    expect(msg.ok && msg.data.message).toContain("رز بسمتي");
    const rice0 = await stockOf(a, a.rice), alt0 = await stockOf(a, altV);
    const applied = await applySubstitute(a.scope, riceItem.id, a.ownerId);
    expect(applied.ok).toBe(true);
    expect(await stockOf(a, a.rice)).toBe(rice0 + 1);
    expect(await stockOf(a, altV)).toBe(alt0 - 1);
    const [ord] = await a.scope.from(t.orders, eq(t.orders.id, o.data.orderId));
    expect(ord!.subtotal).toBe(2 * 3_000 + 5_500);
    expect((await pickByScan(b.scope, o.data.orderId, "6291041500213", b.ownerId)).ok).toBe(false); // نشاط ثاني
    await a.scope.update(t.orderItems, { pickedQty: 1 }, eq(t.orderItems.id, riceItem.id));
    expect((await markPrepared(a.scope, o.data.orderId, a.ownerId)).ok).toBe(true);
    expect((await prepQueue(a.scope)).some((x) => x.id === o.data.orderId)).toBe(false);
  });
});

describe("تقارير الماركت", () => {
  it("المبيعات والربح بمتوسط التكلفة والتجميع بالكاشير والقسم وخريطة الذروة", async () => {
    const r = await marketReport(a.scope, { from: Date.now() - DAY, to: Date.now() + DAY }, { names: new Map([[a.cashierId, "كاشير"]]), advanced: true });
    expect(r.totals.invoices).toBeGreaterThan(3);
    expect(r.totals.revenue).toBeGreaterThan(0);
    expect(r.totals.profit).toBeGreaterThan(0);
    expect(r.byCashier[0]!.name).toBe("كاشير");
    expect(r.byCategory.length).toBeGreaterThan(0);
    expect(r.advanced!.heat.flat().reduce((x, y) => x + y, 0)).toBe(r.totals.revenue);
    expect(r.top[0]!.revenue).toBeGreaterThanOrEqual(r.top.at(-1)!.revenue);
    const other = await marketReport(b.scope, { from: Date.now() - DAY, to: Date.now() + DAY }, { names: new Map(), advanced: false });
    expect(other.totals.invoices).toBe(0); // عزل
    expect(other.advanced).toBeNull();
  });
});
