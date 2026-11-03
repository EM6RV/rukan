import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { cities, media, stores, users } from "@/db/schema/platform";
import { PRO_LIMITS } from "@/lib/plan-catalog";
import { addExpense, addReceivable, balances, cashFlow, closeCash, defaultAccountId, deposit, listAccounts, listEntries, payReceivable, profitAndLoss, refundCustomer, reverseEntry, saveAccount, transfer, verifyLedger } from "@/server/accounting/ledger";
import { saveProduct } from "@/server/catalog/products";
import { cancelTransfer, closeStocktake, createTransfer, ensureDefaultWarehouse, findStockInconsistencies, inventoryValue, listWarehouses, openStocktake, quantitiesIn, receiveTransfer, saveCounts, saveWarehouse, sendTransfer, setDefaultWarehouse } from "@/server/inventory/warehouses";
import { cancelInvoice, getInvoice, listSuppliers, paySupplier, receiveInvoice, returnToSupplier, saveInvoice, saveSupplier, supplierBalances, weightedCost } from "@/server/inventory/purchasing";
import { createManualOrder } from "@/server/orders/create";
import { changeOrderStatus, registerReturn, reviewReceipt } from "@/server/orders/manage";
import { recordSettlement } from "@/server/orders/couriers";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

let db: Db, close: () => void, city: string, n = 0;
beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  city = (await db.insert(cities).values({ nameAr: "طرابلس", region: "west" }).returning())[0]!.id;
});
afterAll(() => close());

async function shop(slug: string, stock = 20) {
  const [u] = await db.insert(users).values({ phone: `0919${String(++n).padStart(6, "0")}`, name: "مالك", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  await db.update(stores).set({ onboardedAt: new Date() }).where(eq(stores.id, r.data.storeId));
  const scope = forStore(db, r.data.storeId);
  await scope.insert(t.deliveryRates, [{ cityId: city, fee: 10_000 }]);
  const p = await saveProduct(scope, { name: "عطر", price: 50_000, costPrice: 20_000, variants: [{ valueIds: [], stock }] }, { limits: PRO_LIMITS });
  if (!p.ok) throw new Error(p.error);
  const [v] = await scope.from(t.productVariants, eq(t.productVariants.productId, p.data.id));
  return { id: r.data.storeId, userId: u!.id, scope, productId: p.data.id, variantId: v!.id };
}
type Shop = Awaited<ReturnType<typeof shop>>;
const stockOf = async (s: Shop) => (await s.scope.from(t.productVariants, eq(t.productVariants.id, s.variantId)))[0]!.stock;
const qty = async (s: Shop, wid: string) => (await quantitiesIn(s.scope, wid, [s.variantId])).get(s.variantId) ?? 0;
const base = { name: "خديجة البيضاوي", phone: "0927771234", cityId: "", address: "طرابلس شارع عمر المختار", paymentMethod: "cod" };

describe("المخازن", () => {
  it("الرئيسي محسوب، والتحويل يحافظ على الإجمالي ويتتبع حالاته", async () => {
    const s = await shop("wh-a");
    const main = await ensureDefaultWarehouse(s.scope);
    expect(main).toMatchObject({ isDefault: true, name: "المخزن الرئيسي" });
    const w2 = await saveWarehouse(s.scope, PRO_LIMITS, { name: "مخزن بنغازي" });
    if (!w2.ok) throw new Error(w2.error);
    expect(await qty(s, main.id)).toBe(20);
    expect(await qty(s, w2.data.id)).toBe(0);

    const tr = await createTransfer(s.scope, { fromWarehouseId: main.id, toWarehouseId: w2.data.id, items: [{ variantId: s.variantId, quantity: 8 }] });
    if (!tr.ok) throw new Error(tr.error);
    expect((await sendTransfer(s.scope, tr.data.id)).ok).toBe(true);
    expect(await stockOf(s)).toBe(12); // في الطريق: خرج من الإجمالي
    expect((await sendTransfer(s.scope, tr.data.id)).ok).toBe(false);
    expect((await receiveTransfer(s.scope, tr.data.id)).ok).toBe(true);
    expect(await stockOf(s)).toBe(20);
    expect([await qty(s, main.id), await qty(s, w2.data.id)]).toEqual([12, 8]);
    expect(await findStockInconsistencies(s.scope)).toEqual([]);

    // أكبر من المتاح → رفض
    const big = await createTransfer(s.scope, { fromWarehouseId: w2.data.id, toWarehouseId: main.id, items: [{ variantId: s.variantId, quantity: 9 }] });
    if (!big.ok) throw new Error(big.error);
    expect(await sendTransfer(s.scope, big.data.id)).toEqual({ ok: false, error: expect.stringContaining("أقل من المطلوب") });
    // إلغاء وهو في الطريق يرجّع للمصدر
    const ok2 = await createTransfer(s.scope, { fromWarehouseId: w2.data.id, toWarehouseId: main.id, items: [{ variantId: s.variantId, quantity: 3 }] });
    if (!ok2.ok) throw new Error(ok2.error);
    await sendTransfer(s.scope, ok2.data.id);
    expect(await qty(s, w2.data.id)).toBe(5);
    expect((await cancelTransfer(s.scope, ok2.data.id)).ok).toBe(true);
    expect([await qty(s, w2.data.id), await stockOf(s)]).toEqual([8, 20]);
    expect((await createTransfer(s.scope, { fromWarehouseId: main.id, toWarehouseId: main.id, items: [{ variantId: s.variantId, quantity: 1 }] })).ok).toBe(false);
    const mv = await s.scope.from(t.stockMovements, eq(t.stockMovements.reason, "transfer"));
    expect(mv.reduce((x, m) => x + m.delta, 0)).toBe(0); // صافي التحويلات صفر
  });

  it("حد المخازن في الباقة، وعزل المتاجر", async () => {
    const a = await shop("wh-q-a"), b = await shop("wh-q-b");
    expect((await saveWarehouse(a.scope, { maxWarehouses: 2 }, { name: "ب" })).ok).toBe(true); // الرئيسي + ب
    expect(await saveWarehouse(a.scope, { maxWarehouses: 2 }, { name: "ج" })).toEqual({ ok: false, error: expect.stringContaining("تسمح بـ 2") });
    expect((await saveWarehouse(a.scope, { maxWarehouses: 2 }, { name: "ب" })).ok).toBe(false); // اسم مكرر
    const bWh = await ensureDefaultWarehouse(b.scope);
    const tr = await createTransfer(a.scope, { fromWarehouseId: bWh.id, toWarehouseId: (await ensureDefaultWarehouse(a.scope)).id, items: [{ variantId: a.variantId, quantity: 1 }] });
    expect(tr.ok).toBe(false); // مخزن متجر ثاني
    expect((await listWarehouses(b.scope)).map((w) => w.name)).toEqual(["المخزن الرئيسي"]);
  });

  it("الجرد يسجل الفرق كحركة، والقفل يمنع التحويل، وتغيير الرئيسي يحفظ الكميات", async () => {
    const s = await shop("wh-stk");
    const main = await ensureDefaultWarehouse(s.scope);
    const w2 = await saveWarehouse(s.scope, PRO_LIMITS, { name: "فرعي" });
    if (!w2.ok) throw new Error(w2.error);
    await sendTransfer(s.scope, (await createTransfer(s.scope, { fromWarehouseId: main.id, toWarehouseId: w2.data.id, items: [{ variantId: s.variantId, quantity: 5 }] }) as { ok: true; data: { id: string } }).data.id);
    const [tr0] = await s.scope.from(t.stockTransfers);
    await receiveTransfer(s.scope, tr0!.id);
    // جرد الفرعي مع القفل: المعدود 3 بدل 5
    const st = await openStocktake(s.scope, { warehouseId: w2.data.id, lock: true });
    if (!st.ok) throw new Error(st.error);
    expect((await openStocktake(s.scope, { warehouseId: w2.data.id })).ok).toBe(false);
    const locked = await createTransfer(s.scope, { fromWarehouseId: w2.data.id, toWarehouseId: main.id, items: [{ variantId: s.variantId, quantity: 1 }] });
    if (!locked.ok) throw new Error(locked.error);
    expect(await sendTransfer(s.scope, locked.data.id)).toEqual({ ok: false, error: expect.stringContaining("مقفول") });
    expect((await saveCounts(s.scope, st.data.id, [{ variantId: s.variantId, counted: 3 }])).ok).toBe(true);
    expect(await closeStocktake(s.scope, st.data.id, s.userId)).toMatchObject({ ok: true, data: { adjusted: 1 } });
    expect([await qty(s, w2.data.id), await stockOf(s)]).toEqual([3, 18]);
    expect((await s.scope.from(t.stockMovements, eq(t.stockMovements.reason, "stocktake")))[0]).toMatchObject({ delta: -2, warehouseId: w2.data.id });
    expect((await sendTransfer(s.scope, locked.data.id)).ok).toBe(true); // اتفتح القفل

    // الرئيسي يتبدل: الكميات تنحفظ
    const before = [await qty(s, main.id), await qty(s, w2.data.id)];
    expect((await setDefaultWarehouse(s.scope, w2.data.id)).ok).toBe(true);
    expect([await qty(s, main.id), await qty(s, w2.data.id)]).toEqual(before);
    expect((await listWarehouses(s.scope)).find((w) => w.isDefault)?.id).toBe(w2.data.id);
    const val = await inventoryValue(s.scope);
    expect(val.reduce((x, w) => x + w.units, 0)).toBe(await stockOf(s));
    expect(val.reduce((x, w) => x + w.cost, 0)).toBe((await stockOf(s)) * 20_000);
  });

  it("طلبية من مخزن فرعي تنسحب منه وترجع له عند الإلغاء", async () => {
    const s = await shop("wh-order");
    const main = await ensureDefaultWarehouse(s.scope);
    const w2 = await saveWarehouse(s.scope, PRO_LIMITS, { name: "فرعي" });
    if (!w2.ok) throw new Error(w2.error);
    const tr = await createTransfer(s.scope, { fromWarehouseId: main.id, toWarehouseId: w2.data.id, items: [{ variantId: s.variantId, quantity: 6 }] });
    if (!tr.ok) throw new Error(tr.error);
    await sendTransfer(s.scope, tr.data.id); await receiveTransfer(s.scope, tr.data.id);
    expect(await createManualOrder(db, s.id, { ...base, cityId: city, items: [{ variantId: s.variantId, quantity: 7 }], manualSource: "shop", warehouseId: w2.data.id })).toEqual({ ok: false, error: expect.stringContaining("المخزن") });
    const o = await createManualOrder(db, s.id, { ...base, cityId: city, items: [{ variantId: s.variantId, quantity: 4 }], manualSource: "shop", warehouseId: w2.data.id });
    if (!o.ok) throw new Error(o.error);
    expect([await qty(s, w2.data.id), await qty(s, main.id), await stockOf(s)]).toEqual([2, 14, 16]);
    await changeOrderStatus(s.scope, { orderId: o.data.orderId, to: "cancelled", actorUserId: null });
    expect([await qty(s, w2.data.id), await qty(s, main.id), await stockOf(s)]).toEqual([6, 14, 20]);
    expect(await findStockInconsistencies(s.scope)).toEqual([]);
  });
});

describe("المشتريات والموردين", () => {
  it("استلام جزئي وكلي، متوسط التكلفة المرجّح، الأرصدة والدفعات والمرتجع", async () => {
    expect(weightedCost(10, 20_000, 10, 30_000)).toBe(25_000);
    expect(weightedCost(0, 20_000, 5, 30_000)).toBe(30_000);
    expect(weightedCost(10, null, 5, 30_000)).toBe(30_000);

    const s = await shop("pu-a"); // 20 قطعة بتكلفة 20
    const sup = await saveSupplier(s.scope, { name: "مورد العطور", phone: "0911112222" });
    if (!sup.ok) throw new Error(sup.error);
    const inv = await saveInvoice(s.scope, { supplierId: sup.data.id, items: [{ variantId: s.variantId, quantity: 20, unitCost: 30_000 }] });
    if (!inv.ok) throw new Error(inv.error);
    expect((await supplierBalances(s.scope)).get(sup.data.id) ?? 0).toBe(0); // لسا ما استلمنا
    const item = (await getInvoice(s.scope, inv.data.id))!.items[0]!;
    expect(await receiveInvoice(s.scope, inv.data.id, [{ itemId: item.id, quantity: 30 }])).toMatchObject({ ok: false });
    expect(await receiveInvoice(s.scope, inv.data.id, [{ itemId: item.id, quantity: 10 }])).toEqual({ ok: true, data: { status: "partial" } });
    expect(await stockOf(s)).toBe(30);
    expect((await s.scope.from(t.productVariants, eq(t.productVariants.id, s.variantId)))[0]!.costPrice).toBe(23_333); // (20×20 + 10×30)/30
    expect((await supplierBalances(s.scope)).get(sup.data.id)).toBe(300_000);
    expect((await saveInvoice(s.scope, { id: inv.data.id, supplierId: sup.data.id, items: [{ variantId: s.variantId, quantity: 1, unitCost: 1 }] })).ok).toBe(false); // مستلمة جزئياً
    expect(await receiveInvoice(s.scope, inv.data.id, null)).toEqual({ ok: true, data: { status: "received" } });
    expect(await receiveInvoice(s.scope, inv.data.id, null)).toMatchObject({ ok: false });
    expect(await stockOf(s)).toBe(40);
    expect((await supplierBalances(s.scope)).get(sup.data.id)).toBe(600_000);

    expect(await paySupplier(s.scope, { supplierId: sup.data.id, amount: 250_000 })).toEqual({ ok: true, data: { balance: 350_000 } });
    expect(await returnToSupplier(s.scope, { supplierId: sup.data.id, variantId: s.variantId, quantity: 2, unitCost: 30_000 })).toEqual({ ok: true, data: { balance: 290_000 } });
    expect(await stockOf(s)).toBe(38);
    expect((await returnToSupplier(s.scope, { supplierId: sup.data.id, variantId: s.variantId, quantity: 999 })).ok).toBe(false);
    expect((await listSuppliers(s.scope))[0]).toMatchObject({ name: "مورد العطور", balance: 290_000 });
    expect((await cancelInvoice(s.scope, inv.data.id)).ok).toBe(false); // مستلمة
  });

  it("الشراء لمخزن فرعي، وعزل الموردين بين المتاجر", async () => {
    const a = await shop("pu-w-a"), b = await shop("pu-w-b");
    const w = await saveWarehouse(a.scope, PRO_LIMITS, { name: "فرعي" });
    if (!w.ok) throw new Error(w.error);
    const sup = await saveSupplier(a.scope, { name: "م" });
    if (!sup.ok) throw new Error(sup.error);
    const inv = await saveInvoice(a.scope, { supplierId: sup.data.id, warehouseId: w.data.id, items: [{ variantId: a.variantId, quantity: 5, unitCost: 10_000 }] });
    if (!inv.ok) throw new Error(inv.error);
    await receiveInvoice(a.scope, inv.data.id, null);
    expect([await qty(a, w.data.id), await stockOf(a)]).toEqual([5, 25]);
    expect((await listSuppliers(b.scope))).toEqual([]);
    expect((await saveInvoice(b.scope, { supplierId: sup.data.id, items: [{ variantId: b.variantId, quantity: 1, unitCost: 1 }] })).ok).toBe(false);
    expect((await paySupplier(b.scope, { supplierId: sup.data.id, amount: 1 })).ok).toBe(false);
  });
});

describe("الحسابات (الدفتر)", () => {
  it("الأرصدة = مجموع الحركات، والدفتر ما يتعدلش ولا يتمسح، والتصحيح بحركة عكسية مرة وحدة", async () => {
    const s = await shop("ac-a");
    const cash = await defaultAccountId(s.scope, "cash"), bank = await defaultAccountId(s.scope, "bank");
    expect((await deposit(s.scope, { accountId: cash, amount: 500_000, memo: "رأس المال" })).ok).toBe(true);
    expect((await deposit(s.scope, { accountId: cash, amount: 100_000, withdraw: true })).ok).toBe(true);
    expect((await deposit(s.scope, { accountId: cash, amount: 0 })).ok).toBe(false);
    expect((await transfer(s.scope, { fromAccountId: cash, toAccountId: bank, amount: 150_000 })).ok).toBe(true);
    expect((await transfer(s.scope, { fromAccountId: cash, toAccountId: cash, amount: 1 })).ok).toBe(false);
    const bal = await balances(s.scope);
    expect([bal.get(cash), bal.get(bank)]).toEqual([250_000, 150_000]);

    // مجموع مستقل بـ SQL خام
    const raw = await db.all<{ total: number }>(sql`select coalesce(sum(amount),0) as total from ledger_entries where store_id = ${s.id}`);
    expect(raw[0]!.total).toBe(400_000);

    // غير قابل للتعديل/الحذف على مستوى القاعدة
    await expect(db.run(sql`update ledger_entries set amount = 1 where store_id = ${s.id}`)).rejects.toThrow();
    await expect(db.run(sql`delete from ledger_entries where store_id = ${s.id}`)).rejects.toThrow();

    const entries = await listEntries(s.scope);
    const dep = entries.rows.find((r) => r.memo === "رأس المال")!;
    expect((await reverseEntry(s.scope, dep.id)).ok).toBe(true);
    expect(await reverseEntry(s.scope, dep.id)).toEqual({ ok: false, error: expect.stringContaining("اتعكست") });
    expect((await balances(s.scope)).get(cash)).toBe(-250_000);
    // عكس تحويل يعكس الطرفين
    const trOut = entries.rows.find((r) => r.kind === "transfer_out")!;
    expect((await reverseEntry(s.scope, trOut.id)).ok).toBe(true);
    expect([(await balances(s.scope)).get(cash), (await balances(s.scope)).get(bank)]).toEqual([-100_000, 0]);
    expect((await verifyLedger(s.scope)).ok).toBe(true);
  });

  it("حساب من متجر ثاني مرفوض، وحساب موقوف مرفوض", async () => {
    const a = await shop("ac-iso-a"), b = await shop("ac-iso-b");
    const bCash = await defaultAccountId(b.scope, "cash");
    expect((await deposit(a.scope, { accountId: bCash, amount: 1000 })).ok).toBe(false);
    expect(await listEntries(b.scope)).toMatchObject({ total: 0 });
    const w = await saveAccount(a.scope, { name: "LyPay", kind: "wallet", opening: 75_000 });
    if (!w.ok) throw new Error(w.error);
    expect((await balances(a.scope)).get(w.data.id)).toBe(75_000);
    expect((await saveAccount(a.scope, { name: "LyPay", kind: "wallet" })).ok).toBe(false);
  });

  it("المصاريف والديون والإقفال والتقارير", async () => {
    const s = await shop("ac-b");
    const cash = await defaultAccountId(s.scope, "cash");
    await deposit(s.scope, { accountId: cash, amount: 1_000_000 });
    const ex = await addExpense(s.scope, { amount: 120_000, accountId: cash, categoryName: "إعلانات", note: "حملة إنستا" });
    expect(ex.ok).toBe(true);
    await addExpense(s.scope, { amount: 30_000, accountId: cash, categoryName: "إعلانات" });
    expect((await s.scope.from(t.expenseCategories)).length).toBe(1); // نفس التصنيف
    expect((await balances(s.scope)).get(cash)).toBe(850_000);

    const rc = await addReceivable(s.scope, { customerName: "علي المصراتي", customerPhone: "0925550000", amount: 200_000, dueDate: Date.now() - 86_400_000 });
    if (!rc.ok) throw new Error(rc.error);
    expect(await payReceivable(s.scope, { id: rc.data.id, amount: 300_000, accountId: cash })).toMatchObject({ ok: false });
    expect(await payReceivable(s.scope, { id: rc.data.id, amount: 50_000, accountId: cash })).toEqual({ ok: true, data: { remaining: 150_000 } });
    expect((await balances(s.scope)).get(cash)).toBe(900_000);

    // إقفال: الفعلي أقل بـ 20 د.ل
    expect(await closeCash(s.scope, { accountId: cash, actual: 880_000, adjust: true }, s.userId)).toEqual({ ok: true, data: { difference: -20_000 } });
    expect((await balances(s.scope)).get(cash)).toBe(880_000);
    expect((await closeCash(s.scope, { accountId: cash, actual: 880_000 })).ok).toBe(true);

    expect(await refundCustomer(s.scope, { accountId: cash, amount: 10_000 })).toMatchObject({ ok: true });
    const range = { from: Date.now() - 86_400_000, to: Date.now() + 86_400_000 };
    expect(await profitAndLoss(s.scope, range)).toMatchObject({ expenses: 150_000 });
    const flow = (await cashFlow(s.scope, range)).find((x) => x.accountId === cash)!;
    expect(flow.inflow - flow.outflow).toBe(flow.net);
    expect(flow.net).toBe(870_000);
  });
});

describe("ربط الحسابات بالمندوبين والتحويلات", () => {
  it("تسوية المندوب تدخل الخزنة، وقبول إيصال التحويل يدخل البنك مرة وحدة، ومندوب = حساب للقراءة", async () => {
    const s = await shop("ac-hooks");
    const cash = await defaultAccountId(s.scope, "cash"), bank = await defaultAccountId(s.scope, "bank");
    const [courier] = await s.scope.insert(t.couriers, { name: "مندوب", kind: "person" });
    const o = await createManualOrder(db, s.id, { ...base, cityId: city, items: [{ variantId: s.variantId, quantity: 2 }], manualSource: "phone", deliveryFee: 0 });
    if (!o.ok) throw new Error(o.error);
    await changeOrderStatus(s.scope, { orderId: o.data.orderId, to: "confirmed", actorUserId: null });
    await changeOrderStatus(s.scope, { orderId: o.data.orderId, to: "with_courier", courierId: courier!.id, actorUserId: null });
    await changeOrderStatus(s.scope, { orderId: o.data.orderId, to: "delivered", actorUserId: null }); // يسجل «collected» عند المندوب
    const accts = await listAccounts(s.scope);
    expect(accts.find((a) => a.id === `courier:${courier!.id}`)).toMatchObject({ balance: 100_000, readOnly: true });
    expect((await recordSettlement(s.scope, { courierId: courier!.id, amount: 60_000 }, null, cash)).ok).toBe(true);
    expect((await balances(s.scope)).get(cash)).toBe(60_000);
    expect((await listAccounts(s.scope)).find((a) => a.id === `courier:${courier!.id}`)?.balance).toBe(40_000);
    // بدون وحدة الحسابات: ما تتسجلش حركة
    await recordSettlement(s.scope, { courierId: courier!.id, amount: 10_000 }, null, null);
    expect((await balances(s.scope)).get(cash)).toBe(60_000);

    // إيصال تحويل
    const o2 = await createManualOrder(db, s.id, { ...base, cityId: city, items: [{ variantId: s.variantId, quantity: 1 }], manualSource: "whatsapp", paymentMethod: "bank_transfer", deliveryFee: 0 });
    if (!o2.ok) throw new Error(o2.error);
    const [m] = await db.insert(media).values({ storeId: s.id, mime: "image/webp", size: 1, driver: "turso", isPrivate: true }).returning();
    const [rc] = await s.scope.insert(t.paymentReceipts, { orderId: o2.data.orderId, mediaId: m!.id, status: "pending" });
    expect((await reviewReceipt(s.scope, rc!.id, "approved", null, bank)).ok).toBe(true);
    expect((await balances(s.scope)).get(bank)).toBe(50_000);
    expect((await reviewReceipt(s.scope, rc!.id, "approved", null, bank)).ok).toBe(true);
    expect((await balances(s.scope)).get(bank)).toBe(50_000); // ما يتكررش
  });
});

describe("سيناريو كامل: شراء ← بيع ← مرتجع ← جرد ← تحويل", () => {
  it("الأرصدة والمخزون متسقة في كل خطوة", async () => {
    const s = await shop("flow", 0);
    const main = await ensureDefaultWarehouse(s.scope);
    const w2 = await saveWarehouse(s.scope, PRO_LIMITS, { name: "فرعي" });
    if (!w2.ok) throw new Error(w2.error);
    const sup = await saveSupplier(s.scope, { name: "م" });
    if (!sup.ok) throw new Error(sup.error);
    const inv = await saveInvoice(s.scope, { supplierId: sup.data.id, items: [{ variantId: s.variantId, quantity: 30, unitCost: 25_000 }] });
    if (!inv.ok) throw new Error(inv.error);
    await receiveInvoice(s.scope, inv.data.id, null);
    expect(await stockOf(s)).toBe(30);
    const tr = await createTransfer(s.scope, { fromWarehouseId: main.id, toWarehouseId: w2.data.id, items: [{ variantId: s.variantId, quantity: 10 }] });
    if (!tr.ok) throw new Error(tr.error);
    await sendTransfer(s.scope, tr.data.id); await receiveTransfer(s.scope, tr.data.id);
    const o = await createManualOrder(db, s.id, { ...base, cityId: city, items: [{ variantId: s.variantId, quantity: 3 }], manualSource: "shop", warehouseId: w2.data.id });
    if (!o.ok) throw new Error(o.error);
    await changeOrderStatus(s.scope, { orderId: o.data.orderId, to: "confirmed", actorUserId: null });
    await changeOrderStatus(s.scope, { orderId: o.data.orderId, to: "with_courier", courierId: (await s.scope.insert(t.couriers, { name: "م", kind: "person" }))[0]!.id, actorUserId: null });
    await changeOrderStatus(s.scope, { orderId: o.data.orderId, to: "delivered", actorUserId: null });
    expect(await registerReturn(s.scope, { orderId: o.data.orderId, reason: "refused", restock: true, shippingLoss: 0 } as never, null)).toMatchObject({ ok: true });
    expect([await qty(s, main.id), await qty(s, w2.data.id), await stockOf(s)]).toEqual([20, 10, 30]);
    const st = await openStocktake(s.scope, { warehouseId: main.id });
    if (!st.ok) throw new Error(st.error);
    await saveCounts(s.scope, st.data.id, [{ variantId: s.variantId, counted: 19 }]);
    await closeStocktake(s.scope, st.data.id);
    expect([await qty(s, main.id), await qty(s, w2.data.id), await stockOf(s)]).toEqual([19, 10, 29]);
    expect(await findStockInconsistencies(s.scope)).toEqual([]);
    // مجموع كل حركات المخزون = الرصيد النهائي
    const moves = await s.scope.from(t.stockMovements, eq(t.stockMovements.variantId, s.variantId));
    expect(moves.reduce((x, m) => x + m.delta, 0)).toBe(29);
  });
});
