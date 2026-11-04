import { and, eq, inArray, notInArray } from "drizzle-orm";
import webpush from "web-push";
import type { Db } from "@/db";
import { getEnv } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { storeMembers } from "@/db/schema/platform";
import { forStore, t } from "./tenant";

// إشعارات Web Push لأجهزة البياع والموظفين لما تجي طلبية جديدة.
// بدون مفاتيح VAPID كل شي هنا يتعطل بهدوء (ما يأثر على إنشاء الطلبيات).

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushPayload = { title: string; body: string; url: string; tag: string };
export type PushSender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

export function pushConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const e = getEnv();
  return e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY ? { publicKey: e.VAPID_PUBLIC_KEY, privateKey: e.VAPID_PRIVATE_KEY, subject: e.VAPID_SUBJECT ?? "mailto:support@rukn.ly" } : null;
}

/** endpoint لازم يكون https (خدمات Push الحقيقية كلها https): يمنع استعمالنا لطلبات لعناوين داخلية */
export const isValidSubscription = (s: unknown): s is PushSubscriptionInput => {
  const v = s as PushSubscriptionInput | null;
  if (!v || typeof v.endpoint !== "string" || v.endpoint.length > 1000 || !v.keys) return false;
  if (typeof v.keys.p256dh !== "string" || typeof v.keys.auth !== "string" || v.keys.p256dh.length > 200 || v.keys.auth.length > 100) return false;
  try {
    const u = new URL(v.endpoint);
    return u.protocol === "https:" && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname);
  } catch {
    return false;
  }
};

/** يحفظ اشتراك الجهاز (يحدّث لو نفس الـ endpoint موجود لنفس المتجر) */
export async function savePushSubscription(db: Db, storeId: string, userId: string, sub: PushSubscriptionInput, userAgent: string | null) {
  const scope = forStore(db, storeId);
  await scope.delete(t.pushSubscriptions, eq(t.pushSubscriptions.endpoint, sub.endpoint));
  await scope.insert(t.pushSubscriptions, { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 200) ?? null });
}

export async function removePushSubscription(db: Db, storeId: string, userId: string, endpoint: string) {
  await forStore(db, storeId).delete(t.pushSubscriptions, and(eq(t.pushSubscriptions.endpoint, endpoint), eq(t.pushSubscriptions.userId, userId))!);
}

/** لما الموظف يُحذف أو يصير مندوب: ما يستلم إشعارات طلبيات المتجر */
export async function removeUserPushSubscriptions(db: Db, storeId: string, userId: string) {
  await forStore(db, storeId).delete(t.pushSubscriptions, eq(t.pushSubscriptions.userId, userId));
}

export async function hasPushSubscription(db: Db, storeId: string, userId: string, endpoint: string): Promise<boolean> {
  const [row] = await forStore(db, storeId).from(t.pushSubscriptions, and(eq(t.pushSubscriptions.userId, userId), eq(t.pushSubscriptions.endpoint, endpoint))!).limit(1);
  return !!row;
}

let configured = false;
const defaultSender: PushSender = async (sub, payload) => {
  const cfg = pushConfig();
  if (!cfg) return;
  if (!configured) { webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey); configured = true; }
  return webpush.sendNotification(sub, payload, { TTL: 60 * 60, urgency: "high" });
};

/** يبعث إشعار لكل أجهزة المتجر المشتركة. الأجهزة الميتة (404/410) تتمسح. ما يرمي أخطاء أبداً. */
export async function notifyStore(db: Db, storeId: string, payload: PushPayload, send: PushSender = defaultSender, who: { onlyUserIds?: string[]; excludeUserIds?: string[] } = {}): Promise<{ sent: number; removed: number }> {
  try {
    if (send === defaultSender && !pushConfig()) return { sent: 0, removed: 0 };
    if (who.onlyUserIds && who.onlyUserIds.length === 0) return { sent: 0, removed: 0 };
    const scope = forStore(db, storeId);
    const conds = [
      ...(who.onlyUserIds ? [inArray(t.pushSubscriptions.userId, who.onlyUserIds)] : []),
      ...(who.excludeUserIds?.length ? [notInArray(t.pushSubscriptions.userId, who.excludeUserIds)] : []),
    ];
    const subs = await scope.from(t.pushSubscriptions, conds.length ? and(...conds) : undefined).limit(200);
    let sent = 0;
    const dead: string[] = [];
    await Promise.all(subs.map(async (s) => {
      try {
        await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
      }
    }));
    if (dead.length) await scope.delete(t.pushSubscriptions, inArray(t.pushSubscriptions.id, dead));
    return { sent, removed: dead.length };
  } catch (e) {
    console.error("push notify failed", e);
    return { sent: 0, removed: 0 };
  }
}

/** المندوبين: ما يستلمون إشعار «طلبية جديدة» (يستلمون بس الطلبيات المعيّنة لهم) */
const courierUserIds = async (db: Db, storeId: string) =>
  (await db.select({ userId: storeMembers.userId }).from(storeMembers).where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.role, "courier")))).map((r) => r.userId);

/** إشعار «طلبية جديدة» للموظفين والمالك (يتنادى بعد ما الطلب ينحفظ، بدون انتظار) */
export async function notifyNewOrder(db: Db, storeId: string, orderId: string, send?: PushSender) {
  const [o] = await forStore(db, storeId).from(t.orders, eq(t.orders.id, orderId)).limit(1);
  if (!o) return { sent: 0, removed: 0 };
  return notifyStore(db, storeId, {
    title: `طلبية جديدة #${o.number}`,
    body: `${o.customerName} · ${o.cityName} · ${formatMoney(o.total)}`,
    url: `/dashboard/orders/${o.id}`,
    tag: `order-${o.id}`,
  }, send, { excludeUserIds: await courierUserIds(db, storeId) });
}

/** إشعار للمندوب لما تتعيّن له طلبيات (تعيين جماعي أو تسليم لمندوب). كل مندوب يستلم عن طلبياته بس. */
export async function notifyCourierAssigned(db: Db, storeId: string, orderIds: string[], send?: PushSender) {
  if (!orderIds.length) return { sent: 0, removed: 0 };
  const scope = forStore(db, storeId);
  const orders = await scope.from(t.orders, inArray(t.orders.id, orderIds));
  const withCourier = orders.filter((o) => o.courierId);
  if (!withCourier.length) return { sent: 0, removed: 0 };
  const couriers = await scope.from(t.couriers, inArray(t.couriers.id, [...new Set(withCourier.map((o) => o.courierId!))]));
  let sent = 0, removed = 0;
  for (const c of couriers) {
    if (!c.userId) continue;
    const mine = withCourier.filter((o) => o.courierId === c.id);
    const one = mine.length === 1 ? mine[0]! : null;
    const r = await notifyStore(db, storeId, {
      title: one ? `طلبية معيّنة لك #${one.number}` : `${mine.length} طلبيات معيّنة لك`,
      body: one ? `${one.customerName} · ${one.cityName} · ${formatMoney(one.total)}` : "افتح اللوحة وشوف طلبياتك",
      url: one ? `/dashboard/orders/${one.id}` : "/dashboard/orders",
      tag: one ? `assigned-${one.id}` : `assigned-${c.id}`,
    }, send, { onlyUserIds: [c.userId] });
    sent += r.sent; removed += r.removed;
  }
  return { sent, removed };
}
