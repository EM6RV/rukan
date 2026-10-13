import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cities, plans, stores, users, type PlanLimits } from "@/db/schema/platform";
import { saveProduct } from "@/server/catalog/products";
import { createOrder } from "@/server/orders/create";
import { hasPushSubscription, isValidSubscription, notifyNewOrder, removePushSubscription, removeUserPushSubscriptions, savePushSubscription, type PushSender } from "@/server/push";
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
  const [plan] = await db.insert(plans).values({ slug: `p-${slug}`, nameAr: "x", priceMonthly: 1, priceYearly: 1, limits: LIMITS }).returning();
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
