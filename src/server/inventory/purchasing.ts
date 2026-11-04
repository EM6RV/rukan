// وحدة المشتريات والموردين. الاستلام يزيد المخزون ويحدّث متوسط التكلفة المرجّح (weighted average).
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { firstError } from "@/lib/validation";
import { normalizeLibyanPhone } from "@/lib/phone";
import { postEntry, LedgerError } from "../accounting/ledger";
import { fail, ok, type Result } from "../catalog/result";
import { t, type StoreScope, type StoreScopeCore } from "../tenant";
import { applyWarehouseDelta, quantitiesIn, WarehouseError } from "./warehouses";

type Core = Pick<StoreScopeCore, "from" | "insert" | "update" | "delete" | "count" | "aggregate">;
const money = (what: string) => z.number({ error: `${what} لازم يكون رقم` }).int(`${what} غير صحيح`).min(0, `${what} ما يكونش بالسالب`).max(1_000_000_000);

const attempt = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try { return await fn(); } catch (e) { if (e instanceof WarehouseError || e instanceof LedgerError) return fail(e.message); throw e; }
};

// ===== الموردين =====

const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string({ error: "اكتب اسم المورد" }).trim().min(1, "اكتب اسم المورد").max(80, "الاسم طويل"),
  phone: z.string().trim().max(20).nullish().transform((v) => v || null),
  city: z.string().trim().max(40).nullish().transform((v) => v || null),
  notes: z.string().trim().max(300).nullish().transform((v) => v || null),
  isActive: z.boolean().default(true),
});

export async function saveSupplier(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = supplierSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...data } = p.data;
  if (data.phone && !normalizeLibyanPhone(data.phone)) return fail("رقم هاتف المورد مش صحيح.");
  if (id) {
    const [row] = await scope.update(t.suppliers, data, eq(t.suppliers.id, id));
    return row ? ok({ id: row.id }) : fail("ما لقينا المورد. حدّث الصفحة.");
  }
  const [row] = await scope.insert(t.suppliers, data);
  return ok({ id: row!.id });
}

/** رصيد المورد = قيمة المستلم − الدفعات − المرتجعات (موجب = عليك له) */
export async function supplierBalances(scope: Core): Promise<Map<string, number>> {
  const [invoices, items, pays, rets] = await Promise.all([scope.from(t.purchaseInvoices), scope.from(t.purchaseItems), scope.from(t.supplierPayments), scope.from(t.supplierReturns)]);
  const bySupplier = new Map(invoices.map((i) => [i.id, i.supplierId]));
  const out = new Map<string, number>();
  const add = (id: string | undefined, n: number) => { if (id) out.set(id, (out.get(id) ?? 0) + n); };
  for (const it of items) add(bySupplier.get(it.invoiceId), it.receivedQuantity * it.unitCost);
  for (const p of pays) add(p.supplierId, -p.amount);
  for (const r of rets) add(r.supplierId, -(r.quantity * r.unitCost));
  return out;
}

export async function listSuppliers(scope: StoreScope) {
  const [rows, bal] = await Promise.all([scope.from(t.suppliers).orderBy(t.suppliers.name), supplierBalances(scope)]);
  return rows.map((s) => ({ id: s.id, name: s.name, phone: s.phone, city: s.city, notes: s.notes, isActive: s.isActive, balance: bal.get(s.id) ?? 0 }));
}

// ===== فواتير الشراء =====

const invoiceSchema = z.object({
  id: z.string().optional(),
  supplierId: z.string().min(1, "اختار المورد"),
  warehouseId: z.string().min(1).nullish().transform((v) => v ?? null),
  note: z.string().trim().max(300).nullish().transform((v) => v || null),
  /** تاريخ استحقاق الدفع للمورد */
  dueAt: z.number().int().positive().nullish().transform((v) => v ?? null),
  items: z.array(z.object({
    variantId: z.string().min(1), quantity: z.number().int("الكمية رقم صحيح").min(1, "الكمية 1 على الأقل").max(1_000_000), unitCost: money("سعر التكلفة"),
    /** الشراء بالكرتونة: الكمية والتكلفة بالكرتونة، وكل كرتونة = unitFactor حبة */
    unitFactor: z.number().int().min(1).max(100_000).default(1),
    batchNo: z.string().trim().max(40).nullish().transform((v) => v || null),
    expiresAt: z.number().int().positive().nullish().transform((v) => v ?? null),
  })).min(1, "أضف صنف واحد على الأقل").max(100, "أصناف كثيرة"),
});

export function saveInvoice(scope: StoreScope, input: unknown, opts: { purchaseOrderId?: string | null } = {}): Promise<Result<{ id: string; number: number }>> {
  const p = invoiceSchema.safeParse(input);
  if (!p.success) return Promise.resolve(fail(firstError(p.error)));
  return attempt(() => scope.transaction(async (tx) => {
    const [sup] = await tx.from(t.suppliers, eq(t.suppliers.id, p.data.supplierId)).limit(1);
    if (!sup) throw new WarehouseError("المورد غير موجود.");
    if (p.data.warehouseId && !(await tx.count(t.warehouses, eq(t.warehouses.id, p.data.warehouseId)))) throw new WarehouseError("المخزن غير موجود.");
    const vs = await tx.from(t.productVariants, inArray(t.productVariants.id, p.data.items.map((i) => i.variantId)));
    if (vs.length !== new Set(p.data.items.map((i) => i.variantId)).size) throw new WarehouseError("أحد الأصناف غير موجود.");
    let id = p.data.id, number: number;
    if (id) {
      const [inv] = await tx.from(t.purchaseInvoices, eq(t.purchaseInvoices.id, id)).limit(1);
      if (!inv) throw new WarehouseError("ما لقينا الفاتورة.");
      if (inv.status !== "draft") throw new WarehouseError("الفاتورة اتستلمت: ما تتعدلش. لو في غلط سجّل مرتجع للمورد.");
      await tx.update(t.purchaseInvoices, { supplierId: p.data.supplierId, warehouseId: p.data.warehouseId, note: p.data.note, dueAt: p.data.dueAt ? new Date(p.data.dueAt) : null }, eq(t.purchaseInvoices.id, id));
      await tx.delete(t.purchaseItems, eq(t.purchaseItems.invoiceId, id));
      number = inv.number;
    } else {
      const last = (await tx.from(t.purchaseInvoices).orderBy(t.purchaseInvoices.number)).at(-1);
      number = (last?.number ?? 0) + 1;
      const [inv] = await tx.insert(t.purchaseInvoices, { number, supplierId: p.data.supplierId, warehouseId: p.data.warehouseId, note: p.data.note, dueAt: p.data.dueAt ? new Date(p.data.dueAt) : null, purchaseOrderId: opts.purchaseOrderId ?? null });
      id = inv!.id;
    }
    await tx.insert(t.purchaseItems, p.data.items.map((i) => ({
      invoiceId: id!, variantId: i.variantId, quantity: i.quantity, unitCost: i.unitCost, unitFactor: i.unitFactor, batchNo: i.batchNo, expiresAt: i.expiresAt ? new Date(i.expiresAt) : null,
    })));
    return ok({ id: id!, number });
  }));
}

/** متوسط التكلفة المرجّح بعد استلام كمية */
export function weightedCost(oldStock: number, oldCost: number | null, qty: number, unitCost: number): number {
  if (oldStock <= 0 || oldCost === null) return unitCost;
  return Math.round((oldStock * oldCost + qty * unitCost) / (oldStock + qty));
}

/** استلام (كامل أو جزئي). receipts: [{itemId, quantity}] وإلا كل المتبقي. */
export function receiveInvoice(scope: StoreScope, invoiceId: string, receipts: { itemId: string; quantity: number }[] | null, actorUserId?: string | null): Promise<Result<{ status: string }>> {
  return attempt(() => scope.transaction(async (tx) => {
    const [inv] = await tx.from(t.purchaseInvoices, eq(t.purchaseInvoices.id, invoiceId)).limit(1);
    if (!inv || inv.status === "cancelled") throw new WarehouseError("الفاتورة غير موجودة أو ملغاة.");
    if (inv.status === "received") throw new WarehouseError("الفاتورة مستلمة بالكامل.");
    const items = await tx.from(t.purchaseItems, eq(t.purchaseItems.invoiceId, invoiceId));
    const plan = receipts ?? items.map((i) => ({ itemId: i.id, quantity: i.quantity - i.receivedQuantity }));
    if (inv.warehouseId) { const [w] = await tx.from(t.warehouses, eq(t.warehouses.id, inv.warehouseId)).limit(1); if (w?.isLocked) throw new WarehouseError(`المخزن «${w.name}» مقفول أثناء الجرد.`); }
    let any = false;
    for (const r of plan) {
      if (!Number.isInteger(r.quantity) || r.quantity < 0) throw new WarehouseError("كمية الاستلام غير صحيحة.");
      if (r.quantity === 0) continue;
      const it = items.find((x) => x.id === r.itemId);
      if (!it) throw new WarehouseError("صنف غير موجود في الفاتورة.");
      if (it.receivedQuantity + r.quantity > it.quantity) throw new WarehouseError("كمية الاستلام أكبر من المتبقي.");
      const [v] = await tx.from(t.productVariants, eq(t.productVariants.id, it.variantId)).limit(1);
      const [p] = v ? await tx.from(t.products, eq(t.products.id, v.productId)).limit(1) : [];
      if (!v || !p) throw new WarehouseError("منتج غير موجود.");
      // بالكرتونة: المخزون يزيد بالحبة، والتكلفة تتحسب للحبة
      const baseQty = r.quantity * it.unitFactor, baseCost = Math.round(it.unitCost / it.unitFactor);
      const newCost = weightedCost(v.stock, v.costPrice ?? p.costPrice, baseQty, baseCost);
      await applyWarehouseDelta(tx, { warehouseId: inv.warehouseId, variantId: it.variantId, delta: baseQty, reason: "purchase", note: `فاتورة شراء #${inv.number}`, actorUserId });
      await tx.update(t.productVariants, { costPrice: newCost }, eq(t.productVariants.id, it.variantId));
      // الدفعة والصلاحية (FEFO)
      if (it.batchNo || it.expiresAt) {
        await tx.insert(t.stockBatches, { variantId: it.variantId, batchNo: it.batchNo, expiresAt: it.expiresAt, quantity: baseQty, unitCost: baseCost, purchaseItemId: it.id, receivedAt: new Date() });
      }
      await tx.update(t.purchaseItems, { receivedQuantity: it.receivedQuantity + r.quantity }, eq(t.purchaseItems.id, it.id));
      it.receivedQuantity += r.quantity;
      any = true;
    }
    if (!any) throw new WarehouseError("ما فيه كمية للاستلام.");
    const status = items.every((i) => i.receivedQuantity >= i.quantity) ? "received" : "partial";
    await tx.update(t.purchaseInvoices, { status }, eq(t.purchaseInvoices.id, invoiceId));
    return ok({ status });
  }));
}

export function cancelInvoice(scope: StoreScope, invoiceId: string): Promise<Result> {
  return attempt(async () => {
    const [inv] = await scope.from(t.purchaseInvoices, eq(t.purchaseInvoices.id, invoiceId)).limit(1);
    if (!inv) throw new WarehouseError("ما لقينا الفاتورة.");
    if (inv.status !== "draft") throw new WarehouseError("الفاتورة اتستلمت جزئياً أو كلياً: سجّل مرتجع للمورد بدل الإلغاء.");
    await scope.update(t.purchaseInvoices, { status: "cancelled" }, eq(t.purchaseInvoices.id, invoiceId));
    return ok(undefined);
  });
}

export async function listInvoices(scope: StoreScope) {
  const [invs, items, sups, whs] = await Promise.all([scope.from(t.purchaseInvoices).orderBy(t.purchaseInvoices.number), scope.from(t.purchaseItems), scope.from(t.suppliers), scope.from(t.warehouses)]);
  const sn = new Map(sups.map((s) => [s.id, s.name])), wn = new Map(whs.map((w) => [w.id, w.name]));
  return invs.reverse().map((i) => {
    const mine = items.filter((x) => x.invoiceId === i.id);
    return { id: i.id, number: i.number, supplier: sn.get(i.supplierId) ?? "؟", warehouse: i.warehouseId ? wn.get(i.warehouseId) ?? "؟" : "الرئيسي", status: i.status, total: mine.reduce((s, x) => s + x.quantity * x.unitCost, 0), received: mine.reduce((s, x) => s + x.receivedQuantity * x.unitCost, 0), at: i.createdAt.getTime() };
  });
}

export async function getInvoice(scope: StoreScope, id: string) {
  const [inv] = await scope.from(t.purchaseInvoices, eq(t.purchaseInvoices.id, id)).limit(1);
  if (!inv) return null;
  const items = await scope.from(t.purchaseItems, eq(t.purchaseItems.invoiceId, id));
  const vs = items.length ? await scope.from(t.productVariants, inArray(t.productVariants.id, items.map((i) => i.variantId))) : [];
  const ps = vs.length ? await scope.from(t.products, inArray(t.products.id, [...new Set(vs.map((v) => v.productId))])) : [];
  const pn = new Map(ps.map((p) => [p.id, p.name]));
  return { ...inv, items: items.map((i) => ({ id: i.id, variantId: i.variantId, name: pn.get(vs.find((v) => v.id === i.variantId)?.productId ?? "") ?? "؟", quantity: i.quantity, received: i.receivedQuantity, unitCost: i.unitCost, unitFactor: i.unitFactor, batchNo: i.batchNo, expiresAt: i.expiresAt?.getTime() ?? null })) };
}

// ===== دفعات الموردين =====

/** دفعة للمورد. لو الحسابات شغّالة (accountId) تتسجل حركة خرج من الحساب في نفس العملية. */
export function paySupplier(scope: StoreScope, input: { supplierId: string; amount: number; accountId?: string | null; note?: string | null }, actorUserId?: string | null): Promise<Result<{ balance: number }>> {
  const a = z.number({ error: "المبلغ لازم يكون رقم" }).int("المبلغ غير صحيح").min(1, "اكتب مبلغ أكبر من صفر").max(1_000_000_000_000).safeParse(input.amount);
  if (!a.success) return Promise.resolve(fail(a.error.issues[0]!.message));
  return attempt(() => scope.transaction(async (tx) => {
    const [sup] = await tx.from(t.suppliers, eq(t.suppliers.id, input.supplierId)).limit(1);
    if (!sup) throw new WarehouseError("المورد غير موجود.");
    const [pay] = await tx.insert(t.supplierPayments, { supplierId: sup.id, accountId: input.accountId ?? null, amount: a.data, note: input.note?.trim() || null });
    if (input.accountId) await postEntry(tx, { accountId: input.accountId, amount: -a.data, kind: "supplier_payment", refType: "supplier_payment", refId: pay!.id, memo: `دفعة للمورد ${sup.name}`, actorUserId });
    return ok({ balance: (await supplierBalances(tx)).get(sup.id) ?? 0 });
  }));
}

/** مرتجع للمورد: ينقص المخزون ويقلل رصيد المورد بقيمته (بتكلفة الصنف الحالية لو ما حددتش) */
export function returnToSupplier(scope: StoreScope, input: { supplierId: string; variantId: string; quantity: number; warehouseId?: string | null; unitCost?: number | null; note?: string | null }, actorUserId?: string | null): Promise<Result<{ balance: number }>> {
  const q = z.number().int("الكمية رقم صحيح").min(1, "الكمية 1 على الأقل").max(1_000_000).safeParse(input.quantity);
  if (!q.success) return Promise.resolve(fail(q.error.issues[0]!.message));
  return attempt(() => scope.transaction(async (tx) => {
    const [sup] = await tx.from(t.suppliers, eq(t.suppliers.id, input.supplierId)).limit(1);
    const [v] = await tx.from(t.productVariants, eq(t.productVariants.id, input.variantId)).limit(1);
    if (!sup || !v) throw new WarehouseError("المورد أو الصنف غير موجود.");
    const [p] = await tx.from(t.products, eq(t.products.id, v.productId)).limit(1);
    const wid = input.warehouseId ?? null;
    if (wid) { const [w] = await tx.from(t.warehouses, eq(t.warehouses.id, wid)).limit(1); if (!w?.isActive) throw new WarehouseError("المخزن غير موجود."); if (w.isLocked) throw new WarehouseError(`المخزن «${w.name}» مقفول أثناء الجرد.`); }
    const have = wid ? (await quantitiesIn(tx, wid, [v.id])).get(v.id) ?? 0 : v.stock;
    if (have < q.data) throw new WarehouseError("الكمية في المخزن أقل من المرتجع.");
    const unitCost = input.unitCost ?? v.costPrice ?? p?.costPrice ?? 0;
    await applyWarehouseDelta(tx, { warehouseId: wid, variantId: v.id, delta: -q.data, reason: "purchase_return", note: `مرتجع للمورد ${sup.name}`, actorUserId });
    await tx.insert(t.supplierReturns, { supplierId: sup.id, variantId: v.id, warehouseId: wid, quantity: q.data, unitCost, note: input.note?.trim() || null });
    return ok({ balance: (await supplierBalances(tx)).get(sup.id) ?? 0 });
  }));
}

// ===== التقارير =====

export async function purchasesReport(scope: StoreScope, range: { from: number; to: number }) {
  const [invs, items, sups, bal] = await Promise.all([
    scope.from(t.purchaseInvoices, and(gte(t.purchaseInvoices.createdAt, new Date(range.from)), lte(t.purchaseInvoices.createdAt, new Date(range.to)))!),
    scope.from(t.purchaseItems), scope.from(t.suppliers), supplierBalances(scope),
  ]);
  const bySup = new Map<string, { invoices: number; total: number; received: number }>();
  for (const inv of invs.filter((i) => i.status !== "cancelled")) {
    const mine = items.filter((x) => x.invoiceId === inv.id);
    const cur = bySup.get(inv.supplierId) ?? { invoices: 0, total: 0, received: 0 };
    bySup.set(inv.supplierId, { invoices: cur.invoices + 1, total: cur.total + mine.reduce((s, x) => s + x.quantity * x.unitCost, 0), received: cur.received + mine.reduce((s, x) => s + x.receivedQuantity * x.unitCost, 0) });
  }
  return sups.map((s) => ({ supplierId: s.id, name: s.name, ...(bySup.get(s.id) ?? { invoices: 0, total: 0, received: 0 }), balance: bal.get(s.id) ?? 0 }));
}

