import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cities, plans, stores, users, type PlanLimits } from "@/db/schema/platform";
import { saveProduct } from "@/server/catalog/products";
import { createOrder } from "@/server/orders/create";
import { hasPushSubscription, isValidSubscription, notifyCourierAssigned, notifyNewOrder, removePushSubscription, removeUserPushSubscriptions, savePushSubscription, type PushSender } from "@/server/push";
import { addStaff } from "@/server/staff-service";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

const LIMITS: PlanLimits = { maxProducts: null, maxStaff: 3, allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: false, removeBranding: false };
let db: Db;
let close: () => void;
let n = 0;
let city: string;

type Shop = { id: string; userId: string; variantId: string };
async function shop(slug: string): Promise<Shop> {
  const [plan] = await db.insert(plans).values({ slug: `p-${slug}`, nameAr: "x", price: 1, limits: LIMITS }).returning();
  const [u] = await db.insert(users).values({ phone: `0916${String(++n).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  const id = r.data.storeId;
  await db.update(stores).set({ planId: plan!.id, onboardedAt: new Date(), onboardingStep: 6 }).where(eq(stores.id, id));
  const scope = forStore(db, id);
  await scope.insert(t.deliveryRates, { cityId: city, fee: 10_000 });
  const p = await saveProduct(scope, { name: "عطر", price: 50_000, variants: [{ valueIds: [], stock: 10 }] }, { limits: LIMITS });
  if (!p.ok) throw new Error(p.error);
  const [v] = await scope.from(t.productVariants, eq(t.productVariants.productId, p.data.id));
  return { id, userId: u!.id, variantId: v!.id };
}
const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "BPk-key", auth: "auth-secret" } });
const place = async (s: Shop) => {
  const r = await createOrder(db, s.id, { items: [{ variantId: s.variantId, quantity: 1 }], name: "سالم المختار", phone: "0912345678", cityId: city, address: "طرابلس، شارع الجمهورية", paymentMethod: "cod" });
  if (!r.ok) throw new Error(r.error);
  return r.data.orderId;
};

beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  city = (await db.insert(cities).values({ nameAr: "طرابلس", region: "west", sortOrder: 1 }).returning())[0]!.id;
});
afterAll(() => close());

describe("اشتراكات Push", () => {
  it("التحقق: https بس، وما نقبلش عناوين داخلية ولا بيانات ناقصة", () => {
    expect(isValidSubscription(sub("https://fcm.googleapis.com/fcm/send/abc"))).toBe(true);
    expect(isValidSubscription(sub("http://fcm.googleapis.com/x"))).toBe(false);
    expect(isValidSubscription(sub("https://localhost/x"))).toBe(false);
    expect(isValidSubscription(sub("https://192.168.1.5/x"))).toBe(false);
    expect(isValidSubscription(sub("https://169.254.169.254/latest"))).toBe(false);
    expect(isValidSubscription({ endpoint: "https://a.com/x" })).toBe(false);
    expect(isValidSubscription(null)).toBe(false);
  });

  it("حفظ بنفس الـ endpoint يحدّث ما يكرر، وإلغاء الاشتراك", async () => {
    const s = await shop("push-1");
    await savePushSubscription(db, s.id, s.userId, sub("https://push.example.com/a"), "UA");
    await savePushSubscription(db, s.id, s.userId, sub("https://push.example.com/a"), "UA2");
    expect(await forStore(db, s.id).count(t.pushSubscriptions)).toBe(1);
    expect(await hasPushSubscription(db, s.id, s.userId, "https://push.example.com/a")).toBe(true);
    await removePushSubscription(db, s.id, s.userId, "https://push.example.com/a");
    expect(await hasPushSubscription(db, s.id, s.userId, "https://push.example.com/a")).toBe(false);
  });
});

describe("إشعار الطلبية الجديدة", () => {
  it("يوصل لأجهزة هذا المتجر بس، بمحتوى الطلبية ورابط التفاصيل", async () => {
    const a = await shop("push-a");
    const b = await shop("push-b");
    await savePushSubscription(db, a.id, a.userId, sub("https://push.example.com/a1"), null);
    await savePushSubscription(db, b.id, b.userId, sub("https://push.example.com/b1"), null);
    const calls: { endpoint: string; payload: Record<string, string> }[] = [];
    const send: PushSender = async (s, p) => { calls.push({ endpoint: s.endpoint, payload: JSON.parse(p) }); };
    const orderId = await place(a);
    const r = await notifyNewOrder(db, a.id, orderId, send);
    expect(r.sent).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.endpoint).toBe("https://push.example.com/a1");
    expect(calls[0]!.payload.title).toMatch(/^طلبية جديدة #\d+$/);
    expect(calls[0]!.payload.body).toContain("سالم المختار");
    expect(calls[0]!.payload.body).toContain("طرابلس");
    expect(calls[0]!.payload.url).toBe(`/dashboard/orders/${orderId}`);
  });

  it("الجهاز الميت (410) يتمسح، والخطأ الثاني ما يوقف الباقي ولا يرمي", async () => {
    const s = await shop("push-c");
    await savePushSubscription(db, s.id, s.userId, sub("https://push.example.com/dead"), null);
    await savePushSubscription(db, s.id, s.userId, sub("https://push.example.com/flaky"), null);
    await savePushSubscription(db, s.id, s.userId, sub("https://push.example.com/ok"), null);
    const send: PushSender = async (x) => {
      if (x.endpoint.endsWith("/dead")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (x.endpoint.endsWith("/flaky")) throw new Error("network");
    };
    const r = await notifyNewOrder(db, s.id, await place(s), send);
    expect(r).toEqual({ sent: 1, removed: 1 });
    const left = (await forStore(db, s.id).from(t.pushSubscriptions)).map((x) => x.endpoint).sort();
    expect(left).toEqual(["https://push.example.com/flaky", "https://push.example.com/ok"]);
  });

  it("إنشاء الطلب ما يتأثرش لو ما فيه مفاتيح VAPID، وحذف اشتراكات مستخدم", async () => {
    const s = await shop("push-d");
    await savePushSubscription(db, s.id, s.userId, sub("https://push.example.com/d1"), null);
    await expect(place(s)).resolves.toBeTruthy();
    await removeUserPushSubscriptions(db, s.id, s.userId);
    expect(await forStore(db, s.id).count(t.pushSubscriptions)).toBe(0);
  });
});

describe("إشعارات المندوب", () => {
  async function withCourier(slug: string) {
    const s = await shop(slug);
    const r = await addStaff(db, s.id, s.userId, { name: "مندوب", phone: `0935${String(++n).padStart(6, "0")}`, password: "kalimat-sirr-1", role: "courier" }, { maxStaff: 5 });
    if (!r.ok) throw new Error(r.error);
    const [courier] = await forStore(db, s.id).from(t.couriers);
    return { ...s, courierId: courier!.id, courierUserId: courier!.userId! };
  }

  it("الطلبية الجديدة ما توصلش للمندوب، بس للمالك", async () => {
    const s = await withCourier("push-e");
    await savePushSubscription(db, s.id, s.userId, sub("https://push.example.com/owner"), null);
    await savePushSubscription(db, s.id, s.courierUserId, sub("https://push.example.com/courier"), null);
    const got: string[] = [];
    await notifyNewOrder(db, s.id, await place(s), async (x) => { got.push(x.endpoint); });
    expect(got).toEqual(["https://push.example.com/owner"]);
  });

  it("التعيين يوصل للمندوب المعيّن بس، بنص فيه رقم الطلبية والزبون", async () => {
    const s = await withCourier("push-f");
    await savePushSubscription(db, s.id, s.userId, sub("https://push.example.com/owner2"), null);
    await savePushSubscription(db, s.id, s.courierUserId, sub("https://push.example.com/courier2"), null);
    const orderId = await place(s);
    await forStore(db, s.id).update(t.orders, { courierId: s.courierId, status: "with_courier" }, eq(t.orders.id, orderId));
    const got: { endpoint: string; payload: Record<string, string> }[] = [];
    const r = await notifyCourierAssigned(db, s.id, [orderId], async (x, p) => { got.push({ endpoint: x.endpoint, payload: JSON.parse(p) }); });
    expect(r.sent).toBe(1);
    expect(got).toHaveLength(1);
    expect(got[0]!.endpoint).toBe("https://push.example.com/courier2");
    expect(got[0]!.payload.title).toMatch(/^طلبية معيّنة لك #\d+$/);
    expect(got[0]!.payload.url).toBe(`/dashboard/orders/${orderId}`);
  });

  it("طلبية بدون مندوب أو مندوب بدون اشتراك: ما يبعث شي", async () => {
    const s = await withCourier("push-g");
    const orderId = await place(s);
    const calls: string[] = [];
    const send = async (x: { endpoint: string }) => { calls.push(x.endpoint); };
    expect(await notifyCourierAssigned(db, s.id, [orderId], send)).toEqual({ sent: 0, removed: 0 });
    await forStore(db, s.id).update(t.orders, { courierId: s.courierId }, eq(t.orders.id, orderId));
    expect(await notifyCourierAssigned(db, s.id, [orderId], send)).toEqual({ sent: 0, removed: 0 });
    expect(await notifyCourierAssigned(db, s.id, [], send)).toEqual({ sent: 0, removed: 0 });
    expect(calls).toEqual([]);
  });
});
