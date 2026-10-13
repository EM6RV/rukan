import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cities, plans, stores, users, type PlanLimits } from "@/db/schema/platform";
import { saveProduct } from "@/server/catalog/products";
import { RETENTION_MS, IDLE_MS, captureCart, dismissCart, listAbandonedCarts, markReminded } from "@/server/marketing/abandoned-carts";
import { createOrder } from "@/server/orders/create";
import { getWhatsappTemplates } from "@/server/orders/whatsapp-templates";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t } from "@/server/tenant";
import { renderWhatsapp } from "@/lib/whatsapp-defaults";
import { makeTestDb } from "./helpers/db";

const LIMITS: PlanLimits = { maxProducts: null, maxStaff: 3, allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: false, removeBranding: false };
let db: Db;
let close: () => void;
let n = 0;
let city: string;
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

type Shop = { id: string; scope: ReturnType<typeof forStore>; variantId: string; price: number };
async function shop(slug: string): Promise<Shop> {
  const [plan] = await db.insert(plans).values({ slug: `p-${slug}`, nameAr: "x", priceMonthly: 1, priceYearly: 1, limits: LIMITS }).returning();
  const [u] = await db.insert(users).values({ phone: `0917${String(++n).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  const id = r.data.storeId;
  await db.update(stores).set({ planId: plan!.id, onboardedAt: new Date(), onboardingStep: 6 }).where(eq(stores.id, id));
  const scope = forStore(db, id);
  await scope.insert(t.deliveryRates, { cityId: city, fee: 10_000 });
  const p = await saveProduct(scope, { name: "عطر العود", price: 50_000, variants: [{ valueIds: [], stock: 10 }] }, { limits: LIMITS });
  if (!p.ok) throw new Error(p.error);
  const [v] = await scope.from(t.productVariants, eq(t.productVariants.productId, p.data.id));
  return { id, scope, variantId: v!.id, price: 50_000 };
}
const PHONE = "0912345678";
const cap = (s: Shop, over: Record<string, unknown> = {}, now = NOW) => captureCart(s.scope, { phone: PHONE, name: "سالم", items: [{ variantId: s.variantId, quantity: 2 }], ...over }, now);

beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  city = (await db.insert(cities).values({ nameAr: "طرابلس", region: "west", sortOrder: 1 }).returning())[0]!.id;
});
afterAll(() => close());

describe("حفظ السلة", () => {
  it("يحفظ بأسعار من القاعدة (ما يصدّقش العميل)، وسلة وحدة لكل رقم تتحدّث", async () => {
    const s = await shop("ac-1");
    expect(await cap(s)).toEqual({ ok: true, data: { saved: true } });
    await cap(s, { items: [{ variantId: s.variantId, quantity: 3 }], name: null });
    const rows = await s.scope.from(t.abandonedCarts);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phone: PHONE, name: "سالم", itemCount: 3, total: 150_000 });
    expect(rows[0]!.items[0]).toMatchObject({ name: "عطر العود", quantity: 3, price: 50_000 });
  });

  it("سلة فاضية أو بنود غير موجودة أو رقم غلط: ما يحفظ شي", async () => {
    const s = await shop("ac-2");
    expect(await cap(s, { items: [{ variantId: "nope", quantity: 1 }] })).toEqual({ ok: true, data: { saved: false } });
    expect((await cap(s, { phone: "123" })).ok).toBe(false);
    expect((await cap(s, { items: [] })).ok).toBe(false);
    expect(await s.scope.count(t.abandonedCarts)).toBe(0);
  });

  it("معزولة بين المتاجر", async () => {
    const a = await shop("ac-3a");
    const b = await shop("ac-3b");
    await cap(a);
    expect(await b.scope.count(t.abandonedCarts)).toBe(0);
    expect(await listAbandonedCarts(b.scope, NOW + IDLE_MS + 1000)).toEqual([]);
  });
});

describe("القائمة والتذكير", () => {
  it("تظهر بعد 30 دقيقة خمول بس، وتختفي بعد 30 يوم", async () => {
    const s = await shop("ac-4");
    await cap(s);
    expect(await listAbandonedCarts(s.scope, NOW + 10 * 60_000)).toEqual([]);
    expect((await listAbandonedCarts(s.scope, NOW + IDLE_MS + 1000))).toHaveLength(1);
    expect(await listAbandonedCarts(s.scope, NOW + RETENTION_MS + 1000)).toEqual([]);
  });

  it("التذكير ما يصفّر مؤقت الخمول، والتجاهل يمسح", async () => {
    const s = await shop("ac-5");
    await cap(s);
    const [row] = await listAbandonedCarts(s.scope, NOW + IDLE_MS + 1000);
    expect(await markReminded(s.scope, row!.id, NOW + IDLE_MS + 2000)).toEqual({ ok: true, data: undefined });
    const after = await listAbandonedCarts(s.scope, NOW + IDLE_MS + 3000);
    expect(after[0]).toMatchObject({ id: row!.id, updatedAt: NOW });
    expect(after[0]!.remindedAt).toBe(NOW + IDLE_MS + 2000);
    expect(await dismissCart(s.scope, row!.id)).toEqual({ ok: true, data: undefined });
    expect(await dismissCart(s.scope, row!.id)).toEqual({ ok: false, error: expect.stringContaining("ما لقينا") });
  });

  it("الطلب بنفس الرقم يقفل السلة، وسلة جديدة بعده تنفتح من جديد", async () => {
    const s = await shop("ac-6");
    await cap(s);
    const o = await createOrder(db, s.id, { items: [{ variantId: s.variantId, quantity: 1 }], name: "سالم", phone: PHONE, cityId: city, address: "طرابلس، شارع الجمهورية", paymentMethod: "cod" });
    expect(o.ok).toBe(true);
    expect(await listAbandonedCarts(s.scope, Date.now() + IDLE_MS + 60_000)).toEqual([]);
    const row = (await s.scope.from(t.abandonedCarts))[0]!;
    expect(row.recoveredAt).not.toBeNull();
    await captureCart(s.scope, { phone: PHONE, items: [{ variantId: s.variantId, quantity: 1 }] }, Date.now());
    expect((await s.scope.from(t.abandonedCarts))[0]!.recoveredAt).toBeNull();
  });

  it("نظافة: السلات الأقدم من 30 يوم تتمسح عند أي حفظ جديد", async () => {
    const s = await shop("ac-7");
    await captureCart(s.scope, { phone: "0911111111", items: [{ variantId: s.variantId, quantity: 1 }] }, NOW - RETENTION_MS - 86_400_000);
    await captureCart(s.scope, { phone: "0922222222", items: [{ variantId: s.variantId, quantity: 1 }] }, NOW);
    expect((await s.scope.from(t.abandonedCarts)).map((r) => r.phone)).toEqual(["0922222222"]);
  });
});

describe("رسالة التذكير", () => {
  it("القالب الافتراضي موجود ويتعبّى بالاسم والمتجر والقيمة والرابط", async () => {
    const s = await shop("ac-8");
    const tpl = (await getWhatsappTemplates(s.scope)).abandoned_cart!;
    expect(tpl.isCustom).toBe(false);
    const msg = renderWhatsapp(tpl.body, { name: "سالم", store: "ac-8", total: "100 د.ل", link: "https://x.test/s/ac-8/cart" });
    expect(msg).toContain("سالم");
    expect(msg).toContain("https://x.test/s/ac-8/cart");
    expect(msg).not.toMatch(/\{\w+\}/);
  });
});
