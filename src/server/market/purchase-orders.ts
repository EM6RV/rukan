// اقتراح الشراء (حد إعادة الطلب + معدل البيع) وطلبات الشراء للمورد (واتساب) وتحويلها لفاتورة شراء،
// ومستحقات الموردين (الدفعات تتوزع على الفواتير الأقدم أول، والمتأخر حسب تاريخ الاستحقاق).
import { and, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { firstError } from "@/lib/validation";
import { DEFAULT_MIN_STOCK } from "../catalog/low-stock";
import { fail, ok, type Result } from "../catalog/result";
import { saveInvoice, supplierBalances } from "../inventory/purchasing";
import { t, type StoreScope } from "../tenant";

const DAY = 86_400_000;

export type Suggestion = {
  variantId: string; productId: string; name: string; stock: number; reorderPoint: number; dailyRate: number; daysLeft: number | null;
  /** الكمية المقترحة بالحبة، وبالوحدة الأكبر لو فيه (كرتونة) */
  quantity: number; unit: { name: string; factor: number } | null; unitQty: number;
  supplierId: string | null; lastCost: number | null;
};

/** المباع (بالحبة) لكل متغير من تاريخ معين: الكاشير + الطلبيات الأونلاين (غير الملغية) */
export async function soldSince(scope: StoreScope, since: number): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const add = (id: string | null, n: number) => { if (id && n > 0) out.set(id, (out.get(id) ?? 0) + n); };
  const sales = await scope.from(t.sales, gte(t.sales.soldAt, new Date(since)));
  if (sales.length) {
    const ids = sales.map((s) => s.id);
    for (let i = 0; i < ids.length; i += 400) {
      for (const it of await scope.from(t.saleItems, inArray(t.saleItems.saleId, ids.slice(i, i + 400)))) {
        add(it.variantId, it.baseQty - (it.quantity ? Math.round((it.baseQty * it.returnedQty) / it.quantity) : 0));
      }
    }
  }
  const orders = await scope.from(t.orders, and(gte(t.orders.createdAt, new Date(since)), ne(t.orders.status, "cancelled"))!);
  if (orders.length) {
    const ids = orders.map((o) => o.id);
    for (let i = 0; i < ids.length; i += 400) for (const it of await scope.from(t.orderItems, inArray(t.orderItems.orderId, ids.slice(i, i + 400)))) add(it.variantId, it.quantity);
  }
  return out;
}

/**
 * اقتراح الشراء: الصنف تحت حد إعادة الطلب (الحد الأدنى، أو استهلاك leadDays) يتقترح له كمية تغطي coverDays.
 * الكمية تتقرب لأكبر وحدة (كرتونة)، والمورد من آخر فاتورة شراء للصنف.
 */
export async function purchaseSuggestions(scope: StoreScope, o: { now?: number; windowDays?: number; coverDays?: number; leadDays?: number } = {}): Promise<Suggestion[]> {
  const now = o.now ?? Date.now(), windowDays = o.windowDays ?? 30, coverDays = o.coverDays ?? 14, leadDays = o.leadDays ?? 3;
  const [products, variants, units, sold, invoices, items] = await Promise.all([
    scope.from(t.products, and(isNull(t.products.deletedAt), eq(t.products.kind, "simple"))!),
    scope.from(t.productVariants, eq(t.productVariants.isActive, true)),
    scope.from(t.productUnits),
    soldSince(scope, now - windowDays * DAY),
    scope.from(t.purchaseInvoices, ne(t.purchaseInvoices.status, "cancelled")),
    scope.from(t.purchaseItems),
  ]);
  const pById = new Map(products.map((p) => [p.id, p]));
  const invById = new Map(invoices.map((i) => [i.id, i]));
  // آخر شراء لكل متغير
  const last = new Map<string, { supplierId: string; cost: number; at: number }>();
  for (const it of items) {
    const inv = invById.get(it.invoiceId);
    if (!inv) continue;
    const at = inv.createdAt.getTime(), cur = last.get(it.variantId);
    if (!cur || at > cur.at) last.set(it.variantId, { supplierId: inv.supplierId, cost: Math.round(it.unitCost / it.unitFactor), at });
  }
  const out: Suggestion[] = [];
  for (const v of variants) {
    const p = pById.get(v.productId);
    if (!p) continue;
    const rate = (sold.get(v.id) ?? 0) / windowDays;
    const min = v.minStock ?? DEFAULT_MIN_STOCK;
    const reorderPoint = Math.max(min, Math.ceil(rate * leadDays));
    if (v.stock > reorderPoint) continue;
    if (rate === 0 && v.minStock === null && v.stock > 0) continue; // ما يتباعش وعنده مخزون: ما نقترحوش
    let qty = Math.max(1, Math.ceil(rate * coverDays + reorderPoint - v.stock));
    const big = units.filter((u) => u.productId === p.id).sort((a, b) => b.factor - a.factor)[0];
    const unitQty = big ? Math.max(1, Math.ceil(qty / big.factor)) : qty;
    if (big) qty = unitQty * big.factor;
    const l = last.get(v.id);
    out.push({
      variantId: v.id, productId: p.id, name: p.name, stock: v.stock, reorderPoint, dailyRate: Math.round(rate * 100) / 100,
      daysLeft: rate > 0 ? Math.max(0, Math.floor(v.stock / rate)) : null, quantity: qty, unit: big ? { name: big.name, factor: big.factor } : null, unitQty,
      supplierId: l?.supplierId ?? null, lastCost: l?.cost ?? v.costPrice ?? p.costPrice ?? null,
    });
  }
  return out.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || a.name.localeCompare(b.name, "ar"));
}

// ===== طلبات الشراء =====

const poSchema = z.object({
  supplierId: z.string().min(1, "اختار المورد"),
  note: z.string().trim().max(300).nullish().transform((v) => v || null),
  items: z.array(z.object({
    variantId: z.string().min(1),
    quantity: z.number().int("الكمية رقم صحيح").min(1, "الكمية 1 على الأقل").max(1_000_000),
    unitFactor: z.number().int().min(1).max(100_000).default(1),
    unitName: z.string().trim().max(30).nullish().transform((v) => v || null),
    unitCost: z.number().int().min(0).max(1_000_000_000).default(0),
  })).min(1, "أضف صنف واحد على الأقل").max(200, "أصناف كثيرة"),
});

export async function createPurchaseOrder(scope: StoreScope, input: unknown, actorUserId: string | null): Promise<Result<{ id: string; number: number }>> {
  const p = poSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const ids = p.data.items.map((i) => i.variantId);
  if (new Set(ids).size !== ids.length) return fail("فيه صنف مكرر في الطلب.");
  return scope.transaction(async (tx) => {
    const [sup] = await tx.from(t.suppliers, eq(t.suppliers.id, p.data.supplierId)).limit(1);
    if (!sup) return fail("المورد غير موجود.");
    if ((await tx.count(t.productVariants, inArray(t.productVariants.id, ids))) !== ids.length) return fail("أحد الأصناف غير موجود.");
    const lastNo = (await tx.from(t.purchaseOrders).orderBy(t.purchaseOrders.number)).at(-1)?.number ?? 0;
    const [po] = await tx.insert(t.purchaseOrders, { number: lastNo + 1, supplierId: sup.id, note: p.data.note, createdBy: actorUserId });
    await tx.insert(t.purchaseOrderItems, p.data.items.map((i) => ({ orderId: po!.id, ...i })));
    return ok({ id: po!.id, number: po!.number });
  });
}

export async function listPurchaseOrders(scope: StoreScope) {
  const [pos, items, sups] = await Promise.all([scope.from(t.purchaseOrders).orderBy(t.purchaseOrders.number), scope.from(t.purchaseOrderItems), scope.from(t.suppliers)]);
  const sn = new Map(sups.map((s) => [s.id, s.name]));
  return pos.reverse().map((po) => {
    const mine = items.filter((i) => i.orderId === po.id);
    return { id: po.id, number: po.number, supplier: sn.get(po.supplierId) ?? "؟", status: po.status, lines: mine.length, total: mine.reduce((s, i) => s + i.quantity * i.unitCost, 0), at: po.createdAt.getTime(), invoiceId: po.invoiceId };
  });
}

export async function getPurchaseOrder(scope: StoreScope, id: string) {
  const [po] = await scope.from(t.purchaseOrders, eq(t.purchaseOrders.id, id)).limit(1);
  if (!po) return null;
  const [items, sup] = await Promise.all([scope.from(t.purchaseOrderItems, eq(t.purchaseOrderItems.orderId, id)), scope.from(t.suppliers, eq(t.suppliers.id, po.supplierId)).limit(1)]);
  const vs = items.length ? await scope.from(t.productVariants, inArray(t.productVariants.id, items.map((i) => i.variantId))) : [];
  const ps = vs.length ? await scope.from(t.products, inArray(t.products.id, [...new Set(vs.map((v) => v.productId))])) : [];
  const nameOf = (vid: string) => ps.find((p) => p.id === vs.find((v) => v.id === vid)?.productId)?.name ?? "؟";
  return {
    ...po, at: po.createdAt.getTime(), supplier: sup[0] ? { id: sup[0].id, name: sup[0].name, phone: sup[0].phone } : null,
    items: items.map((i) => ({ variantId: i.variantId, name: nameOf(i.variantId), quantity: i.quantity, unitFactor: i.unitFactor, unitName: i.unitName, unitCost: i.unitCost })),
  };
}

/** نص الطلب للمورد على واتساب */
export function purchaseOrderMessage(o: { shopName: string; number: number; note?: string | null; items: { name: string; quantity: number; unitName: string | null; unitFactor: number }[] }): string {
  const lines = o.items.map((i) => `• ${i.name}: ${i.quantity} ${i.unitName ?? (i.unitFactor > 1 ? `× ${i.unitFactor}` : "حبة")}`);
  return [`السلام عليكم، طلبية من ${o.shopName}`, `طلب شراء رقم ${o.number}:`, "", ...lines, ...(o.note ? ["", o.note] : []), "", "يرجى تأكيد التوفر والسعر وموعد التوصيل. شكراً."].join("\n");
}

export async function markPurchaseOrderSent(scope: StoreScope, id: string): Promise<Result> {
  const [po] = await scope.from(t.purchaseOrders, eq(t.purchaseOrders.id, id)).limit(1);
  if (!po) return fail("ما لقينا الطلب.");
  if (po.status === "draft") await scope.update(t.purchaseOrders, { status: "sent", sentAt: new Date() }, eq(t.purchaseOrders.id, id));
  return ok(undefined);
}

export async function cancelPurchaseOrder(scope: StoreScope, id: string): Promise<Result> {
  const [po] = await scope.from(t.purchaseOrders, eq(t.purchaseOrders.id, id)).limit(1);
  if (!po) return fail("ما لقينا الطلب.");
  if (po.status === "invoiced") return fail("الطلب اتحول لفاتورة شراء: ألغِ الفاتورة بدله.");
  await scope.update(t.purchaseOrders, { status: "cancelled" }, eq(t.purchaseOrders.id, id));
  return ok(undefined);
}

/** يحول طلب الشراء لفاتورة شراء (مسودة) باش تستلمها بالكميات الفعلية */
export async function purchaseOrderToInvoice(scope: StoreScope, id: string): Promise<Result<{ invoiceId: string }>> {
  const po = await getPurchaseOrder(scope, id);
  if (!po) return fail("ما لقينا الطلب.");
  if (po.status === "invoiced" && po.invoiceId) return ok({ invoiceId: po.invoiceId });
  if (po.status === "cancelled") return fail("الطلب ملغي.");
  const r = await saveInvoice(scope, { supplierId: po.supplierId, note: `من طلب الشراء رقم ${po.number}`, items: po.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitFactor: i.unitFactor, unitCost: i.unitCost })) }, { purchaseOrderId: po.id });
  if (!r.ok) return r;
  await scope.update(t.purchaseOrders, { status: "invoiced", invoiceId: r.data.id }, eq(t.purchaseOrders.id, id));
  return ok({ invoiceId: r.data.id });
}

// ===== مستحقات الموردين =====

export type SupplierDue = { supplierId: string; name: string; phone: string | null; balance: number; overdue: number; nextDueAt: number | null; openInvoices: { number: number; amount: number; unpaid: number; dueAt: number | null }[] };

/** رصيد كل مورد، والفواتير اللي لسه ما اتدفعتش (الدفعات والمرتجعات تتوزع على الأقدم أول) */
export async function supplierDues(scope: StoreScope, now = Date.now()): Promise<SupplierDue[]> {
  const [sups, invoices, items, bal] = await Promise.all([scope.from(t.suppliers), scope.from(t.purchaseInvoices, ne(t.purchaseInvoices.status, "cancelled")), scope.from(t.purchaseItems), supplierBalances(scope)]);
  const out: SupplierDue[] = [];
  for (const s of sups) {
    const balance = bal.get(s.id) ?? 0;
    const mine = invoices.filter((i) => i.supplierId === s.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const amounts = mine.map((i) => ({ inv: i, amount: items.filter((x) => x.invoiceId === i.id).reduce((a, x) => a + x.receivedQuantity * x.unitCost, 0) })).filter((x) => x.amount > 0);
    // المدفوع = مجموع الفواتير − الرصيد: يغطي الأقدم أول
    let paid = Math.max(0, amounts.reduce((a, x) => a + x.amount, 0) - balance);
    const open: SupplierDue["openInvoices"] = [];
    for (const x of amounts) {
      const cover = Math.min(paid, x.amount);
      paid -= cover;
      if (x.amount - cover > 0) open.push({ number: x.inv.number, amount: x.amount, unpaid: x.amount - cover, dueAt: x.inv.dueAt?.getTime() ?? null });
    }
    if (balance <= 0 && !open.length) continue;
    const overdue = open.filter((o) => o.dueAt !== null && o.dueAt < now).reduce((a, o) => a + o.unpaid, 0);
    const next = open.map((o) => o.dueAt).filter((d): d is number => d !== null && d >= now).sort((a, b) => a - b)[0] ?? null;
    out.push({ supplierId: s.id, name: s.name, phone: s.phone, balance, overdue, nextDueAt: next, openInvoices: open });
  }
  return out.sort((a, b) => b.overdue - a.overdue || b.balance - a.balance);
}
