// محرك البيع في السيرفر: يطبق عمليات الجهاز (فاتورة، مرتجع، وردية، دين، محفظة) داخل معاملة وحدة.
// المبالغ تتحسب هنا من السطور (ما نثقوش في إجمالي الجهاز)، ووقت الجهاز يتسجل كوقت البيع.
// قواعد التعارض بعد الشغل بدون نت: المخزون يقدر ينزل تحت الصفر (مع تنبيه)، والسعر هو سعر لحظة البيع (مع تنبيه لو اختلف).
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PosConfig } from "@/lib/pos-config";
import { computeTotals, countCash, discountPercentOf, pointsEarned, settle } from "@/lib/pos-engine";
import { saleItemId, type OpPayload } from "@/lib/pos-ops";
import type { PayMethod } from "@/lib/constants";
import { postEntry } from "../accounting/ledger";
import { expandStockLines } from "../catalog/bundles";
import type { Permission } from "../permissions";
import { t, type StoreScopeCore } from "../tenant";
import { balanceOf, creditLimitOf, postCustomer, PosError, upsertCustomer } from "./customers";

type Tx = StoreScopeCore;

export type PosEnv = {
  storeId: string;
  device: { id: string; branchId: string; registerId: string | null; line: "market" | "lounge" | "gym" | "store" };
  config: PosConfig;
  /** حسابات الدفتر (null = وحدة الحسابات مطفية) */
  accounts: { cash: string | null; bank: string | null };
  /** موظفين النشاط وصلاحياتهم (للتحقق من الكاشير والمشرف) */
  members: Map<string, { name: string; can: (p: Permission) => boolean; branchIds: string[] | null }>;
  now: number;
};

/** خطأ في بيانات العملية ما يتصلحش بالإعادة */
export class RejectError extends PosError {}
/** ناقصها حاجة لسه ما وصلتش (الجهاز يعاود بعدين) */
export class RetryError extends PosError {}

export type Audit = { action: string; actorUserId: string | null; entityType?: string; entityId?: string; meta?: Record<string, unknown> };
export type Applied = { data: Record<string, unknown>; audits: Audit[] };

const DEFAULT_MAX_DISCOUNT = 10;

function approver(env: PosEnv, actorId: string, approvedBy: string | null | undefined): string | null {
  if (env.members.get(actorId)?.can("pos_approve")) return actorId;
  if (approvedBy && env.members.get(approvedBy)?.can("pos_approve")) return approvedBy;
  return null;
}

async function shiftOf(tx: Tx, shiftId: string | null | undefined) {
  if (!shiftId) return null;
  const [s] = await tx.from(t.posShifts, eq(t.posShifts.id, shiftId)).limit(1);
  if (!s) throw new RetryError("الوردية لسه ما وصلتش للسيرفر.");
  return s;
}

/** يحول معرّف زبون من الجهاز (ممكن اتنشأ بدون نت وطلع رقمه مسجّل قبل) للمعرّف الحقيقي */
async function resolveCustomer(tx: Tx, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const [c] = await tx.from(t.customers, eq(t.customers.id, id)).limit(1);
  if (c) return c.id;
  const [op] = await tx.from(t.syncOps, and(eq(t.syncOps.clientId, id), eq(t.syncOps.kind, "customer.create"))!).limit(1);
  const mapped = op?.result?.customerId;
  if (typeof mapped === "string") return mapped;
  throw new RetryError("الزبون لسه ما وصلش للسيرفر.");
}

async function branchWarehouse(tx: Tx, branchId: string): Promise<string | null> {
  const [b] = await tx.from(t.branches, eq(t.branches.id, branchId)).limit(1);
  if (!b?.warehouseId) return null;
  const [w] = await tx.from(t.warehouses, eq(t.warehouses.id, b.warehouseId)).limit(1);
  return w && !w.isDefault ? w.id : null;
}

/**
 * يحرك المخزون للبيع/المرتجع (الباقات تتفكك لمكوناتها). يسمح بالسالب: البيع صار فعلاً (حتى لو بدون نت)،
 * فنسجله ونرجعوا المتغيرات اللي نزلت تحت الصفر للتنبيه.
 */
async function moveStock(tx: Tx, o: { variantId: string; baseQty: number; sign: 1 | -1; reason: "pos_sale" | "pos_return"; warehouseId: string | null; note: string; actorUserId: string | null }): Promise<string[]> {
  const negatives: string[] = [];
  for (const line of await expandStockLines(tx, o.variantId, o.baseQty)) {
    const [v] = await tx.from(t.productVariants, eq(t.productVariants.id, line.variantId)).limit(1);
    if (!v) continue;
    const delta = o.sign * line.quantity;
    await tx.update(t.productVariants, { stock: v.stock + delta }, eq(t.productVariants.id, v.id));
    if (o.warehouseId) {
      const cond = and(eq(t.warehouseStock.warehouseId, o.warehouseId), eq(t.warehouseStock.variantId, v.id))!;
      const [row] = await tx.from(t.warehouseStock, cond).limit(1);
      if (row) await tx.update(t.warehouseStock, { quantity: row.quantity + delta }, cond);
      else await tx.insert(t.warehouseStock, { warehouseId: o.warehouseId, variantId: v.id, quantity: delta });
    }
    await tx.insert(t.stockMovements, { variantId: v.id, delta, reason: o.reason, warehouseId: o.warehouseId, note: o.note, actorUserId: o.actorUserId });
    if (v.stock + delta < 0) negatives.push(v.id);
  }
  return negatives;
}

async function post(tx: Tx, accountId: string | null, amount: number, kind: Parameters<typeof postEntry>[1]["kind"], ref: { type: string; id: string }, memo: string, actorUserId: string | null) {
  if (!accountId || amount === 0) return;
  await postEntry(tx, { accountId, amount, kind, refType: ref.type, refId: ref.id, memo, actorUserId });
}
const accountFor = (env: PosEnv, method: PayMethod) => (method === "cash" ? env.accounts.cash : method === "card" || method === "transfer" ? env.accounts.bank : null);

// ===== الوردية =====

export async function openShift(tx: Tx, env: PosEnv, p: OpPayload<"shift.open">): Promise<Applied> {
  const [open] = await tx.from(t.posShifts, and(eq(t.posShifts.deviceId, env.device.id), eq(t.posShifts.status, "open"))!).limit(1);
  const notes: string[] = open ? [`الجهاز كان فيه وردية مفتوحة (${open.id}) اتقفلت بفتح وردية جديدة بدون نت.`] : [];
  await tx.insert(t.posShifts, {
    id: p.clientId, clientId: p.clientId, branchId: env.device.branchId, registerId: env.device.registerId, deviceId: env.device.id,
    openedBy: p.userId, openedAt: new Date(p.at), openingFloat: p.openingFloat, status: "open", note: notes.join(" ") || null,
  });
  return { data: { shiftId: p.clientId }, audits: [{ action: "pos.shift_open", actorUserId: p.userId, entityType: "shift", entityId: p.clientId, meta: { openingFloat: p.openingFloat } }] };
}

export async function cashMove(tx: Tx, env: PosEnv, p: OpPayload<"shift.move">): Promise<Applied> {
  const shift = (await shiftOf(tx, p.shiftId))!;
  if (p.kind !== "drawer" && p.amount <= 0) throw new RejectError("اكتب مبلغ أكبر من صفر.");
  const ok = p.kind === "drawer" ? approver(env, p.userId, p.approvedBy) : p.userId;
  await tx.insert(t.posCashMoves, { id: p.clientId, clientId: p.clientId, shiftId: shift.id, kind: p.kind, amount: p.kind === "drawer" ? 0 : p.amount, reason: p.reason ?? null, actorUserId: p.userId, approvedBy: p.kind === "drawer" ? ok : (p.approvedBy ?? null), at: new Date(p.at) });
  if (p.kind !== "drawer") await post(tx, env.accounts.cash, p.kind === "in" ? p.amount : -p.amount, p.kind === "in" ? "cash_in" : "cash_out", { type: "shift", id: shift.id }, p.reason || (p.kind === "in" ? "إدخال للدرج" : "سحب من الدرج"), p.userId);
  return {
    data: { moveId: p.clientId },
    audits: [{ action: p.kind === "drawer" ? "pos.drawer_open" : `pos.cash_${p.kind}`, actorUserId: p.userId, entityType: "shift", entityId: shift.id, meta: { amount: p.amount, reason: p.reason ?? null, approvedBy: p.approvedBy ?? null, approved: p.kind !== "drawer" || !!ok } }],
  };
}

/** الكاش المتوقع في الدرج للوردية: الافتتاحي + كاش المبيعات + سداد الدين وشحن المحفظة بالكاش ± حركات الدرج − المرتجع الكاش */
export async function expectedCash(tx: Pick<Tx, "aggregate" | "from">, shiftId: string): Promise<{ opening: number; sales: number; refunds: number; cashIn: number; cashOut: number; collections: number; expected: number }> {
  const [shift] = await tx.from(t.posShifts, eq(t.posShifts.id, shiftId)).limit(1);
  const opening = shift?.openingFloat ?? 0;
  const salesIds = (await tx.from(t.sales, eq(t.sales.shiftId, shiftId))).map((s) => s.id);
  const [cashSales] = salesIds.length ? (await tx.aggregate(t.salePayments, { n: sql<number>`coalesce(sum(${t.salePayments.amount}), 0)` }, { where: and(inArray(t.salePayments.saleId, salesIds), eq(t.salePayments.method, "cash")) })) as { n: number }[] : [{ n: 0 }];
  const [refunds] = (await tx.aggregate(t.saleReturns, { n: sql<number>`coalesce(sum(${t.saleReturns.amount}), 0)` }, { where: and(eq(t.saleReturns.shiftId, shiftId), eq(t.saleReturns.refundMethod, "cash")) })) as { n: number }[];
  const moves = await tx.from(t.posCashMoves, eq(t.posCashMoves.shiftId, shiftId));
  const [coll] = (await tx.aggregate(t.customerLedger, { n: sql<number>`coalesce(sum(abs(${t.customerLedger.amount})), 0)` }, { where: and(eq(t.customerLedger.refType, "shift"), eq(t.customerLedger.refId, shiftId), eq(t.customerLedger.method, "cash"), inArray(t.customerLedger.kind, ["payment", "topup"])) })) as { n: number }[];
  const sales = Number(cashSales?.n ?? 0), ref = Number(refunds?.n ?? 0), collections = Number(coll?.n ?? 0);
  const cashIn = moves.filter((m) => m.kind === "in").reduce((s, m) => s + m.amount, 0);
  const cashOut = moves.filter((m) => m.kind === "out").reduce((s, m) => s + m.amount, 0);
  return { opening, sales, refunds: ref, cashIn, cashOut, collections, expected: opening + sales + collections + cashIn - cashOut - ref };
}

export async function closeShift(tx: Tx, env: PosEnv, p: OpPayload<"shift.close">): Promise<Applied> {
  const shift = (await shiftOf(tx, p.shiftId))!;
  if (shift.status === "closed") throw new RejectError("الوردية مقفولة من قبل.");
  const exp = await expectedCash(tx, shift.id);
  const counted = countCash(p.denominations);
  const difference = counted - exp.expected;
  const [{ n } = { n: 0 }] = (await tx.aggregate(t.posShifts, { n: sql<number>`count(*)` }, { where: and(eq(t.posShifts.branchId, shift.branchId), eq(t.posShifts.status, "closed")) })) as { n: number }[];
  const zNumber = Number(n) + 1;
  await tx.update(t.posShifts, { status: "closed", closedBy: p.userId, closedAt: new Date(p.at), expectedCash: exp.expected, countedCash: counted, denominations: p.denominations, difference, zNumber, note: [shift.note, p.note].filter(Boolean).join(" · ") || null }, eq(t.posShifts.id, shift.id));
  await post(tx, env.accounts.cash, difference, "shift_difference", { type: "shift", id: shift.id }, difference < 0 ? `عجز وردية Z${zNumber}` : `زيادة وردية Z${zNumber}`, p.userId);
  return { data: { shiftId: shift.id, expected: exp.expected, counted, difference, zNumber }, audits: [{ action: "pos.shift_close", actorUserId: p.userId, entityType: "shift", entityId: shift.id, meta: { expected: exp.expected, counted, difference, zNumber } }] };
}

// ===== الفاتورة =====

export async function recordSale(tx: Tx, env: PosEnv, p: OpPayload<"sale">): Promise<Applied> {
  const review: string[] = [];
  const audits: Audit[] = [];
  const shift = await shiftOf(tx, p.shiftId);
  if (shift && shift.status === "closed") review.push("الفاتورة وصلت بعد تقفيل ورديتها.");
  const cashier = env.members.get(p.userId);
  if (!cashier) review.push("الكاشير مش من موظفين النشاط.");
  else if (!cashier.can("pos")) review.push("الكاشير ما عندوش صلاحية البيع.");
  else if (cashier.branchIds && !cashier.branchIds.includes(env.device.branchId)) review.push("الكاشير مش من موظفين الفرع هذا.");
  const customerId = await resolveCustomer(tx, p.customerId);
  const customer = customerId ? (await tx.from(t.customers, eq(t.customers.id, customerId)).limit(1))[0] : undefined;

  // السطور: نتأكد من المنتج ونقارن السعر بالسعر الحالي (سعر لحظة البيع هو اللي يمشي)
  const variantIds = [...new Set(p.lines.map((l) => l.variantId).filter((v): v is string => !!v))];
  const variants = variantIds.length ? await tx.from(t.productVariants, inArray(t.productVariants.id, variantIds)) : [];
  const products = variants.length ? await tx.from(t.products, inArray(t.products.id, [...new Set(variants.map((v) => v.productId))])) : [];
  const lines = p.lines.map((l) => {
    const v = l.variantId ? variants.find((x) => x.id === l.variantId) : undefined;
    const prod = v ? products.find((x) => x.id === v.productId) : undefined;
    if (l.kind === "product" && l.variantId && !v) review.push(`منتج «${l.name}» مش موجود (انحذف؟).`);
    if (v && p.priceLevel === "retail" && !l.isWeighed) {
      const current = (v.price ?? prod?.price ?? 0) * l.unitFactor;
      if (current !== l.unitPrice) review.push(`سعر «${l.name}» في الفاتورة ${l.unitPrice} والحالي ${current}.`);
    }
    if ((l.discount ?? 0) > (l.isWeighed ? Math.round((l.unitPrice * l.quantity) / 1000) : l.unitPrice * l.quantity)) throw new RejectError(`خصم «${l.name}» أكبر من سعره.`);
    return { ...l, variant: v, product: prod };
  });

  const totals = computeTotals(lines, p.invoiceDiscount ?? null);
  // النقاط: تتصرف كخصم
  let redeemValue = 0;
  if (p.redeemPoints > 0) {
    if (!customerId) throw new RejectError("صرف النقاط يحتاج زبون.");
    redeemValue = Math.min(totals.total, p.redeemPoints * (env.config.pointValue ?? 100));
    const bal = await balanceOf(tx, customerId);
    if (bal.points < p.redeemPoints) review.push("النقاط المصروفة أكثر من رصيد الزبون.");
  }
  const total = totals.total - redeemValue;
  if (total !== p.total) review.push(`إجمالي الجهاز ${p.total} والمحسوب ${total}.`);
  // صرف النقاط حق للزبون (مش خصم من الكاشير): ما يدخلش في حد موافقة المشرف
  const pct = discountPercentOf(lines, totals);
  const maxPct = env.config.maxDiscountPercent ?? DEFAULT_MAX_DISCOUNT;
  let approvedBy: string | null = null;
  if (pct > maxPct + 0.001 && totals.lineDiscounts + totals.discount > 0) {
    approvedBy = approver(env, p.userId, p.approvedBy);
    if (!approvedBy) review.push(`خصم ${Math.round(pct)}% فوق الحد (${maxPct}%) بدون موافقة مشرف.`);
    else audits.push({ action: "pos.discount_approved", actorUserId: approvedBy, entityType: "sale", entityId: p.clientId, meta: { percent: Math.round(pct), cashier: p.userId } });
  }

  // الدفع: السيرفر يعيد التسوية على الإجمالي المحسوب
  const s = settle(total, p.payments);
  if (!s.ok) {
    // الجهاز حسب غير: نسجل الفلوس اللي وصلت كما هي ونعلّمها للمراجعة (الفلوس اتقبضت فعلاً)
    review.push(s.error ?? "الدفع ما يساويش الإجمالي.");
  }
  const applied = s.ok ? s.applied : p.payments.filter((x) => x.amount > 0).map((x) => ({ method: x.method, amount: x.amount, ref: x.ref ?? null }));
  if (applied.some((x) => x.method === "credit" || x.method === "wallet") && !customerId) throw new RejectError("الدفع على الحساب أو من المحفظة يحتاج زبون.");
  const credit = applied.filter((x) => x.method === "credit").reduce((a, x) => a + x.amount, 0);
  const wallet = applied.filter((x) => x.method === "wallet").reduce((a, x) => a + x.amount, 0);
  if (customer && (credit || wallet)) {
    const bal = await balanceOf(tx, customer.id);
    const limit = creditLimitOf(customer, env.config.defaultCreditLimit);
    if (credit && limit !== null && bal.debt + credit > limit) review.push(`دين «${customer.name}» تعدى الحد (${limit}).`);
    if (wallet && bal.wallet < wallet) review.push("رصيد المحفظة أقل من المصروف.");
  }

  // الرقم التسلسلي للفرع
  const [branch] = await tx.from(t.branches, eq(t.branches.id, env.device.branchId)).limit(1);
  if (!branch) throw new RejectError("فرع الجهاز غير موجود.");
  const number = branch.nextSaleNumber;
  await tx.update(t.branches, { nextSaleNumber: number + 1 }, eq(t.branches.id, branch.id));

  const points = customerId ? pointsEarned(total, env.config.loyaltyPercent ?? 0, env.config.pointValue ?? 100) : 0;
  const saleId = p.clientId;
  await tx.insert(t.sales, {
    id: saleId, clientId: p.clientId, line: env.device.line, branchId: branch.id, registerId: env.device.registerId, shiftId: shift?.id ?? null, deviceId: env.device.id,
    number, receiptNo: p.receiptNo ?? null, customerId, cashierUserId: p.userId, priceLevel: p.priceLevel, subtotal: totals.subtotal, discount: totals.discount + redeemValue, total,
    tendered: s.ok ? s.tendered : 0, change: s.ok ? s.change : 0, pointsEarned: points, note: p.note ?? null,
    soldAt: new Date(p.at), syncedAt: new Date(env.now), approvedBy, sourceType: p.sourceType ?? null, sourceId: p.sourceId ?? null,
  });
  const warehouseId = await branchWarehouse(tx, branch.id);
  for (const [i, l] of lines.entries()) {
    const baseQty = l.isWeighed ? l.quantity : l.quantity * l.unitFactor;
    await tx.insert(t.saleItems, {
      id: saleItemId(saleId, i), saleId, kind: l.kind, variantId: l.variant ? l.variant.id : null, name: l.name, quantity: l.quantity, isWeighed: l.isWeighed,
      unitFactor: l.unitFactor, baseQty: l.kind === "product" && l.variant ? baseQty : 0, unitPrice: l.unitPrice, discount: l.discount ?? 0, total: totals.lines[i]!,
      unitCost: l.variant ? (l.variant.costPrice ?? l.product?.costPrice ?? null) : null, refId: l.refId ?? null,
    });
    if (l.kind === "product" && l.variant) {
      const neg = await moveStock(tx, { variantId: l.variant.id, baseQty, sign: -1, reason: "pos_sale", warehouseId, note: `فاتورة ${number}`, actorUserId: p.userId });
      if (neg.length) review.push(`مخزون «${l.name}» نزل تحت الصفر.`);
    }
  }
  if (applied.length) await tx.insert(t.salePayments, applied.map((x) => ({ saleId, method: x.method, amount: x.amount, ref: x.ref ?? null })));

  // الزبون: الدين والمحفظة والنقاط
  if (customerId) {
    const at = p.at;
    if (credit) await postCustomer(tx, { customerId, account: "debt", amount: credit, kind: "sale", method: "credit", refType: "sale", refId: saleId, clientId: `${p.clientId}:credit`, actorUserId: p.userId, at, note: `فاتورة ${number}` });
    if (wallet) await postCustomer(tx, { customerId, account: "wallet", amount: -wallet, kind: "spend", method: "wallet", refType: "sale", refId: saleId, clientId: `${p.clientId}:wallet`, actorUserId: p.userId, at, note: `فاتورة ${number}` });
    if (p.redeemPoints > 0) await postCustomer(tx, { customerId, account: "points", amount: -p.redeemPoints, kind: "redeem", refType: "sale", refId: saleId, clientId: `${p.clientId}:redeem`, actorUserId: p.userId, at });
    if (points > 0) await postCustomer(tx, { customerId, account: "points", amount: points, kind: "earn", refType: "sale", refId: saleId, clientId: `${p.clientId}:earn`, actorUserId: p.userId, at });
  }
  // الدفتر المحاسبي: الكاش للخزنة، البطاقة والتحويل للبنك (الدين والمحفظة مش فلوس داخلة الحين)
  for (const m of ["cash", "card", "transfer"] as const) {
    const amount = applied.filter((x) => x.method === m).reduce((a, x) => a + x.amount, 0);
    await post(tx, accountFor(env, m), amount, "pos_sale", { type: "sale", id: saleId }, `فاتورة ${number}`, p.userId);
  }
  if (review.length) await tx.update(t.sales, { needsReview: true, reviewNotes: review }, eq(t.sales.id, saleId));
  return { data: { saleId, number, total, change: s.ok ? s.change : 0, needsReview: review.length > 0, review }, audits };
}

// ===== المرتجع =====

export async function recordReturn(tx: Tx, env: PosEnv, p: OpPayload<"sale.return">): Promise<Applied> {
  const [sale] = await tx.from(t.sales, eq(t.sales.id, p.saleId)).limit(1);
  if (!sale) throw new RetryError("الفاتورة الأصلية لسه ما وصلتش.");
  const shift = await shiftOf(tx, p.shiftId);
  const items = await tx.from(t.saleItems, eq(t.saleItems.saleId, sale.id));
  const payments = await tx.from(t.salePayments, eq(t.salePayments.saleId, sale.id));
  const by = approver(env, p.userId, p.approvedBy);
  const audits: Audit[] = [{ action: "pos.return", actorUserId: p.userId, entityType: "sale", entityId: sale.id, meta: { approvedBy: by, approved: !!by, items: p.items } }];
  // نصيب السطر من خصم الفاتورة يتوزع بالنسبة
  const discountShare = sale.subtotal > 0 ? sale.discount / sale.subtotal : 0;
  let amount = 0;
  const rows: { item: (typeof items)[number]; quantity: number; amount: number }[] = [];
  for (const r of p.items) {
    const item = items.find((i) => i.id === saleItemId(sale.id, r.index));
    if (!item) throw new RejectError("سطر غير موجود في الفاتورة.");
    if (r.quantity > item.quantity - item.returnedQty) throw new RejectError(`الكمية المرتجعة من «${item.name}» أكثر من المباع.`);
    const lineAmount = Math.round((item.total * r.quantity) / item.quantity * (1 - discountShare));
    rows.push({ item, quantity: r.quantity, amount: lineAmount });
    amount += lineAmount;
  }
  // الفلوس ترجع بنفس الطريقة (الأكبر في الفاتورة) أو اللي اختارها، والدين ينقص بدل الكاش
  const main = [...payments].sort((a, b) => b.amount - a.amount)[0]?.method ?? "cash";
  const method = p.refundMethod ?? main;
  if ((method === "credit" || method === "wallet") && !sale.customerId) throw new RejectError("الإرجاع للحساب أو المحفظة يحتاج زبون.");
  await tx.insert(t.saleReturns, { id: p.clientId, clientId: p.clientId, saleId: sale.id, shiftId: shift?.id ?? null, refundMethod: method, amount, reason: p.reason ?? null, actorUserId: p.userId, approvedBy: by, at: new Date(p.at) });
  const warehouseId = await branchWarehouse(tx, sale.branchId);
  for (const r of rows) {
    await tx.insert(t.saleReturnItems, { returnId: p.clientId, saleItemId: r.item.id, quantity: r.quantity, amount: r.amount });
    await tx.update(t.saleItems, { returnedQty: r.item.returnedQty + r.quantity }, eq(t.saleItems.id, r.item.id));
    if (r.item.variantId && r.item.baseQty > 0) {
      const base = Math.round((r.item.baseQty * r.quantity) / r.item.quantity);
      await moveStock(tx, { variantId: r.item.variantId, baseQty: base, sign: 1, reason: "pos_return", warehouseId, note: `مرتجع فاتورة ${sale.number}`, actorUserId: p.userId });
    }
  }
  const after = await tx.from(t.saleItems, eq(t.saleItems.saleId, sale.id));
  const status = after.every((i) => i.returnedQty >= i.quantity) ? "returned" : "partially_returned";
  await tx.update(t.sales, { status }, eq(t.sales.id, sale.id));
  if (sale.customerId && method === "credit") await postCustomer(tx, { customerId: sale.customerId, account: "debt", amount: -amount, kind: "refund", method, refType: "return", refId: p.clientId, clientId: `${p.clientId}:debt`, actorUserId: p.userId, at: p.at });
  if (sale.customerId && method === "wallet") await postCustomer(tx, { customerId: sale.customerId, account: "wallet", amount, kind: "refund", method, refType: "return", refId: p.clientId, clientId: `${p.clientId}:wallet`, actorUserId: p.userId, at: p.at });
  await post(tx, accountFor(env, method), -amount, "pos_refund", { type: "return", id: p.clientId }, `مرتجع فاتورة ${sale.number}`, p.userId);
  const review = by ? [] : ["مرتجع بدون موافقة مشرف."];
  if (review.length) await tx.update(t.sales, { needsReview: true, reviewNotes: [...(sale.reviewNotes ?? []), ...review] }, eq(t.sales.id, sale.id));
  return { data: { returnId: p.clientId, amount, method, status }, audits };
}

// ===== الزبون من الكاشير =====

export async function createCustomer(tx: Tx, _env: PosEnv, p: OpPayload<"customer.create">): Promise<Applied> {
  const r = await upsertCustomer(tx, { id: p.clientId, phone: p.phone, name: p.name });
  return { data: { customerId: r.id, created: r.created }, audits: [] };
}

export async function customerMoney(tx: Tx, env: PosEnv, kind: "debt.pay" | "wallet.topup", p: OpPayload<"debt.pay">): Promise<Applied> {
  const customerId = (await resolveCustomer(tx, p.customerId))!;
  const shift = await shiftOf(tx, p.shiftId);
  const pay = kind === "debt.pay";
  await postCustomer(tx, {
    customerId, account: pay ? "debt" : "wallet", amount: pay ? -p.amount : p.amount, kind: pay ? "payment" : "topup", method: p.method,
    refType: shift ? "shift" : null, refId: shift?.id ?? null, clientId: p.clientId, actorUserId: p.userId, at: p.at,
  });
  await post(tx, accountFor(env, p.method), p.amount, pay ? "debt_payment" : "wallet_topup", { type: "customer", id: customerId }, pay ? "سداد دين" : "شحن محفظة", p.userId);
  return { data: { customerId, balance: await balanceOf(tx, customerId) }, audits: [] };
}

export async function attendance(tx: Tx, env: PosEnv, p: OpPayload<"attendance">): Promise<Applied> {
  if (p.kind === "in") {
    await tx.insert(t.staffAttendance, { id: p.clientId, clientId: p.clientId, userId: p.userId, branchId: env.device.branchId, inAt: new Date(p.at) });
    return { data: { id: p.clientId }, audits: [] };
  }
  const [open] = await tx.from(t.staffAttendance, and(eq(t.staffAttendance.userId, p.userId), isNull(t.staffAttendance.outAt))!).orderBy(sql`${t.staffAttendance.inAt} desc`).limit(1);
  if (!open) throw new RejectError("ما فيش دخول مسجّل للموظف.");
  await tx.update(t.staffAttendance, { outAt: new Date(p.at) }, eq(t.staffAttendance.id, open.id));
  return { data: { id: open.id }, audits: [] };
}
