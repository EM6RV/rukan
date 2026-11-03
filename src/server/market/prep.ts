// تجهيز الطلبيات الأونلاين في المحل: طابور على شاشة المحل، التجميع بالمسح، اقتراح بديل للناقص (يتأكد مع الزبون
// على واتساب) وتطبيقه، ثم «جاهزة» وتمشي لنظام المندوبين الموجود.
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { ScaleConfig } from "@/lib/barcode";
import { formatMoney } from "@/lib/money";
import { fail, ok, type Result } from "../catalog/result";
import { applyWarehouseDelta, WarehouseError } from "../inventory/warehouses";
import { t, type StoreScope } from "../tenant";
import { lookupBarcode } from "./catalog";

const ACTIVE = ["new", "confirmed"] as const;

export async function prepQueue(scope: StoreScope) {
  const orders = await scope.from(t.orders, inArray(t.orders.status, [...ACTIVE])).orderBy(t.orders.createdAt);
  const pending = orders.filter((o) => o.prepStatus !== "ready");
  const items = pending.length ? await scope.from(t.orderItems, inArray(t.orderItems.orderId, pending.map((o) => o.id))) : [];
  const vids = [...new Set(items.map((i) => i.variantId))];
  const [vs, ps] = await Promise.all([
    vids.length ? scope.from(t.productVariants, inArray(t.productVariants.id, vids)) : Promise.resolve([]),
    scope.from(t.products),
  ]);
  return pending.map((o) => {
    const mine = items.filter((i) => i.orderId === o.id);
    return {
      id: o.id, number: o.number, status: o.status, prepStatus: o.prepStatus ?? "pending", customerName: o.customerName, customerPhone: o.customerPhone,
      cityName: o.cityName, address: o.address, notes: o.notes, total: o.total, at: o.createdAt.getTime(),
      picked: mine.reduce((s, i) => s + Math.min(i.pickedQty, i.quantity), 0), units: mine.reduce((s, i) => s + i.quantity, 0),
      items: mine.map((i) => {
        const v = vs.find((x) => x.id === i.variantId), p = ps.find((x) => x.id === i.productId);
        return { id: i.id, name: i.name, label: i.variantLabel, quantity: i.quantity, picked: i.pickedQty, stock: v?.stock ?? 0, shelf: p?.shelf ?? null, substituteVariantId: i.substituteVariantId, substituteNote: i.substituteNote, unitPrice: i.unitPrice };
      }),
    };
  });
}

async function loadOrder(scope: StoreScope, orderId: string) {
  const [o] = await scope.from(t.orders, eq(t.orders.id, orderId)).limit(1);
  if (!o) throw new WarehouseError("ما لقينا الطلبية.");
  if (!(ACTIVE as readonly string[]).includes(o.status)) throw new WarehouseError("الطلبية مش في مرحلة التجهيز.");
  return o;
}
const attempt = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try { return await fn(); } catch (e) { if (e instanceof WarehouseError) return fail(e.message); throw e; }
};

/** مسح صنف أثناء التجميع: يزيد المجمّع للسطر المطابق (ما يتعداش المطلوب) */
export function pickByScan(scope: StoreScope, orderId: string, code: string, actorUserId: string | null, scale?: ScaleConfig): Promise<Result<{ itemId: string; name: string; picked: number; quantity: number; complete: boolean }>> {
  return attempt(async () => {
    const o = await loadOrder(scope, orderId);
    const hit = await lookupBarcode(scope, code, scale);
    if (!hit) return fail(`الباركود ${code} مش مسجّل.`);
    const items = await scope.from(t.orderItems, eq(t.orderItems.orderId, o.id));
    const item = items.find((i) => i.variantId === hit.variantId && i.pickedQty < i.quantity) ?? items.find((i) => i.variantId === hit.variantId);
    if (!item) return fail(`«${hit.name}» مش في الطلبية هذي.`);
    if (item.pickedQty >= item.quantity) return fail(`«${item.name}» اتجمع كامل (${item.quantity}).`);
    const picked = Math.min(item.quantity, item.pickedQty + (hit.factor > 1 ? hit.factor : 1));
    await scope.update(t.orderItems, { pickedQty: picked }, eq(t.orderItems.id, item.id));
    if (o.prepStatus !== "picking") await scope.update(t.orders, { prepStatus: "picking", preparedBy: actorUserId }, eq(t.orders.id, o.id));
    const after = items.map((i) => (i.id === item.id ? { ...i, pickedQty: picked } : i));
    return ok({ itemId: item.id, name: item.name, picked, quantity: item.quantity, complete: after.every((i) => i.pickedQty >= i.quantity) });
  });
}

/** تعديل المجمّع يدوياً (بدون باركود) */
export function setPicked(scope: StoreScope, orderId: string, itemId: string, picked: number): Promise<Result> {
  return attempt(async () => {
    const o = await loadOrder(scope, orderId);
    const [item] = await scope.from(t.orderItems, and(eq(t.orderItems.id, itemId), eq(t.orderItems.orderId, o.id))!).limit(1);
    if (!item) return fail("ما لقينا الصنف.");
    if (!Number.isInteger(picked) || picked < 0 || picked > item.quantity) return fail("الكمية غير صحيحة.");
    await scope.update(t.orderItems, { pickedQty: picked }, eq(t.orderItems.id, item.id));
    if (!o.prepStatus) await scope.update(t.orders, { prepStatus: "picking" }, eq(t.orders.id, o.id));
    return ok(undefined);
  });
}

/** جاهزة للتوصيل: كل الأصناف متجمعة (أو force لو الناقص اتفق عليه مع الزبون) */
export function markPrepared(scope: StoreScope, orderId: string, actorUserId: string | null, force = false): Promise<Result<{ missing: number }>> {
  return attempt(async () => {
    const o = await loadOrder(scope, orderId);
    const items = await scope.from(t.orderItems, eq(t.orderItems.orderId, o.id));
    const missing = items.reduce((s, i) => s + Math.max(0, i.quantity - i.pickedQty), 0);
    if (missing && !force) return fail(`باقي ${missing} حبة ما اتجمعتش. كمّلهم أو اقترح بديل.`);
    await scope.update(t.orders, { prepStatus: "ready", preparedBy: actorUserId, preparedAt: new Date() }, eq(t.orders.id, o.id));
    await scope.insert(t.orderStatusHistory, { orderId: o.id, fromStatus: o.status, toStatus: o.status, note: missing ? `التجهيز خلص (ناقص ${missing} حبة بالاتفاق مع الزبون)` : "التجهيز خلص: جاهزة للتوصيل", actorUserId });
    return ok({ missing });
  });
}

/** بدائل مقترحة: نفس القسم، فيها مخزون، وسعرها قريب (±40%) */
export async function suggestSubstitutes(scope: StoreScope, itemId: string) {
  const [item] = await scope.from(t.orderItems, eq(t.orderItems.id, itemId)).limit(1);
  if (!item) return [];
  const links = await scope.from(t.productCategories, eq(t.productCategories.productId, item.productId));
  const cats = links.map((l) => l.categoryId);
  const peers = cats.length ? await scope.from(t.productCategories, inArray(t.productCategories.categoryId, cats)) : [];
  const pids = [...new Set(peers.map((p) => p.productId).filter((id) => id !== item.productId))];
  if (!pids.length) return [];
  const [ps, vs] = await Promise.all([
    scope.from(t.products, and(inArray(t.products.id, pids), isNull(t.products.deletedAt), eq(t.products.kind, "simple"))!),
    scope.from(t.productVariants, and(inArray(t.productVariants.productId, pids), eq(t.productVariants.isActive, true))!),
  ]);
  return vs.filter((v) => v.stock >= item.quantity).map((v) => {
    const p = ps.find((x) => x.id === v.productId);
    return p ? { variantId: v.id, name: p.name, price: v.price ?? p.price, stock: v.stock } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x && Math.abs(x.price - item.unitPrice) <= item.unitPrice * 0.4)
    .sort((a, b) => Math.abs(a.price - item.unitPrice) - Math.abs(b.price - item.unitPrice)).slice(0, 6);
}

/** يسجل البديل المقترح ويرجع رسالة واتساب للزبون باش يوافق */
export async function proposeSubstitute(scope: StoreScope, itemId: string, variantId: string | null, note: string | null, shopName: string): Promise<Result<{ message: string; phone: string }>> {
  const [item] = await scope.from(t.orderItems, eq(t.orderItems.id, itemId)).limit(1);
  if (!item) return fail("ما لقينا الصنف.");
  const [o] = await scope.from(t.orders, eq(t.orders.id, item.orderId)).limit(1);
  if (!o) return fail("ما لقينا الطلبية.");
  if (!variantId) {
    await scope.update(t.orderItems, { substituteVariantId: null, substituteNote: null }, eq(t.orderItems.id, item.id));
    return ok({ message: "", phone: o.customerPhone });
  }
  const [v] = await scope.from(t.productVariants, eq(t.productVariants.id, variantId)).limit(1);
  const [p] = v ? await scope.from(t.products, and(eq(t.products.id, v.productId), isNull(t.products.deletedAt))!).limit(1) : [];
  if (!v || !p) return fail("البديل غير موجود.");
  const clean = note?.trim().slice(0, 200) || null;
  await scope.update(t.orderItems, { substituteVariantId: v.id, substituteNote: clean }, eq(t.orderItems.id, item.id));
  const price = v.price ?? p.price;
  const message = [
    `مرحبا ${o.customerName}، معاك ${shopName} بخصوص طلبيتك رقم ${o.number}.`,
    `«${item.name}» خالص عندنا للأسف. نقترحوا بديله: «${p.name}» بسعر ${formatMoney(price)}${price !== item.unitPrice ? ` (بدل ${formatMoney(item.unitPrice)})` : ""}.`,
    ...(clean ? [clean] : []),
    "توافق على البديل؟ ردّ بـ «نعم» أو «لا».",
  ].join("\n");
  return ok({ message, phone: o.customerPhone });
}

/** الزبون وافق: البديل يحل محل الصنف (المخزون يرجع ويتسحب، والسعر والإجمالي يتحدثوا) */
export function applySubstitute(scope: StoreScope, itemId: string, actorUserId: string | null): Promise<Result<{ total: number }>> {
  return attempt(() => scope.transaction(async (tx) => {
    const [item] = await tx.from(t.orderItems, eq(t.orderItems.id, itemId)).limit(1);
    if (!item?.substituteVariantId) return fail("ما فيه بديل مقترح للصنف هذا.");
    const [o] = await tx.from(t.orders, eq(t.orders.id, item.orderId)).limit(1);
    if (!o || !(ACTIVE as readonly string[]).includes(o.status)) return fail("الطلبية مش في مرحلة التجهيز.");
    const [v] = await tx.from(t.productVariants, eq(t.productVariants.id, item.substituteVariantId)).limit(1);
    const [p] = v ? await tx.from(t.products, and(eq(t.products.id, v.productId), isNull(t.products.deletedAt))!).limit(1) : [];
    if (!v || !p) return fail("البديل غير موجود.");
    if (p.kind !== "simple") return fail("البديل لازم يكون منتج عادي (مش باقة).");
    const [orig] = await tx.from(t.products, eq(t.products.id, item.productId)).limit(1);
    if (orig?.kind === "bundle") return fail("الباقات ما تتبدلش: عدّل الطلبية يدوياً.");
    const note = `بديل في طلبية #${o.number}`;
    await applyWarehouseDelta(tx, { warehouseId: o.warehouseId, variantId: item.variantId, delta: item.quantity, reason: "substitute", note: `${note} (رجوع ${item.name})`, actorUserId, orderId: o.id });
    await applyWarehouseDelta(tx, { warehouseId: o.warehouseId, variantId: v.id, delta: -item.quantity, reason: "substitute", note: `${note} (${p.name})`, actorUserId, orderId: o.id });
    const price = v.price ?? p.price;
    await tx.update(t.orderItems, {
      productId: p.id, variantId: v.id, name: p.name, variantLabel: null, unitPrice: price, unitCost: v.costPrice ?? p.costPrice, pickedQty: 0,
      substituteVariantId: null, substituteNote: `بدل «${item.name}»`,
    }, eq(t.orderItems.id, item.id));
    const items = await tx.from(t.orderItems, eq(t.orderItems.orderId, o.id));
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const discount = Math.min(o.discount, subtotal);
    const total = subtotal - discount + o.deliveryFee;
    await tx.update(t.orders, { subtotal, discount, total }, eq(t.orders.id, o.id));
    await tx.insert(t.orderStatusHistory, { orderId: o.id, fromStatus: o.status, toStatus: o.status, note: `«${item.name}» اتبدل بـ «${p.name}» بموافقة الزبون`, actorUserId });
    return ok({ total });
  }));
}

export async function prepCounts(scope: StoreScope) {
  const rows = await scope.from(t.orders, and(inArray(t.orders.status, [...ACTIVE]), ne(t.orders.prepStatus, "ready"))!);
  const nulls = await scope.from(t.orders, and(inArray(t.orders.status, [...ACTIVE]), isNull(t.orders.prepStatus))!);
  return rows.length + nulls.length;
}
