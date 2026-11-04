import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { auditLogs, lineSubscriptions, plans, storeMembers, stores, users } from "@/db/schema/platform";
import { checkPin } from "@/lib/pin";
import { computeTotals, countCash, pointsEarned, settle } from "@/lib/pos-engine";
import { LINE_PLANS } from "@/lib/plan-catalog";
import { saveProduct } from "@/server/catalog/products";
import { posBootstrap } from "@/server/pos/bootstrap";
import { createDevice, ensureDefaultBranch, revokeDevice, saveBranch, saveRegister, setMemberPin } from "@/server/pos/branches";
import { customerBalances, debtAlerts } from "@/server/pos/customers";
import { applyOps, canOperate, loadDeviceContext, type DeviceCtx } from "@/server/pos/sync";
import { addStaff } from "@/server/staff-service";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

const DAY = 86_400_000;
let db: Db;
let close: () => void;
let seq = 0;
const uid = () => randomUUID();

type Shop = { storeId: string; ownerId: string; cashierId: string; supervisorId: string; token: string; dc: DeviceCtx; v1: string; v2: string; bundleV: string };

async function shop(slug: string, opts: { accounting?: boolean } = {}): Promise<Shop> {
  const [u] = await db.insert(users).values({ phone: `0918${String(++seq).padStart(6, "0")}`, name: `مالك ${slug}`, passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug, lines: ["market"] });
  if (!r.ok) throw new Error(r.error);
  const storeId = r.data.storeId;
  await db.update(stores).set({ onboardedAt: new Date(), enabledModules: opts.accounting ? ["accounting"] : [] }).where(eq(stores.id, storeId));
  const scope = forStore(db, storeId);
  const limits = { maxProducts: null, maxStaff: null, customRoles: false } as never;
  const mk = async (name: string, price: number, stock: number) => {
    const p = await saveProduct(scope, { name, price, costPrice: Math.round(price / 2), variants: [{ valueIds: [], stock }] }, { limits });
    if (!p.ok) throw new Error(p.error);
    return (await scope.from(t.productVariants, eq(t.productVariants.productId, p.data.id)))[0]!.id;
  };
  const v1 = await mk("حليب", 3_000, 10);
  const v2 = await mk("خبز", 500, 2);
  const bundle = await saveProduct(scope, { name: "فطور", price: 3_200, kind: "bundle", bundleItems: [{ variantId: v1, quantity: 1 }, { variantId: v2, quantity: 2 }], variants: [{ valueIds: [], stock: 0 }] }, { limits: { ...(limits as object), bundles: true } as never });
  if (!bundle.ok) throw new Error(bundle.error);
  const bundleV = (await scope.from(t.productVariants, eq(t.productVariants.productId, bundle.data.id)))[0]!.id;
  const staff = async (role: "cashier" | "shift_supervisor") => {
    const a = await addStaff(db, storeId, u!.id, { name: role, phone: `0928${String(++seq).padStart(6, "0")}`, password: "staff-pass-1", role }, { maxStaff: null, customRoles: false });
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
  return { storeId, ownerId: u!.id, cashierId, supervisorId, token: dev.data.token, dc, v1, v2, bundleV };
}

const stockOf = async (s: Shop, v: string) => (await forStore(db, s.storeId).from(t.productVariants, eq(t.productVariants.id, v)))[0]!.stock;
const op = <K extends string>(kind: K, payload: Record<string, unknown>) => ({ kind, payload: { clientId: uid(), at: Date.now(), ...payload } });

beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  for (const p of LINE_PLANS) await db.insert(plans).values({ ...p, price: p.prices.m1 ?? 0 });
});
afterAll(() => close());

describe("حسابات البيع (محايدة: الجهاز والسيرفر)", () => {
  it("السطور والخصومات والموزون", () => {
    const tt = computeTotals([{ quantity: 2, unitPrice: 3_000, discount: 500 }, { quantity: 750, isWeighed: true, unitPrice: 12_000 }], { kind: "percent", value: 10 });
    expect(tt.lines).toEqual([5_500, 9_000]);
    expect(tt.subtotal).toBe(14_500);
    expect(tt.discount).toBe(1_450);
    expect(tt.total).toBe(13_050);
    expect(computeTotals([{ quantity: 1, unitPrice: 1_000 }], { kind: "amount", value: 5_000 }).total).toBe(0);
  });
  it("الدفع المقسّم والباقي", () => {
    expect(settle(10_000, [{ method: "card", amount: 4_000 }, { method: "cash", amount: 10_000 }])).toMatchObject({ ok: true, change: 4_000, tendered: 10_000, applied: [{ method: "card", amount: 4_000 }, { method: "cash", amount: 6_000 }] });
    expect(settle(10_000, [{ method: "card", amount: 12_000 }]).ok).toBe(false);
    expect(settle(10_000, [{ method: "cash", amount: 9_000 }])).toMatchObject({ ok: false, remaining: 1_000 });
    expect(settle(10_000, [{ method: "credit", amount: 10_000 }])).toMatchObject({ ok: true, change: 0 });
  });
  it("عدّ الفئات والنقاط", () => {
    expect(countCash({ "50000": 2, "20000": 1, "1000": 3, coins: 750 })).toBe(123_750);
    expect(pointsEarned(50_000, 2, 100)).toBe(10);
    expect(pointsEarned(50_000, 0, 100)).toBe(0);
  });
});

describe("المزامنة", () => {
  it("وردية → بيع كاش بالباقي → تقفيل: المخزون والترقيم والكاش المتوقع والدفتر", async () => {
    const s = await shop("pos-flow", { accounting: true });
    const shiftId = uid();
    const sale = op("sale", { userId: s.cashierId, shiftId, lines: [{ variantId: s.v1, name: "حليب", quantity: 2, unitPrice: 3_000 }], payments: [{ method: "cash", amount: 10_000 }], total: 6_000 });
    const res = await applyOps(s.dc, [
      op("shift.open", { clientId: shiftId, userId: s.cashierId, openingFloat: 20_000 }),
      sale,
      op("shift.move", { userId: s.cashierId, shiftId, kind: "out", amount: 1_000, reason: "مشتريات خبز" }),
      op("shift.close", { userId: s.cashierId, shiftId, denominations: { "20000": 1, "5000": 1, coins: 0 } }),
    ]);
    expect(res.map((r) => r.status)).toEqual(["applied", "applied", "applied", "applied"]);
    expect(res[1]!.data).toMatchObject({ number: 1, total: 6_000, change: 4_000, needsReview: false });
    expect(res[3]!.data).toMatchObject({ expected: 25_000, counted: 25_000, difference: 0, zNumber: 1 });
    expect(await stockOf(s, s.v1)).toBe(8);
    const ledger = await forStore(db, s.storeId).from(t.ledgerEntries);
    expect(ledger.map((l) => [l.kind, l.amount]).sort()).toEqual([["cash_out", -1_000], ["pos_sale", 6_000]]);
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.storeId, s.storeId));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["pos.shift_open", "pos.shift_close", "pos.cash_out"]));
  });

  it("نفس العملية مرتين ما تتسجلش مرتين (حتى في نفس الدفعة)", async () => {
    const s = await shop("pos-dup");
    const sale = op("sale", { userId: s.cashierId, lines: [{ variantId: s.v1, name: "حليب", quantity: 1, unitPrice: 3_000 }], payments: [{ method: "cash", amount: 3_000 }], total: 3_000 });
    const a = await applyOps(s.dc, [sale, sale]);
    expect(a.map((r) => r.status)).toEqual(["applied", "duplicate"]);
    const b = await applyOps(s.dc, [sale]);
    expect(b[0]).toMatchObject({ status: "duplicate", data: { number: 1 } });
    expect(await stockOf(s, s.v1)).toBe(9);
    expect(await forStore(db, s.storeId).count(t.sales)).toBe(1);
  });

  it("الترتيب: مرتجع قبل فاتورته يستنى (retry) ويوقف اللي بعده، وبعدين يتطبق", async () => {
    const s = await shop("pos-order");
    const saleId = uid();
    const ret = op("sale.return", { userId: s.supervisorId, saleId, items: [{ index: 0, quantity: 1 }] });
    const later = op("audit", { userId: s.cashierId, action: "line_void" });
    const first = await applyOps(s.dc, [ret, later]);
    expect(first.map((r) => r.status)).toEqual(["retry", "retry"]);
    const sale = op("sale", { clientId: saleId, userId: s.cashierId, lines: [{ variantId: s.v1, name: "حليب", quantity: 2, unitPrice: 3_000 }], payments: [{ method: "cash", amount: 6_000 }], total: 6_000 });
    const second = await applyOps(s.dc, [sale, ret, later]);
    expect(second.map((r) => r.status)).toEqual(["applied", "applied", "applied"]);
    expect(second[1]!.data).toMatchObject({ amount: 3_000, method: "cash", status: "partially_returned" });
    expect(await stockOf(s, s.v1)).toBe(9);
  });

  it("انقطاع في نص العملية: ما يتسجل شي، والإعادة تطبقها مرة وحدة", async () => {
    const s = await shop("pos-crash");
    const sale = op("sale", { userId: s.cashierId, lines: [{ variantId: s.v1, name: "حليب", quantity: 3, unitPrice: 3_000 }], payments: [{ method: "cash", amount: 9_000 }], total: 9_000 });
    // حساب دفتر مش موجود: الكتابة تفشل بعد ما المخزون اتحرك داخل المعاملة
    const broken: DeviceCtx = { ...s.dc, env: { ...s.dc.env, accounts: { cash: "ghost-account", bank: null } } };
    const r1 = await applyOps(broken, [sale]);
    expect(r1[0]!.status).toBe("retry");
    expect(await stockOf(s, s.v1)).toBe(10);
    expect(await forStore(db, s.storeId).count(t.sales)).toBe(0);
    expect(await forStore(db, s.storeId).count(t.syncOps)).toBe(0);
    const r2 = await applyOps(s.dc, [sale]);
    expect(r2[0]!.status).toBe("applied");
    expect(await stockOf(s, s.v1)).toBe(7);
  });

  it("المخزون ينزل تحت الصفر (بدون نت) مع تنبيه، والباقة تتفكك لمكوناتها", async () => {
    const s = await shop("pos-neg");
    const r = await applyOps(s.dc, [op("sale", { userId: s.cashierId, lines: [{ variantId: s.bundleV, name: "فطور", quantity: 2, unitPrice: 3_200 }], payments: [{ method: "cash", amount: 6_400 }], total: 6_400 })]);
    expect(r[0]!.data).toMatchObject({ needsReview: true });
    expect(await stockOf(s, s.v1)).toBe(8);
    expect(await stockOf(s, s.v2)).toBe(-2);
  });

  it("سعر مختلف عن الحالي وإجمالي غلط من الجهاز: السيرفر يحسب ويعلّم للمراجعة", async () => {
    const s = await shop("pos-price");
    const r = await applyOps(s.dc, [op("sale", { userId: s.cashierId, lines: [{ variantId: s.v1, name: "حليب", quantity: 1, unitPrice: 2_500 }], payments: [{ method: "cash", amount: 3_000 }], total: 3_000 })]);
    expect(r[0]!.data).toMatchObject({ total: 2_500, change: 500, needsReview: true });
    const [sale] = await forStore(db, s.storeId).from(t.sales);
    expect(sale!.reviewNotes!.join(" ")).toContain("سعر");
  });

  it("الخصم الكبير يحتاج موافقة مشرف (PIN)", async () => {
    const s = await shop("pos-disc");
    const line = { variantId: s.v1, name: "حليب", quantity: 1, unitPrice: 3_000, discount: 1_000 };
    const r = await applyOps(s.dc, [
      op("sale", { userId: s.cashierId, lines: [line], payments: [{ method: "cash", amount: 2_000 }], total: 2_000 }),
      op("sale", { userId: s.cashierId, approvedBy: s.supervisorId, lines: [line], payments: [{ method: "cash", amount: 2_000 }], total: 2_000 }),
      op("sale", { userId: s.cashierId, approvedBy: s.cashierId, lines: [line], payments: [{ method: "cash", amount: 2_000 }], total: 2_000 }),
    ]);
    expect(r.map((x) => x.data?.needsReview)).toEqual([true, false, true]);
    const sales = await forStore(db, s.storeId).from(t.sales);
    expect(sales.find((x) => x.number === 2)!.approvedBy).toBe(s.supervisorId);
  });

  it("الدين: زبون اتنشأ بدون نت، بيع على الحساب، تعدّي الحد، سداد، محفظة ونقاط", async () => {
    const s = await shop("pos-debt");
    await forStore(db, s.storeId).update(t.storeSettings, { posConfig: { defaultCreditLimit: 5_000, loyaltyPercent: 1, pointValue: 10 } });
    const dc = (await loadDeviceContext(db, s.token))!;
    const cust = uid();
    const shiftId = uid();
    const r = await applyOps(dc, [
      op("shift.open", { clientId: shiftId, userId: s.cashierId, openingFloat: 0 }),
      op("customer.create", { clientId: cust, userId: s.cashierId, phone: "0912223344", name: "عمي سالم" }),
      op("sale", { userId: s.cashierId, shiftId, customerId: cust, lines: [{ variantId: s.v1, name: "حليب", quantity: 2, unitPrice: 3_000 }], payments: [{ method: "credit", amount: 6_000 }], total: 6_000 }),
      op("debt.pay", { userId: s.cashierId, shiftId, customerId: cust, amount: 2_000, method: "cash" }),
      op("wallet.topup", { userId: s.cashierId, shiftId, customerId: cust, amount: 5_000, method: "cash" }),
      op("sale", { userId: s.cashierId, shiftId, customerId: cust, lines: [{ variantId: s.v2, name: "خبز", quantity: 2, unitPrice: 500 }], payments: [{ method: "wallet", amount: 1_000 }], total: 1_000 }),
    ]);
    expect(r.map((x) => x.status)).toEqual(["applied", "applied", "applied", "applied", "applied", "applied"]);
    expect(r[2]!.data).toMatchObject({ needsReview: true }); // 6 > حد 5
    const bal = (await customerBalances(forStore(db, s.storeId))).get(cust)!;
    expect(bal).toEqual({ debt: 4_000, wallet: 4_000, points: 6 + 1, minutes: 0 });
    // الكاش المتوقع: سداد الدين + شحن المحفظة
    const close = await applyOps(dc, [op("shift.close", { userId: s.cashierId, shiftId, denominations: { "5000": 1, "1000": 1 } })]);
    expect(close[0]!.data).toMatchObject({ expected: 7_000, counted: 6_000, difference: -1_000 });
    const alerts = await debtAlerts(forStore(db, s.storeId), { defaultLimit: 3_000 });
    expect(alerts[0]).toMatchObject({ id: cust, debt: 4_000, overLimit: true });
    // صرف النقاط كخصم
    const red = await applyOps(dc, [op("sale", { userId: s.cashierId, customerId: cust, redeemPoints: 7, lines: [{ variantId: s.v1, name: "حليب", quantity: 1, unitPrice: 3_000 }], payments: [{ method: "cash", amount: 2_930 }], total: 2_930 })]);
    expect(red[0]!.data).toMatchObject({ total: 2_930 });
    expect(red[0]!.data!.review).toEqual([]);
  });

  it("زبون بنفس الرقم يتنشأ من جهاز ثاني: يتربط بالموجود، والفاتورة تتحول له", async () => {
    const s = await shop("pos-map");
    const first = await applyOps(s.dc, [op("customer.create", { userId: s.cashierId, phone: "0913334455", name: "منى" })]);
    const realId = first[0]!.data!.customerId as string;
    const offlineId = uid();
    const r = await applyOps(s.dc, [
      op("customer.create", { clientId: offlineId, userId: s.cashierId, phone: "+218913334455", name: "منى" }),
      op("sale", { userId: s.cashierId, customerId: offlineId, lines: [{ variantId: s.v1, name: "حليب", quantity: 1, unitPrice: 3_000 }], payments: [{ method: "credit", amount: 3_000 }], total: 3_000 }),
    ]);
    expect(r[0]!.data).toMatchObject({ customerId: realId, created: false });
    expect((await forStore(db, s.storeId).from(t.sales))[0]!.customerId).toBe(realId);
  });

  it("المرتجع: الكمية أكثر من المباع ترفض، والإرجاع للحساب ينقص الدين", async () => {
    const s = await shop("pos-ret");
    const cust = uid();
    const saleId = uid();
    await applyOps(s.dc, [
      op("customer.create", { clientId: cust, userId: s.cashierId, phone: "0915556677", name: "علي" }),
      op("sale", { clientId: saleId, userId: s.cashierId, customerId: cust, lines: [{ variantId: s.v1, name: "حليب", quantity: 2, unitPrice: 3_000 }], payments: [{ method: "credit", amount: 6_000 }], total: 6_000 }),
    ]);
    const bad = await applyOps(s.dc, [op("sale.return", { userId: s.supervisorId, saleId, items: [{ index: 0, quantity: 3 }] })]);
    expect(bad[0]).toMatchObject({ status: "rejected" });
    const good = await applyOps(s.dc, [op("sale.return", { userId: s.supervisorId, saleId, items: [{ index: 0, quantity: 2 }] })]);
    expect(good[0]!.data).toMatchObject({ amount: 6_000, method: "credit", status: "returned" });
    expect((await customerBalances(forStore(db, s.storeId))).get(cust)!.debt).toBe(0);
    expect(await stockOf(s, s.v1)).toBe(10);
  });

  it("بيانات غلط ترفض ومش تعاد، وعملية غريبة ترفض", async () => {
    const s = await shop("pos-bad");
    const r = await applyOps(s.dc, [{ kind: "sale", payload: { clientId: uid(), at: Date.now(), userId: s.cashierId, lines: [], payments: [], total: 0 } }, { kind: "hack", payload: {} }]);
    expect(r.map((x) => x.status)).toEqual(["rejected", "rejected"]);
  });
});

describe("الاشتراك والجهاز", () => {
  it("بعد انتهاء الاشتراك: اللي صار قبل الانتهاء يتقبل، وبعده يتقفل، والوردية المفتوحة قبله تكمّل", () => {
    const end = Date.UTC(2026, 5, 1);
    const expired = { line: "market", subscribed: true, state: "expired", daysLeft: 0, writable: false, posWritable: false, planId: null, planSlug: null, planName: null, cycle: "monthly", limits: null, trialEndsAt: null, periodEnd: end } as const;
    expect(canOperate(expired, end - 1000, null)).toBe(true);
    expect(canOperate(expired, end + 1000, null)).toBe(false);
    expect(canOperate(expired, end + 3_600_000, end - 60_000)).toBe(true);
    expect(canOperate({ ...expired, state: "suspended" }, end - 1000, null)).toBe(false);
  });

  it("المزامنة تتقفل للاشتراك المنتهي (blocked) وتوقف الباقي", async () => {
    const s = await shop("pos-exp");
    await db.update(lineSubscriptions).set({ status: "trial", trialEndsAt: new Date(Date.now() - DAY) }).where(and(eq(lineSubscriptions.storeId, s.storeId), eq(lineSubscriptions.line, "market")));
    const dc = (await loadDeviceContext(db, s.token))!;
    const before = op("sale", { at: Date.now() - 2 * DAY, userId: s.cashierId, lines: [{ variantId: s.v1, name: "حليب", quantity: 1, unitPrice: 3_000 }], payments: [{ method: "cash", amount: 3_000 }], total: 3_000 });
    const after = op("sale", { userId: s.cashierId, lines: [{ variantId: s.v1, name: "حليب", quantity: 1, unitPrice: 3_000 }], payments: [{ method: "cash", amount: 3_000 }], total: 3_000 });
    const r = await applyOps(dc, [before, after, before]);
    expect(r.map((x) => x.status)).toEqual(["applied", "blocked", "retry"]);
  });

  it("الجهاز الملغى ما يتعرفش، وجهاز متجر ما يوصلش لفواتير متجر ثاني", async () => {
    const a = await shop("pos-iso-a");
    const b = await shop("pos-iso-b");
    const saleId = uid();
    await applyOps(a.dc, [op("sale", { clientId: saleId, userId: a.cashierId, lines: [{ variantId: a.v1, name: "حليب", quantity: 1, unitPrice: 3_000 }], payments: [{ method: "cash", amount: 3_000 }], total: 3_000 })]);
    const r = await applyOps(b.dc, [op("sale.return", { userId: b.supervisorId, saleId, items: [{ index: 0, quantity: 1 }] })]);
    expect(r[0]!.status).toBe("retry"); // ما يشوفهاش أصلاً
    // منتج متجر ثاني في فاتورة: ما يلمسش مخزونه
    const x = await applyOps(b.dc, [op("sale", { userId: b.cashierId, lines: [{ variantId: a.v1, name: "حليب", quantity: 1, unitPrice: 3_000 }], payments: [{ method: "cash", amount: 3_000 }], total: 3_000 })]);
    expect(x[0]!.data).toMatchObject({ needsReview: true });
    expect(await stockOf(a, a.v1)).toBe(9);
    const dev = (await forStore(db, a.storeId).from(t.devices))[0]!;
    expect((await revokeDevice(forStore(db, a.storeId), dev.id)).ok).toBe(true);
    expect(await loadDeviceContext(db, a.token)).toBeNull();
    expect(await loadDeviceContext(db, "x".repeat(40))).toBeNull();
  });

  it("حدود الفروع والكاشيرات، والـ PIN", async () => {
    const s = await shop("pos-limits");
    const scope = forStore(db, s.storeId);
    expect(await saveBranch(scope, { maxBranches: 1 }, { name: "فرع ثاني" })).toEqual({ ok: false, error: expect.stringContaining("حد الفروع") });
    expect((await saveBranch(scope, { maxBranches: 2 }, { name: "فرع ثاني" })).ok).toBe(true);
    const br = (await scope.from(t.branches))[0]!;
    expect(await saveRegister(scope, 1, { branchId: br.id, name: "كاشير 2" })).toEqual({ ok: false, error: expect.stringContaining("حد الكاشيرات") });
    const member = (await db.select().from(storeMembers).where(eq(storeMembers.userId, s.cashierId)).get())!;
    expect((await setMemberPin(db, s.storeId, member.id, "1111", s.ownerId)).ok).toBe(false);
    expect((await setMemberPin(db, s.storeId, member.id, "12a4", s.ownerId)).ok).toBe(false);
    expect((await setMemberPin(db, s.storeId, member.id, "4821", s.ownerId)).ok).toBe(true);
    const boot = await posBootstrap((await loadDeviceContext(db, s.token))!);
    const cashier = boot.staff.find((x) => x.userId === s.cashierId)!;
    expect(await checkPin("4821", cashier.pinHash)).toBe(true);
    expect(await checkPin("4822", cashier.pinHash)).toBe(false);
    expect(boot.products.find((p) => p.variantId === s.v1)).toMatchObject({ name: "حليب", price: 3_000, stock: 10 });
    expect(boot.products.find((p) => p.variantId === s.bundleV)).toMatchObject({ isBundle: true, stock: 1 });
    expect(boot.staff.find((x) => x.userId === s.supervisorId)).toMatchObject({ canApprove: true });
  });

  it("دفتر الزبون ما يتعدلش ولا ينحذف", async () => {
    const s = await shop("pos-append");
    const cust = uid();
    await applyOps(s.dc, [op("customer.create", { clientId: cust, userId: s.cashierId, phone: "0917778899", name: "x" }), op("wallet.topup", { userId: s.cashierId, customerId: cust, amount: 1_000 })]);
    const scope = forStore(db, s.storeId);
    await expect(scope.update(t.customerLedger, { amount: 9 }, eq(t.customerLedger.customerId, cust))).rejects.toThrow();
    await expect(scope.delete(t.customerLedger, eq(t.customerLedger.customerId, cust))).rejects.toThrow();
  });
});
