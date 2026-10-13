import { and, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants";
import { LOCKED_STATUSES, RETURN_REASONS, TRANSITIONS, canTransition } from "@/lib/order-flow";
import { normalizeLibyanPhone } from "@/lib/phone";
import { fail, ok, type Result } from "../catalog/result";
import { t, type StoreScope, type StoreScopeCore } from "../tenant";

/** خطأ برسالة عربية جاهزة للعرض للبياع (يعمل rollback للمعاملة) */
export class OrderOpError extends Error {}

type Tx = StoreScopeCore;
type Order = typeof t.orders.$inferSelect;
type OrderItem = typeof t.orderItems.$inferSelect;

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof OrderOpError) return fail(e.message);
    throw e;
  }
}

async function loadOrder(tx: Tx, id: string, restrictCourierId?: string | null): Promise<Order> {
  const [o] = await tx.from(t.orders, eq(t.orders.id, id)).limit(1);
  if (!o) throw new OrderOpError("ما لقينا الطلبية. يمكن انحذف، حدّث الصفحة.");
  // المندوب يشوف ويتعامل مع طلبياته بس
  if (restrictCourierId !== undefined && restrictCourierId !== null && o.courierId !== restrictCourierId) throw new OrderOpError("ما لقينا الطلبية. يمكن انحذف، حدّث الصفحة.");
  return o;
}

async function bumpCustomer(tx: Tx, customerId: string, d: { orders?: number; delivered?: number; returned?: number; spent?: number }) {
  const col = t.customers;
  const set: Record<string, unknown> = {};
  if (d.orders) set.ordersCount = sql`max(0, ${col.ordersCount} + ${d.orders})`;
  if (d.delivered) set.deliveredCount = sql`max(0, ${col.deliveredCount} + ${d.delivered})`;
  if (d.returned) set.returnedCount = sql`max(0, ${col.returnedCount} + ${d.returned})`;
  if (d.spent) set.totalSpent = sql`max(0, ${col.totalSpent} + ${d.spent})`;
  if (Object.keys(set).length) await tx.update(t.customers, set as never, eq(col.id, customerId));
}

async function addStock(tx: Tx, items: { variantId: string; quantity: number }[], reason: "return" | "cancel", orderId: string, note: string, actor: string | null) {
  for (const i of items) {
    if (i.quantity <= 0) continue;
    await tx.update(t.productVariants, { stock: sql`${t.productVariants.stock} + ${i.quantity}` as unknown as number }, eq(t.productVariants.id, i.variantId));
    await tx.insert(t.stockMovements, { variantId: i.variantId, delta: i.quantity, reason, orderId, note, actorUserId: actor });
  }
}

async function history(tx: Tx, order: Pick<Order, "id">, from: OrderStatus | null, to: OrderStatus, note: string | null, actor: string | null) {
  await tx.insert(t.orderStatusHistory, { orderId: order.id, fromStatus: from, toStatus: to, note, actorUserId: actor });
}

// ===== تغيير الحالة =====

export type StatusInput = {
  orderId: string;
  to: OrderStatus;
  actorUserId: string | null;
  note?: string | null;
  courierId?: string | null;
  shipmentNumber?: string | null;
  /** لو المستخدم مندوب: يتعامل مع طلبياته بس */
  restrictCourierId?: string | null;
};

export function changeOrderStatus(scope: StoreScope, input: StatusInput): Promise<Result<{ status: OrderStatus }>> {
  return attempt(() =>
    scope.transaction(async (tx) => {
      const order = await loadOrder(tx, input.orderId, input.restrictCourierId);
      const from = order.status;
      const to = input.to;
      if (!canTransition(from, to)) {
        throw new OrderOpError(
          to === "returned" ? "المرتجع يتسجل من زر «تسجيل مرتجع»." : `ما تقدرش تحول الطلبية من «${ORDER_STATUS_LABELS[from]}» إلى «${ORDER_STATUS_LABELS[to]}».`,
        );
      }
      if (input.restrictCourierId && !(from === "with_courier" && to === "delivered")) throw new OrderOpError("المندوب يقدر يسجّل التوصيل فقط.");

      const set: Partial<typeof t.orders.$inferInsert> = { status: to };

      if (to === "with_courier") {
        const courierId = input.courierId ?? order.courierId;
        if (!courierId) throw new OrderOpError("اختار المندوب أو شركة التوصيل أول.");
        const [courier] = await tx.from(t.couriers, eq(t.couriers.id, courierId)).limit(1);
        if (!courier || !courier.isActive) throw new OrderOpError("المندوب غير موجود أو موقوف.");
        set.courierId = courierId;
        if (input.shipmentNumber !== undefined) set.shipmentNumber = input.shipmentNumber?.trim() || null;
      }

      if (to === "delivered") {
        if (order.paymentMethod === "cod") set.paymentStatus = "paid";
        await bumpCustomer(tx, order.customerId, { delivered: 1, spent: order.total });
        // الكاش اللي استلمه المندوب من الزبون (يظل عنده لين يسلّمه للبياع)
        if (order.paymentMethod === "cod" && order.courierId) {
          await tx.insert(t.courierCashEntries, { courierId: order.courierId, orderId: order.id, type: "collected", amount: order.total, note: `طلبية #${order.number}`, actorUserId: input.actorUserId });
        }
      }

      if (to === "cancelled") {
        const items = await tx.from(t.orderItems, eq(t.orderItems.orderId, order.id));
        await addStock(tx, items, "cancel", order.id, `إلغاء طلبية #${order.number}`, input.actorUserId);
        if (order.couponId) {
          await tx.update(t.coupons, { usedCount: sql`max(0, ${t.coupons.usedCount} - 1)` as unknown as number }, eq(t.coupons.id, order.couponId));
          await tx.delete(t.couponRedemptions, eq(t.couponRedemptions.orderId, order.id));
        }
        await bumpCustomer(tx, order.customerId, { orders: -1 });
        if (order.paymentStatus === "paid") set.paymentStatus = "refunded";
      }

      await tx.update(t.orders, set, eq(t.orders.id, order.id));
      await history(tx, order, from, to, input.note?.trim() || null, input.actorUserId);
      return { status: to };
    }),
  );
}

// ===== تعديل بيانات الطلبية =====

const detailsSchema = z.object({
  customerName: z.string().trim().min(2, "اكتب اسمك (حرفين على الأقل)").max(80, "الاسم طويل").optional(),
  customerPhone: z.string().trim().optional(),
  address: z.string().trim().min(3, "العنوان قصير").max(200, "العنوان طويل").optional(),
  notes: z.string().trim().max(300).nullish(),
  internalNotes: z.string().trim().max(1000, "الملاحظات الداخلية طويلة").nullish(),
  shipmentNumber: z.string().trim().max(60).nullish(),
  courierId: z.string().min(1).nullish(),
  deliveryFee: z.number().int().min(0).max(1_000_000_000).optional(),
});
export type OrderDetailsPatch = z.input<typeof detailsSchema>;

export function updateOrderDetails(scope: StoreScope, orderId: string, patch: unknown, actorUserId: string | null, restrictCourierId?: string | null): Promise<Result> {
  const parsed = detailsSchema.safeParse(patch);
  if (!parsed.success) return Promise.resolve(fail(parsed.error.issues[0]?.message ?? "البيانات غير صحيحة"));
  const p = parsed.data;
  return attempt(() =>
    scope.transaction(async (tx) => {
      const order = await loadOrder(tx, orderId, restrictCourierId);
      const onlyNotes = Object.keys(p).every((k) => k === "internalNotes");
      if (LOCKED_STATUSES.includes(order.status) && !onlyNotes) throw new OrderOpError("الطلبية مقفولة. تقدر تعدل الملاحظات الداخلية فقط.");

      const set: Partial<typeof t.orders.$inferInsert> = {};
      if (p.customerName !== undefined) set.customerName = p.customerName;
      if (p.customerPhone !== undefined) {
        const phone = normalizeLibyanPhone(p.customerPhone);
        if (!phone) throw new OrderOpError("رقم الهاتف مش صحيح.");
        set.customerPhone = phone;
      }
      if (p.address !== undefined) set.address = p.address;
      if (p.notes !== undefined) set.notes = p.notes || null;
      if (p.internalNotes !== undefined) set.internalNotes = p.internalNotes || null;
      if (p.shipmentNumber !== undefined) set.shipmentNumber = p.shipmentNumber || null;
      if (p.courierId !== undefined) {
        if (p.courierId) {
          const [c] = await tx.from(t.couriers, eq(t.couriers.id, p.courierId)).limit(1);
          if (!c || !c.isActive) throw new OrderOpError("المندوب غير موجود أو موقوف.");
        }
        set.courierId = p.courierId ?? null;
      }
      if (p.deliveryFee !== undefined) {
        set.deliveryFee = p.deliveryFee;
        set.total = order.subtotal - order.discount + p.deliveryFee;
      }
      if (Object.keys(set).length === 0) return;
      await tx.update(t.orders, set, eq(t.orders.id, order.id));
      const changed = Object.keys(set).filter((k) => k !== "internalNotes" && k !== "total");
      if (changed.length) await history(tx, order, order.status, order.status, `تعديل بيانات الطلبية (${changed.length})`, actorUserId);
    }),
  );
}

export async function bulkAssignCourier(scope: StoreScope, orderIds: string[], courierId: string | null, actorUserId: string | null): Promise<Result<{ count: number }>> {
  if (!orderIds.length) return fail("ما اخترت أي طلبية.");
  return attempt(() =>
    scope.transaction(async (tx) => {
      if (courierId) {
        const [c] = await tx.from(t.couriers, eq(t.couriers.id, courierId)).limit(1);
        if (!c || !c.isActive) throw new OrderOpError("المندوب غير موجود أو موقوف.");
      }
      const rows = await tx.from(t.orders, and(inArray(t.orders.id, orderIds), inArray(t.orders.status, ["new", "confirmed", "with_courier"]))!);
      for (const o of rows) {
        await tx.update(t.orders, { courierId }, eq(t.orders.id, o.id));
        await history(tx, o, o.status, o.status, courierId ? "تعيين مندوب" : "إلغاء تعيين المندوب", actorUserId);
      }
      return { count: rows.length };
    }),
  );
}

export function setPaymentStatus(scope: StoreScope, orderId: string, status: "pending" | "paid" | "refunded", actorUserId: string | null): Promise<Result> {
  return attempt(() =>
    scope.transaction(async (tx) => {
      const order = await loadOrder(tx, orderId);
      if (order.status === "cancelled" && status === "paid") throw new OrderOpError("الطلبية ملغية.");
      await tx.update(t.orders, { paymentStatus: status }, eq(t.orders.id, order.id));
      await history(tx, order, order.status, order.status, `حالة الدفع: ${{ pending: "بانتظار الدفع", paid: "مدفوع", refunded: "مسترجع" }[status]}`, actorUserId);
    }),
  );
}

// ===== المرتجعات =====

const returnSchema = z.object({
  orderId: z.string().min(1),
  reason: z.enum(RETURN_REASONS, { error: "اختار سبب المرتجع" }),
  reasonNote: z.string().trim().max(300).nullish(),
  restock: z.boolean().default(true),
  shippingLoss: z.number().int().min(0).max(1_000_000_000).default(0),
  /** كميات المرتجع لكل بند. ناقص = كل البنود بكامل كمياتها */
  items: z.array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().min(0).max(1000) })).optional(),
});

/**
 * تسجيل مرتجع:
 *  - من «مع المندوب» (رفض الاستلام): الطلبية كلها ترجع وتتحول «مرتجعة».
 *  - من «تم التوصيل»: كلي أو جزئي. تتحول «مرتجعة» لو رجعت كل الكميات، وإلا تبقى «تم التوصيل».
 *  - المخزون يرجع تلقائياً (restock) وتكلفة التوصيل الضايعة تتسجل للتقارير.
 */
export function registerReturn(scope: StoreScope, input: unknown, actorUserId: string | null, restrictCourierId?: string | null): Promise<Result<{ returnId: string; fullyReturned: boolean; refund: number }>> {
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve(fail(parsed.error.issues[0]?.message ?? "البيانات غير صحيحة"));
  const p = parsed.data;
  return attempt(() =>
    scope.transaction(async (tx) => {
      const order = await loadOrder(tx, p.orderId, restrictCourierId);
      if (order.status !== "with_courier" && order.status !== "delivered") throw new OrderOpError("المرتجع يتسجل لطلبية «مع المندوب» أو «تم التوصيل» فقط.");
      const items = await tx.from(t.orderItems, eq(t.orderItems.orderId, order.id));
      const previous = await tx.from(t.returnItems, inArray(t.returnItems.orderItemId, items.map((i) => i.id)));
      const already = new Map<string, number>();
      for (const r of previous) already.set(r.orderItemId, (already.get(r.orderItemId) ?? 0) + r.quantity);

      // الكميات المطلوبة (افتراضياً: كل المتبقي من كل بند)
      const wanted = new Map<string, number>();
      if (p.items) {
        for (const i of p.items) {
          const item = items.find((x) => x.id === i.orderItemId);
          if (!item) throw new OrderOpError("بند غير صحيح.");
          if (i.quantity > item.quantity - (already.get(item.id) ?? 0)) throw new OrderOpError(`كمية مرتجع «${item.name}» أكبر من المتبقي.`);
          if (i.quantity > 0) wanted.set(item.id, i.quantity);
        }
      } else {
        for (const item of items) { const left = item.quantity - (already.get(item.id) ?? 0); if (left > 0) wanted.set(item.id, left); }
      }
      if (wanted.size === 0) throw new OrderOpError("اختار كمية مرتجعة لبند واحد على الأقل.");

      const fullyReturned = items.every((i) => (already.get(i.id) ?? 0) + (wanted.get(i.id) ?? 0) === i.quantity);
      if (order.status === "with_courier" && !fullyReturned) throw new OrderOpError("الطلبية اللي مع المندوب ترجع كاملة. المرتجع الجزئي بعد التوصيل.");

      const [ret] = await tx.insert(t.returns, { orderId: order.id, reason: p.reason, reasonNote: p.reasonNote || null, restocked: p.restock, shippingLoss: p.shippingLoss, actorUserId });
      await tx.insert(t.returnItems, [...wanted].map(([orderItemId, quantity]) => ({ returnId: ret!.id, orderItemId, quantity })));

      if (p.restock) {
        await addStock(tx, [...wanted].map(([id, quantity]) => ({ variantId: items.find((i: OrderItem) => i.id === id)!.variantId, quantity })), "return", order.id, `مرتجع طلبية #${order.number}`, actorUserId);
      }

      const refund = [...wanted].reduce((s, [id, q]) => s + items.find((i) => i.id === id)!.unitPrice * q, 0);
      const wasDelivered = order.status === "delivered";
      await bumpCustomer(tx, order.customerId, { returned: 1, ...(wasDelivered ? { spent: -refund, ...(fullyReturned ? { delivered: -1 } : {}) } : {}) });

      const set: Partial<typeof t.orders.$inferInsert> = {};
      if (fullyReturned) {
        set.status = "returned";
        if (order.paymentStatus === "paid") set.paymentStatus = "refunded";
      }
      if (Object.keys(set).length) await tx.update(t.orders, set, eq(t.orders.id, order.id));
      await history(tx, order, order.status, fullyReturned ? "returned" : order.status, `${fullyReturned ? "مرتجع كامل" : "مرتجع جزئي"}${p.restock ? " (رجع للمخزون)" : ""}`, actorUserId);
      return { returnId: ret!.id, fullyReturned, refund };
    }),
  );
}

// ===== إيصالات التحويل =====

export function reviewReceipt(scope: StoreScope, receiptId: string, decision: "approved" | "rejected", actorUserId: string | null): Promise<Result> {
  return attempt(() =>
    scope.transaction(async (tx) => {
      const [r] = await tx.from(t.paymentReceipts, eq(t.paymentReceipts.id, receiptId)).limit(1);
      if (!r) throw new OrderOpError("ما لقينا الإيصال. يمكن انحذف، حدّث الصفحة.");
      const order = await loadOrder(tx, r.orderId);
      await tx.update(t.paymentReceipts, { status: decision }, eq(t.paymentReceipts.id, r.id));
      if (decision === "approved") await tx.update(t.orders, { paymentStatus: "paid" }, eq(t.orders.id, order.id));
      await history(tx, order, order.status, order.status, decision === "approved" ? "تم قبول إيصال التحويل" : "تم رفض إيصال التحويل", actorUserId);
    }),
  );
}

// ===== القراءة =====

export type OrderFilters = {
  status?: OrderStatus;
  q?: string;
  cityId?: string;
  courierId?: string;
  payment?: "cod" | "bank_transfer";
  from?: number; // ms
  to?: number; // ms
  page?: number;
  pageSize?: number;
  /** تقييد المندوب بطلبياته */
  restrictCourierId?: string | null;
};

const likeTerm = (q: string) => `%${q.trim().replace(/[\\%_]/g, "\\$&")}%`;

function baseConditions(f: OrderFilters) {
  const c = [];
  if (f.restrictCourierId) c.push(eq(t.orders.courierId, f.restrictCourierId));
  if (f.cityId) c.push(eq(t.orders.cityId, f.cityId));
  if (f.courierId) c.push(eq(t.orders.courierId, f.courierId));
  if (f.payment) c.push(eq(t.orders.paymentMethod, f.payment));
  if (f.from) c.push(gte(t.orders.createdAt, new Date(f.from)));
  if (f.to) c.push(lte(t.orders.createdAt, new Date(f.to)));
  const q = f.q?.trim();
  if (q) {
    const term = likeTerm(q);
    const digits = q.replace(/\D/g, "");
    const parts = [sql`${t.orders.customerName} LIKE ${term} ESCAPE '\\'`, sql`${t.orders.customerPhone} LIKE ${likeTerm(digits || q)} ESCAPE '\\'`];
    if (/^#?\d{1,9}$/.test(q)) parts.push(eq(t.orders.number, Number(q.replace("#", ""))));
    c.push(or(...parts)!);
  }
  return c;
}

export type OrderListItem = {
  id: string; number: number; customerName: string; customerPhone: string; cityName: string; address: string; total: number;
  status: OrderStatus; paymentMethod: string; paymentStatus: string; courierId: string | null; courierName: string | null;
  createdAt: number; flagged: boolean; itemCount: number;
};

export async function listOrders(scope: StoreScope, f: OrderFilters = {}) {
  const base = baseConditions(f);
  const where = and(...base, ...(f.status ? [eq(t.orders.status, f.status)] : []));
  const size = Math.min(f.pageSize ?? 25, 100);

  const [statusRows, total] = await Promise.all([
    scope.aggregate(t.orders, { status: t.orders.status, n: count() }, { where: base.length ? and(...base) : undefined, groupBy: [t.orders.status] }),
    scope.count(t.orders, where),
  ]);
  const counts = Object.fromEntries((statusRows as { status: OrderStatus; n: number }[]).map((r) => [r.status, r.n])) as Partial<Record<OrderStatus, number>>;

  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, f.page ?? 1), pageCount);
  const rows = await scope.from(t.orders, where).orderBy(desc(t.orders.createdAt), desc(t.orders.number)).limit(size).offset((page - 1) * size);

  const courierIds = [...new Set(rows.map((r) => r.courierId).filter((x): x is string => !!x))];
  const customerIds = [...new Set(rows.map((r) => r.customerId))];
  const [couriers, customers, items] = await Promise.all([
    courierIds.length ? scope.from(t.couriers, inArray(t.couriers.id, courierIds)) : [],
    customerIds.length ? scope.from(t.customers, inArray(t.customers.id, customerIds)) : [],
    rows.length ? scope.from(t.orderItems, inArray(t.orderItems.orderId, rows.map((r) => r.id))) : [],
  ]);
  const items2: OrderListItem[] = rows.map((r) => ({
    id: r.id, number: r.number, customerName: r.customerName, customerPhone: r.customerPhone, cityName: r.cityName, address: r.address, total: r.total,
    status: r.status, paymentMethod: r.paymentMethod, paymentStatus: r.paymentStatus,
    courierId: r.courierId, courierName: couriers.find((c) => c.id === r.courierId)?.name ?? null,
    createdAt: r.createdAt.getTime(),
    flagged: customers.find((c) => c.id === r.customerId)?.flag === "problematic",
    itemCount: items.filter((i) => i.orderId === r.id).reduce((s, i) => s + i.quantity, 0),
  }));
  return { items: items2, total, page, pageCount, counts, allCount: Object.values(counts).reduce((s, n) => s + (n ?? 0), 0) };
}

export type OrderDetail = {
  order: Order;
  items: OrderItem[];
  history: (typeof t.orderStatusHistory.$inferSelect)[];
  receipts: (typeof t.paymentReceipts.$inferSelect)[];
  returns: ((typeof t.returns.$inferSelect) & { items: { orderItemId: string; quantity: number }[] })[];
  courier: typeof t.couriers.$inferSelect | null;
  customer: typeof t.customers.$inferSelect | null;
  returnedQty: Record<string, number>;
};

export async function getOrderDetail(scope: StoreScope, id: string, restrictCourierId?: string | null): Promise<OrderDetail | null> {
  const [order] = await scope.from(t.orders, eq(t.orders.id, id)).limit(1);
  if (!order || (restrictCourierId && order.courierId !== restrictCourierId)) return null;
  const [items, hist, receipts, returns, couriers, customers] = await Promise.all([
    scope.from(t.orderItems, eq(t.orderItems.orderId, id)),
    scope.from(t.orderStatusHistory, eq(t.orderStatusHistory.orderId, id)).orderBy(t.orderStatusHistory.createdAt),
    scope.from(t.paymentReceipts, eq(t.paymentReceipts.orderId, id)).orderBy(t.paymentReceipts.createdAt),
    scope.from(t.returns, eq(t.returns.orderId, id)).orderBy(t.returns.createdAt),
    order.courierId ? scope.from(t.couriers, eq(t.couriers.id, order.courierId)).limit(1) : [],
    scope.from(t.customers, eq(t.customers.id, order.customerId)).limit(1),
  ]);
  const returnItems = returns.length ? await scope.from(t.returnItems, inArray(t.returnItems.returnId, returns.map((r) => r.id))) : [];
  const returnedQty: Record<string, number> = {};
  for (const ri of returnItems) returnedQty[ri.orderItemId] = (returnedQty[ri.orderItemId] ?? 0) + ri.quantity;
  return {
    order, items, history: hist, receipts, courier: couriers[0] ?? null, customer: customers[0] ?? null, returnedQty,
    returns: returns.map((r) => ({ ...r, items: returnItems.filter((ri) => ri.returnId === r.id).map((ri) => ({ orderItemId: ri.orderItemId, quantity: ri.quantity })) })),
  };
}

/** الحالات المتاحة كأزرار سريعة للحالة الحالية */
export const nextStatuses = (status: OrderStatus): OrderStatus[] => TRANSITIONS[status];
