"use server";

import { canUse } from "@/lib/entitlements";
import { getDb } from "@/db";
import { z } from "zod";
import { phoneSchema } from "@/lib/validation";
import { getClientIp } from "@/server/auth/current";
import { captureCart } from "@/server/marketing/abandoned-carts";
import { checkCoupon, createOrder, trackOrder, type CreatedOrder, type TrackedOrder } from "@/server/orders/create";
import { hitRateLimit } from "@/server/ratelimit";
import { invalidateStore } from "@/server/storefront/data";
import { resolveCart } from "@/server/storefront/queries";
import { isStoreOpen, loadStore } from "@/server/storefront/request";
import type { CartLine } from "@/server/storefront/types";
import { forStore } from "@/server/tenant";

const cartItems = z.array(z.object({ variantId: z.string().min(1).max(40), quantity: z.number().int().min(1).max(20) })).max(50);

async function openStore(key: string) {
  const sf = await loadStore(key);
  return sf && isStoreOpen(sf) ? sf : null;
}

/** بنود السلة بأسعار ومخزون حقيقيين. البنود غير المتاحة تنشال. */
export async function resolveCartAction(key: string, items: unknown): Promise<CartLine[]> {
  const sf = await openStore(key);
  const parsed = cartItems.safeParse(items);
  if (!sf || !parsed.success) return [];
  return resolveCart(forStore(getDb(), sf.id), parsed.data);
}

export async function checkCouponAction(key: string, code: string, items: unknown): Promise<{ ok: true; code: string; discount: number } | { ok: false; error: string }> {
  const sf = await openStore(key);
  const parsed = cartItems.safeParse(items);
  if (!sf || !parsed.success) return { ok: false, error: "السلة غير صحيحة" };
  if (!canUse(sf.limits, "coupons")) return { ok: false, error: "كود الخصم غير متاح في هذا المتجر" };
  const ip = (await getClientIp()) ?? "unknown";
  const limit = await hitRateLimit(getDb(), `coupon:${sf.id}:${ip}`, { limit: 20, windowMs: 10 * 60_000 });
  if (!limit.allowed) return { ok: false, error: "محاولات كثيرة. استنى شوية وجرّب مرة ثانية." };
  const scope = forStore(getDb(), sf.id);
  const lines = await resolveCart(scope, parsed.data);
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const r = await checkCoupon(scope, code, subtotal);
  return r.ok ? { ok: true, code: r.code, discount: r.discount } : r;
}

const payload = z.object({
  items: cartItems, name: z.string(), phone: z.string(), cityId: z.string(), address: z.string(), notes: z.string().nullish(),
  paymentMethod: z.string(), couponCode: z.string().nullish(), receiptMediaId: z.string().nullish(),
  website: z.string().optional(), // honeypot: البشر ما يعبّوه
});

export async function placeOrderAction(key: string, input: unknown): Promise<{ ok: true; data: Pick<CreatedOrder, "number" | "trackingToken" | "total"> } | { ok: false; error: string }> {
  const sf = await openStore(key);
  if (!sf) return { ok: false, error: "المتجر مقفول مؤقتاً. جرّب بعد شوية." };
  const parsed = payload.safeParse(input);
  if (!parsed.success) return { ok: false, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." };
  const { website, ...order } = parsed.data;
  if (website) return { ok: false, error: "ما قدرنا نرسل طلبك. جرّب مرة ثانية." }; // روبوت

  // حماية من الطلبيات الوهمية: حد لكل IP وحد لكل رقم هاتف داخل المتجر
  const db = getDb();
  const ip = (await getClientIp()) ?? "unknown";
  const byIp = await hitRateLimit(db, `order:ip:${sf.id}:${ip}`, { limit: 6, windowMs: 30 * 60_000 });
  const phone = phoneSchema.safeParse(order.phone);
  const byPhone = phone.success ? await hitRateLimit(db, `order:phone:${sf.id}:${phone.data}`, { limit: 4, windowMs: 60 * 60_000 }) : { allowed: true };
  if (!byIp.allowed || !byPhone.allowed) return { ok: false, error: "أرسلت طلبيات كثيرة. جرّب بعد شوية أو تواصل معانا على واتساب." };

  const r = await createOrder(db, sf.id, order);
  if (!r.ok) return r;
  invalidateStore({ id: sf.id, slug: sf.slug }); // المخزون تغيّر
  return { ok: true, data: { number: r.data.number, trackingToken: r.data.trackingToken, total: r.data.total } };
}

export async function trackOrderAction(key: string, orderNumber: string, rawPhone: string): Promise<{ ok: true; order: TrackedOrder } | { ok: false; error: string }> {
  const NOT_FOUND = { ok: false as const, error: "ما لقينا طلبية بهذه البيانات. تأكد من رقم الطلبية ورقم الهاتف." };
  const sf = await loadStore(key);
  if (!sf) return NOT_FOUND;
  const ip = (await getClientIp()) ?? "unknown";
  const limit = await hitRateLimit(getDb(), `track:${sf.id}:${ip}`, { limit: 15, windowMs: 10 * 60_000 });
  if (!limit.allowed) return { ok: false, error: "محاولات كثيرة. استنى شوية وجرّب مرة ثانية." };
  const number = Number(orderNumber.replace(/\D/g, ""));
  if (!Number.isInteger(number) || number <= 0) return NOT_FOUND;
  const order = await trackOrder(forStore(getDb(), sf.id), number, rawPhone);
  return order ? { ok: true, order } : NOT_FOUND;
}

/**
 * يحفظ سلة الزبون لما يكتب رقمه (علشان البياع يذكّره لو ما كمّل). عام لكن محمي: حد لكل IP وحد لكل رقم،
 * ونتجاهل الأخطاء بصمت علشان ما نزعجش الزبون. الأسعار تتحسب من القاعدة.
 */
export async function captureCartAction(key: string, input: unknown): Promise<{ ok: boolean }> {
  const sf = await openStore(key);
  const parsed = z.object({ phone: z.string(), name: z.string().max(80).nullish(), items: cartItems }).safeParse(input);
  // المتجر اللي باقته ما فيهاش السلات المتروكة: ما نحفظوش أرقام الزباين أصلاً
  if (!sf || !parsed.success || !canUse(sf.limits, "abandonedCarts")) return { ok: false };
  const db = getDb();
  const ip = (await getClientIp()) ?? "unknown";
  const byIp = await hitRateLimit(db, `cart:ip:${sf.id}:${ip}`, { limit: 30, windowMs: 60 * 60_000 });
  const phone = phoneSchema.safeParse(parsed.data.phone);
  if (!byIp.allowed || !phone.success) return { ok: false };
  const byPhone = await hitRateLimit(db, `cart:phone:${sf.id}:${phone.data}`, { limit: 12, windowMs: 60 * 60_000 });
  if (!byPhone.allowed) return { ok: false };
  const r = await captureCart(forStore(db, sf.id), { ...parsed.data, phone: phone.data });
  return { ok: r.ok };
}
