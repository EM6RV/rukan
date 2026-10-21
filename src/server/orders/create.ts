import { markCartRecovered } from "../marketing/abandoned-carts";
import { notifyNewOrder } from "../push";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { writeTransaction, type Db } from "@/db";
import { cities, media, plans, stores } from "@/db/schema/platform";
import { canUse } from "@/lib/entitlements";
import { loadStoreLimits, ordersThisMonth } from "../entitlements";
import { variantPrice } from "@/lib/pricing";
import { firstError, nameSchema, phoneSchema } from "@/lib/validation";
import { isUniqueViolation } from "../db-errors";
import { computeStoreAccess, isStoreOpenToCustomers } from "../store-access";
import { variantLabels } from "../storefront/queries";
import { forStore, t, type StoreScope } from "../tenant";

/** خطأ برسالة عربية جاهزة للعرض للزبون (يعمل rollback للمعاملة) */
export class OrderError extends Error {}

export const MAX_LINE_QTY = 20;

export const orderInputSchema = z.object({
  items: z
    .array(z.object({ variantId: z.string().min(1), quantity: z.number().int("الكمية غير صحيحة").min(1, "الكمية غير صحيحة").max(MAX_LINE_QTY, `الحد الأقصى ${MAX_LINE_QTY} قطعة من كل صنف`) }))
    .min(1, "السلة فاضية")
    .max(30, "أصناف كثيرة في السلة"),
  name: nameSchema,
  phone: phoneSchema,
  cityId: z.string({ error: "اختار المدينة" }).min(1, "اختار المدينة"),
  address: z.string({ error: "اكتب العنوان" }).trim().min(3, "اكتب العنوان بالتفصيل").max(200, "العنوان طويل بزيادة"),
  notes: z.string().trim().max(300, "الملاحظات طويلة بزيادة").nullish().transform((v) => v || null),
  paymentMethod: z.enum(["cod", "bank_transfer"], { error: "اختار طريقة الدفع" }),
  couponCode: z.string().trim().max(30).nullish().transform((v) => v || null),
  receiptMediaId: z.string().min(1).nullish().transform((v) => v ?? null),
  source: z.string().trim().max(30).nullish().transform((v) => v || null),
});
export type OrderInput = z.input<typeof orderInputSchema>;

// ===== الكوبون =====

export type CouponCheck = { ok: true; couponId: string; code: string; discount: number } | { ok: false; error: string };

/** يتحقق من الكوبون ويحسب الخصم (ما يستهلكش الاستخدام). */
export async function checkCoupon(scope: StoreScope, rawCode: string, subtotal: number, now = Date.now()): Promise<CouponCheck> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "اكتب كود الخصم" };
  const [c] = await scope.from(t.coupons, sql`upper(${t.coupons.code}) = ${code}`).limit(1);
  if (!c || !c.isActive) return { ok: false, error: "ما لقينا كود الخصم هذا. تأكد من كتابته." };
  if (c.startsAt && c.startsAt.getTime() > now) return { ok: false, error: "كود الخصم لسا ما بدا" };
  if (c.expiresAt && c.expiresAt.getTime() <= now) return { ok: false, error: "كود الخصم انتهى" };
  if (c.maxUses !== null && c.usedCount >= c.maxUses) return { ok: false, error: "كود الخصم خلص استعماله" };
  if (c.minOrder !== null && subtotal < c.minOrder) return { ok: false, error: "الطلبية أقل من الحد الأدنى لكود الخصم" };
  const discount = c.type === "percent" ? Math.floor((subtotal * Math.min(100, c.value)) / 100) : Math.min(c.value, subtotal);
  return { ok: true, couponId: c.id, code: c.code, discount };
}

// ===== إنشاء الطلب =====

export type CreatedOrder = { orderId: string; number: number; trackingToken: string; total: number; paymentMethod: "cod" | "bank_transfer" };

export async function createOrder(db: Db, storeId: string, rawInput: unknown): Promise<{ ok: true; data: CreatedOrder } | { ok: false; error: string }> {
  const parsed = orderInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const input = parsed.data;

  try {
    const data = await writeTransaction(db, async (tx) => place(tx as unknown as Db, storeId, input));
    // إشعار الجهاز بدون انتظار (يتعطل بهدوء لو ما فيه مفاتيح VAPID)
    void notifyNewOrder(db, storeId, data.orderId).catch(() => {});
    return { ok: true, data };
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.message };
    if (isUniqueViolation(e)) return { ok: false, error: "ما قدرنا ننشئ الطلب. جرّب مرة ثانية." };
    throw e;
  }
}

async function place(db: Db, storeId: string, input: z.output<typeof orderInputSchema>): Promise<CreatedOrder> {
  const scope = forStore(db, storeId);

  const row = await db.select({ store: stores, plan: plans }).from(stores).leftJoin(plans, eq(plans.id, stores.planId)).where(eq(stores.id, storeId)).get();
  if (!row) throw new OrderError("ما لقينا المتجر. يمكن انحذف، حدّث الصفحة.");
  if (!isStoreOpenToCustomers(computeStoreAccess(row.store))) throw new OrderError("المتجر مغلق حالياً ولا يستقبل طلبيات.");
  const limits = await loadStoreLimits(db, row.store, row.plan);

  // --- الأصناف: الأسعار والمخزون من القاعدة، ما نثقش في العميل ---
  const merged = new Map<string, number>();
  for (const i of input.items) merged.set(i.variantId, (merged.get(i.variantId) ?? 0) + i.quantity);
  const variantIds = [...merged.keys()];
  const variants = await scope.from(t.productVariants, and(inArray(t.productVariants.id, variantIds), eq(t.productVariants.isActive, true))!);
  const products = variants.length
    ? await scope.from(t.products, and(inArray(t.products.id, [...new Set(variants.map((v) => v.productId))]), eq(t.products.isVisible, true), isNull(t.products.deletedAt))!)
    : [];
  const pById = new Map(products.map((p) => [p.id, p]));
  const labels = await variantLabels(scope, variantIds);
  const images = products.length ? await scope.from(t.productImages, inArray(t.productImages.productId, products.map((p) => p.id))).orderBy(t.productImages.position) : [];

  const lines = variantIds.map((id) => {
    const v = variants.find((x) => x.id === id);
    const p = v ? pById.get(v.productId) : undefined;
    if (!v || !p) throw new OrderError("أحد المنتجات في سلتك لم يعد متوفراً. حدّث السلة وجرّب.");
    const quantity = merged.get(id)!;
    if (v.stock < quantity) throw new OrderError(v.stock <= 0 ? `«${p.name}» نفد من المخزون.` : `«${p.name}» المتوفر منه ${v.stock} فقط.`);
    return { v, p, quantity, price: variantPrice(p, v), label: labels.get(id) ?? null };
  });
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);

  // --- الكوبون ---
  let discount = 0;
  let coupon: { id: string; code: string } | null = null;
  if (input.couponCode) {
    if (!canUse(limits, "coupons")) throw new OrderError("كود الخصم غير متاح في هذا المتجر.");
    const c = await checkCoupon(scope, input.couponCode, subtotal);
    if (!c.ok) throw new OrderError(c.error);
    discount = c.discount;
    coupon = { id: c.couponId, code: c.code };
  }

  // --- التوصيل ---
  const [rate] = await scope.from(t.deliveryRates, and(eq(t.deliveryRates.cityId, input.cityId), eq(t.deliveryRates.isActive, true))!).limit(1);
  if (!rate) throw new OrderError("للأسف ما نوصلوش لهذه المدينة حالياً.");
  const [settings] = await scope.from(t.storeSettings).limit(1);
  const afterDiscount = subtotal - discount;
  const deliveryFee = settings?.freeDeliveryOver != null && afterDiscount >= settings.freeDeliveryOver ? 0 : rate.fee;
  const total = afterDiscount + deliveryFee;

  const city = await db.select().from(cities).where(eq(cities.id, input.cityId)).get();
  if (!city) throw new OrderError("المدينة غير صحيحة.");

  // --- الدفع ---
  const [pm] = await scope.from(t.storePaymentMethods, and(eq(t.storePaymentMethods.method, input.paymentMethod), eq(t.storePaymentMethods.isEnabled, true))!).limit(1);
  if (!pm) throw new OrderError("طريقة الدفع هذي غير متاحة.");
  if (input.paymentMethod === "bank_transfer") {
    if (!input.receiptMediaId) throw new OrderError("ارفع صورة إيصال التحويل.");
    const m = await db.select({ id: media.id }).from(media).where(and(eq(media.id, input.receiptMediaId), eq(media.storeId, storeId), eq(media.isPrivate, true))).get();
    if (!m) throw new OrderError("إيصال التحويل غير صحيح، ارفعه من جديد.");
  }

  // --- الزبون (حسب الهاتف داخل المتجر) ---
  const [existing] = await scope.from(t.customers, eq(t.customers.phone, input.phone)).limit(1);
  let customerId: string;
  if (existing) {
    customerId = existing.id;
    await scope.update(t.customers, { name: input.name, ordersCount: existing.ordersCount + 1 }, eq(t.customers.id, existing.id));
  } else {
    const [created] = await scope.insert(t.customers, { phone: input.phone, name: input.name, ordersCount: 1 });
    customerId = created!.id;
  }

  // --- رقم الطلبية (تسلسلي لكل متجر، ذرّي) ---
  const [counter] = await db.update(stores).set({ nextOrderNumber: sql`${stores.nextOrderNumber} + 1` }).where(eq(stores.id, storeId)).returning({ next: stores.nextOrderNumber });
  const number = counter!.next - 1;

  // ترتيبها في الشهر (لحد «طلبيات في الشهر»: الطلبية ما تتقفلش على الزبون، البياع يشوفها لما يرقّي)
  const monthRank = (await ordersThisMonth(db, storeId)) + 1;
  const trackingToken = nanoid(20);
  const [order] = await scope.insert(t.orders, {
    number, trackingToken, customerId, customerName: input.name, customerPhone: input.phone,
    cityId: city.id, cityName: city.nameAr, address: input.address, notes: input.notes,
    status: "new", paymentMethod: input.paymentMethod, paymentStatus: "pending",
    subtotal, discount, deliveryFee, total, couponId: coupon?.id ?? null, couponCode: coupon?.code ?? null, source: input.source, monthRank,
  });
  const orderId = order!.id;
  await markCartRecovered(scope, input.phone); // لو كانت سلته متروكة: تنقفل

  await scope.insert(t.orderItems, lines.map((l) => ({
    orderId, productId: l.p.id, variantId: l.v.id, name: l.p.name, variantLabel: l.label, unitPrice: l.price,
    unitCost: l.v.costPrice ?? l.p.costPrice, quantity: l.quantity, imageMediaId: images.find((i) => i.productId === l.p.id)?.mediaId ?? null,
  })));
  await scope.insert(t.orderStatusHistory, { orderId, fromStatus: null, toStatus: "new", note: "طلبية جديدة من المتجر" });

  // --- خصم المخزون ذرّياً: الشرط stock >= qty داخل نفس الـ UPDATE يمنع البيع الزايد ---
  for (const l of lines) {
    const updated = await scope.update(t.productVariants, { stock: sql`${t.productVariants.stock} - ${l.quantity}` as unknown as number }, and(eq(t.productVariants.id, l.v.id), gte(t.productVariants.stock, l.quantity)));
    if (!updated.length) throw new OrderError(`«${l.p.name}» نفد من المخزون للتو. حدّث السلة وجرّب.`);
    await scope.insert(t.stockMovements, { variantId: l.v.id, delta: -l.quantity, reason: "order", orderId, note: `طلبية #${number}` });
  }

  if (coupon) {
    const used = await scope.update(t.coupons, { usedCount: sql`${t.coupons.usedCount} + 1` as unknown as number }, and(eq(t.coupons.id, coupon.id), sql`(${t.coupons.maxUses} IS NULL OR ${t.coupons.usedCount} < ${t.coupons.maxUses})`));
    if (!used.length) throw new OrderError("كود الخصم وصل لحد الاستخدام.");
    await scope.insert(t.couponRedemptions, { couponId: coupon.id, orderId, discount });
  }
  if (input.paymentMethod === "bank_transfer") await scope.insert(t.paymentReceipts, { orderId, mediaId: input.receiptMediaId!, status: "pending" });

  return { orderId, number, trackingToken, total, paymentMethod: input.paymentMethod };
}

// ===== التتبع =====

export type TrackedOrder = {
  number: number; status: string; paymentMethod: string; paymentStatus: string;
  subtotal: number; discount: number; deliveryFee: number; total: number;
  cityName: string; address: string; customerName: string; shipmentNumber: string | null; createdAt: number; couponCode: string | null;
  items: { name: string; variantLabel: string | null; unitPrice: number; quantity: number; imageMediaId: string | null }[];
  history: { status: string; at: number }[];
};

async function hydrateOrder(scope: StoreScope, o: typeof t.orders.$inferSelect): Promise<TrackedOrder> {
  const [items, history] = await Promise.all([
    scope.from(t.orderItems, eq(t.orderItems.orderId, o.id)),
    scope.from(t.orderStatusHistory, eq(t.orderStatusHistory.orderId, o.id)).orderBy(t.orderStatusHistory.createdAt),
  ]);
  return {
    number: o.number, status: o.status, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
    subtotal: o.subtotal, discount: o.discount, deliveryFee: o.deliveryFee, total: o.total, couponCode: o.couponCode,
    cityName: o.cityName, address: o.address, customerName: o.customerName, shipmentNumber: o.shipmentNumber, createdAt: o.createdAt.getTime(),
    items: items.map((i) => ({ name: i.name, variantLabel: i.variantLabel, unitPrice: i.unitPrice, quantity: i.quantity, imageMediaId: i.imageMediaId })),
    history: history.map((h) => ({ status: h.toStatus, at: h.createdAt.getTime() })),
  };
}

/** تأكيد الطلب بعد الشراء: الـ token عشوائي 20 حرف (ما يتخمنش) */
export async function getOrderByToken(scope: StoreScope, token: string): Promise<TrackedOrder | null> {
  if (token.length < 16 || token.length > 40) return null;
  const [o] = await scope.from(t.orders, eq(t.orders.trackingToken, token)).limit(1);
  return o ? hydrateOrder(scope, o) : null;
}

/** تتبع برقم الطلبية + رقم الهاتف. أي عدم تطابق يرجع null بدون كشف السبب. */
export async function trackOrder(scope: StoreScope, number: number, rawPhone: string): Promise<TrackedOrder | null> {
  const phone = phoneSchema.safeParse(rawPhone);
  if (!phone.success || !Number.isInteger(number)) return null;
  const [o] = await scope.from(t.orders, and(eq(t.orders.number, number), eq(t.orders.customerPhone, phone.data))!).limit(1);
  return o ? hydrateOrder(scope, o) : null;
}
