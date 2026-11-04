import { markCartRecovered } from "../marketing/abandoned-carts";
import { notifyNewOrder } from "../push";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { writeTransaction, type Db } from "@/db";
import { cities, media, plans, stores } from "@/db/schema/platform";
import { canUse } from "@/lib/entitlements";
import { loadStoreLimits, ordersThisMonth } from "../entitlements";
import { withBundleStock, expandStockLines } from "../catalog/bundles";
import { bumpRow } from "../inventory/warehouses";
import { shippingCompanyName, trackingUrl } from "@/lib/shipping-companies";
import { MANUAL_SOURCES, MANUAL_SOURCE_LABELS } from "@/lib/manual-sources";
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
    .array(z.object({ variantId: z.string().min(1), quantity: z.number().int("الكمية غير صحيحة").min(1, "الكمية غير صحيحة").max(MAX_LINE_QTY, `الحد الأقصى ${MAX_LINE_QTY} قطعة من كل صنف`), note: z.string().trim().max(200).nullish().transform((v) => v || null) }))
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


/** طلبية يسجلها البياع بيده (جات من واتساب/إنستا…): نفس قواعد المخزون والترقيم، مع سعر توصيل وخصم يدويين */
export const manualOrderSchema = orderInputSchema.omit({ couponCode: true, receiptMediaId: true, source: true }).extend({
  paymentMethod: z.enum(["cod", "bank_transfer"], { error: "اختار طريقة الدفع" }).default("cod"),
  manualSource: z.enum(MANUAL_SOURCES, { error: "اختار مصدر الطلبية" }),
  deliveryFee: z.number().int().min(0, "سعر التوصيل 0 أو أكثر").max(100_000_000).nullish().transform((v) => v ?? null),
  discount: z.number().int().min(0, "الخصم 0 أو أكثر").max(1_000_000_000).default(0),
  warehouseId: z.string().min(1).nullish().transform((v) => v ?? null),
});
type ManualOpts = { source: string; deliveryFee: number | null; discount: number; warehouseId: string | null };

export async function createManualOrder(db: Db, storeId: string, rawInput: unknown): Promise<{ ok: true; data: CreatedOrder } | { ok: false; error: string }> {
  const parsed = manualOrderSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { manualSource, deliveryFee, discount, warehouseId, ...rest } = parsed.data;
  const input = { ...rest, couponCode: null, receiptMediaId: null, source: `manual:${manualSource}` };
  try {
    const data = await writeTransaction(db, async (tx) => place(tx as unknown as Db, storeId, input, { source: manualSource, deliveryFee, discount, warehouseId }));
    return { ok: true, data };
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.message };
    if (isUniqueViolation(e)) return { ok: false, error: "ما قدرنا ننشئ الطلب. جرّب مرة ثانية." };
    throw e;
  }
}

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

async function place(db: Db, storeId: string, input: z.output<typeof orderInputSchema>, manual?: ManualOpts): Promise<CreatedOrder> {
  const scope = forStore(db, storeId);

  const row = await db.select({ store: stores, plan: plans }).from(stores).leftJoin(plans, eq(plans.id, stores.planId)).where(eq(stores.id, storeId)).get();
  if (!row) throw new OrderError("ما لقينا المتجر. يمكن انحذف، حدّث الصفحة.");
  if (!manual && !isStoreOpenToCustomers(computeStoreAccess(row.store))) throw new OrderError("المتجر مغلق حالياً ولا يستقبل طلبيات.");
  const limits = await loadStoreLimits(db, row.store, row.plan);

  // --- الأصناف: الأسعار والمخزون من القاعدة، ما نثقش في العميل ---
  const merged = new Map<string, number>();
  const notes = new Map<string, string>(); // نقش/إهداء: سطر واحد لكل متغير
  for (const i of input.items) { merged.set(i.variantId, (merged.get(i.variantId) ?? 0) + i.quantity); if (i.note) notes.set(i.variantId, i.note); }
  const variantIds = [...merged.keys()];
  const rawVariants = await scope.from(t.productVariants, and(inArray(t.productVariants.id, variantIds), eq(t.productVariants.isActive, true))!);
  const products = rawVariants.length
    ? await scope.from(t.products, and(inArray(t.products.id, [...new Set(rawVariants.map((v) => v.productId))]), eq(t.products.isVisible, true), isNull(t.products.deletedAt))!)
    : [];
  const variants = await withBundleStock(scope, products, rawVariants); // مخزون الباقات من مكوناتها
  const pById = new Map(products.map((p) => [p.id, p]));
  const labels = await variantLabels(scope, variantIds);
  const images = products.length ? await scope.from(t.productImages, inArray(t.productImages.productId, products.map((p) => p.id))).orderBy(t.productImages.position) : [];

  const lines = variantIds.map((id) => {
    const v = variants.find((x) => x.id === id);
    const p = v ? pById.get(v.productId) : undefined;
    if (!v || !p) throw new OrderError("أحد المنتجات في سلتك لم يعد متوفراً. حدّث السلة وجرّب.");
    const quantity = merged.get(id)!;
    if (v.stock < quantity) throw new OrderError(v.stock <= 0 ? `«${p.name}» نفد من المخزون.` : `«${p.name}» المتوفر منه ${v.stock} فقط.`);
    let price = variantPrice(p, v);
    let personalization: string | null = null;
    const note = notes.get(id);
    if (note && p.personalizationLabel) {
      if (note.length > (p.personalizationMaxChars ?? 40)) throw new OrderError(`«${p.personalizationLabel}» لا يزيد عن ${p.personalizationMaxChars ?? 40} حرف.`);
      personalization = note;
      price += p.personalizationPrice;
    }
    return { v, p, quantity, price, personalization, label: labels.get(id) ?? null };
  });
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);

  // --- الكوبون ---
  let discount = 0;
  let coupon: { id: string; code: string } | null = null;
  if (manual) {
    discount = Math.min(manual.discount, subtotal);
  } else if (input.couponCode) {
    if (!canUse(limits, "coupons")) throw new OrderError("كود الخصم غير متاح في هذا المتجر.");
    const c = await checkCoupon(scope, input.couponCode, subtotal);
    if (!c.ok) throw new OrderError(c.error);
    discount = c.discount;
    coupon = { id: c.couponId, code: c.code };
  }

  // --- التوصيل ---
  const [rate] = await scope.from(t.deliveryRates, and(eq(t.deliveryRates.cityId, input.cityId), eq(t.deliveryRates.isActive, true))!).limit(1);
  if (!rate && manual?.deliveryFee == null) throw new OrderError(manual ? "ما فيه سعر توصيل للمدينة هذي. اكتب سعر التوصيل بيدك." : "للأسف ما نوصلوش لهذه المدينة حالياً.");
  const [settings] = await scope.from(t.storeSettings).limit(1);
  const afterDiscount = subtotal - discount;
  const deliveryFee = manual?.deliveryFee != null ? manual.deliveryFee : settings?.freeDeliveryOver != null && afterDiscount >= settings.freeDeliveryOver ? 0 : rate!.fee;
  const total = afterDiscount + deliveryFee;

  const city = await db.select().from(cities).where(eq(cities.id, input.cityId)).get();
  if (!city) throw new OrderError("المدينة غير صحيحة.");

  // --- الدفع ---
  const [pm] = await scope.from(t.storePaymentMethods, and(eq(t.storePaymentMethods.method, input.paymentMethod), eq(t.storePaymentMethods.isEnabled, true))!).limit(1);
  if (!pm && !manual) throw new OrderError("طريقة الدفع هذي غير متاحة.");
  if (input.paymentMethod === "bank_transfer" && !manual) {
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
    unitCost: l.v.costPrice ?? l.p.costPrice, quantity: l.quantity, personalizationText: l.personalization, imageMediaId: images.find((i) => i.productId === l.p.id)?.mediaId ?? null,
  })));
  await scope.insert(t.orderStatusHistory, { orderId, fromStatus: null, toStatus: "new", note: manual ? `طلبية يدوية (${MANUAL_SOURCE_LABELS[manual.source as (typeof MANUAL_SOURCES)[number]] ?? manual.source})` : "طلبية جديدة من المتجر" });

  // المخزن اللي تنسحب منه الطلبية (وحدة المخازن): الرئيسي = null، وغيره لازم يكون مفتوح وفيه الكمية
  let wh: { id: string } | null = null;
  if (manual?.warehouseId) {
    const [w] = await scope.from(t.warehouses, eq(t.warehouses.id, manual.warehouseId)).limit(1);
    if (!w || !w.isActive) throw new OrderError("المخزن غير موجود أو موقوف.");
    if (w.isLocked) throw new OrderError(`المخزن «${w.name}» مقفول أثناء الجرد.`);
    if (!w.isDefault) wh = w;
  }
  if (wh) await scope.update(t.orders, { warehouseId: wh.id }, eq(t.orders.id, orderId));

  // --- خصم المخزون ذرّياً: الشرط stock >= qty داخل نفس الـ UPDATE يمنع البيع الزايد ---
  for (const l of lines) {
    for (const c of await expandStockLines(scope, l.v.id, l.quantity)) {
      const updated = await scope.update(t.productVariants, { stock: sql`${t.productVariants.stock} - ${c.quantity}` as unknown as number }, and(eq(t.productVariants.id, c.variantId), gte(t.productVariants.stock, c.quantity)));
      if (!updated.length) throw new OrderError(`«${l.p.name}» نفد من المخزون للتو. حدّث السلة وجرّب.`);
      if (wh) { try { await bumpRow(scope, wh.id, c.variantId, -c.quantity); } catch { throw new OrderError(`«${l.p.name}» الكمية في المخزن المختار أقل من المطلوب.`); } }
      await scope.insert(t.stockMovements, { variantId: c.variantId, delta: -c.quantity, reason: "order", orderId, warehouseId: wh?.id ?? null, note: c.viaBundle ? `طلبية #${number} (ضمن باقة ${l.p.name})` : `طلبية #${number}` });
    }
  }

  if (coupon) {
    const used = await scope.update(t.coupons, { usedCount: sql`${t.coupons.usedCount} + 1` as unknown as number }, and(eq(t.coupons.id, coupon.id), sql`(${t.coupons.maxUses} IS NULL OR ${t.coupons.usedCount} < ${t.coupons.maxUses})`));
    if (!used.length) throw new OrderError("كود الخصم وصل لحد الاستخدام.");
    await scope.insert(t.couponRedemptions, { couponId: coupon.id, orderId, discount });
  }
  if (input.paymentMethod === "bank_transfer" && input.receiptMediaId) await scope.insert(t.paymentReceipts, { orderId, mediaId: input.receiptMediaId, status: "pending" });

  return { orderId, number, trackingToken, total, paymentMethod: input.paymentMethod };
}

// ===== التتبع =====

export type TrackedOrder = {
  number: number; status: string; paymentMethod: string; paymentStatus: string;
  subtotal: number; discount: number; deliveryFee: number; total: number;
  cityName: string; address: string; customerName: string; shipmentNumber: string | null; shippingCompany: string | null; trackingUrl: string | null; createdAt: number; couponCode: string | null;
  items: { name: string; variantLabel: string | null; unitPrice: number; quantity: number; imageMediaId: string | null; personalization: string | null }[];
  history: { status: string; at: number }[];
};

async function hydrateOrder(scope: StoreScope, o: typeof t.orders.$inferSelect): Promise<TrackedOrder> {
  const [[cfg], items, history] = await Promise.all([
    scope.from(t.storeSettings).limit(1),
    scope.from(t.orderItems, eq(t.orderItems.orderId, o.id)),
    scope.from(t.orderStatusHistory, eq(t.orderStatusHistory.orderId, o.id)).orderBy(t.orderStatusHistory.createdAt),
  ]);
  return {
    number: o.number, status: o.status, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
    subtotal: o.subtotal, discount: o.discount, deliveryFee: o.deliveryFee, total: o.total, couponCode: o.couponCode,
    cityName: o.cityName, address: o.address, customerName: o.customerName, shipmentNumber: o.shipmentNumber, shippingCompany: shippingCompanyName(o.shippingCompany), trackingUrl: o.shippingCompany ? trackingUrl(cfg?.shippingTrackingUrls?.[o.shippingCompany], o.shipmentNumber) : null, createdAt: o.createdAt.getTime(),
    items: items.map((i) => ({ name: i.name, variantLabel: i.variantLabel, unitPrice: i.unitPrice, quantity: i.quantity, imageMediaId: i.imageMediaId, personalization: i.personalizationText })),
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
