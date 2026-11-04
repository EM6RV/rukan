import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cities, stores, users } from "@/db/schema/platform";
import { FALLBACK_LIMITS } from "@/lib/plan-limits";
import { saveProduct } from "@/server/catalog/products";
import { createOrder } from "@/server/orders/create";
import { deleteReview, listApprovedReviews, listReviewsForDashboard, moderateReview, submitReview } from "@/server/reviews";
import { queryFacets, queryProducts } from "@/server/storefront/queries";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

let db: Db, close: () => void, city: string, n = 0;
beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  city = (await db.insert(cities).values({ nameAr: "طرابلس", region: "west" }).returning())[0]!.id;
});
afterAll(() => close());

async function shop(slug: string) {
  const [u] = await db.insert(users).values({ phone: `0916${String(++n).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  await db.update(stores).set({ onboardedAt: new Date() }).where(eq(stores.id, r.data.storeId));
  const scope = forStore(db, r.data.storeId);
  await scope.insert(t.deliveryRates, [{ cityId: city, fee: 10_000 }]);
  const p = await saveProduct(scope, { name: "عطر الورد", price: 50_000, variants: [{ valueIds: [], stock: 5 }] }, { limits: FALLBACK_LIMITS });
  if (!p.ok) throw new Error(p.error);
  const [v] = await scope.from(t.productVariants, eq(t.productVariants.productId, p.data.id));
  return { id: r.data.storeId, scope, productId: p.data.id, variantId: v!.id };
}
const order = (s: Awaited<ReturnType<typeof shop>>, phone = "0927771234") =>
  createOrder(db, s.id, { items: [{ variantId: s.variantId, quantity: 1 }], name: "خديجة البيضاوي", phone, cityId: city, address: "طرابلس شارع عمر المختار", paymentMethod: "cod" });

describe("تقييمات المنتجات", () => {
  it("المشتري الموثّق فقط، بعد التسليم، مرة وحدة، ويظهر بعد الاعتماد", async () => {
    const s = await shop("rev-a");
    const o = await order(s);
    if (!o.ok) throw new Error(o.error);
    const input = { productId: s.productId, orderNumber: o.data.number, phone: "0927771234", rating: 5, body: "ريحة تجنن" };

    expect(await submitReview(s.scope, input)).toEqual({ ok: false, error: expect.stringContaining("بعد ما توصلك") });
    await s.scope.update(t.orders, { status: "delivered" }, eq(t.orders.id, o.data.orderId));
    expect(await submitReview(s.scope, { ...input, phone: "0911111111" })).toEqual({ ok: false, error: expect.stringContaining("ما لقينا") });
    expect(await submitReview(s.scope, { ...input, rating: 9 })).toMatchObject({ ok: false });
    expect((await submitReview(s.scope, input)).ok).toBe(true);
    expect(await submitReview(s.scope, input)).toEqual({ ok: false, error: expect.stringContaining("من قبل") });

    // بانتظار الموافقة: ما يظهر للزبائن
    expect((await listApprovedReviews(s.scope, s.productId)).count).toBe(0);
    const [row] = await listReviewsForDashboard(s.scope, "pending");
    expect(row).toMatchObject({ verified: true, rating: 5, name: "خديجة" });
    expect((await moderateReview(s.scope, row!.id, "approved")).ok).toBe(true);
    expect(await listApprovedReviews(s.scope, s.productId)).toMatchObject({ count: 1, average: 5 });
    expect((await moderateReview(s.scope, row!.id, "rejected")).ok).toBe(true);
    expect((await listApprovedReviews(s.scope, s.productId)).count).toBe(0);
  });

  it("متجر ما يقدر يعتمد أو يحذف تقييم متجر ثاني", async () => {
    const a = await shop("rev-iso-a");
    const b = await shop("rev-iso-b");
    const o = await order(a);
    if (!o.ok) throw new Error(o.error);
    await a.scope.update(t.orders, { status: "delivered" }, eq(t.orders.id, o.data.orderId));
    await submitReview(a.scope, { productId: a.productId, orderNumber: o.data.number, phone: "0927771234", rating: 4 });
    const [row] = await listReviewsForDashboard(a.scope);
    expect(await listReviewsForDashboard(b.scope)).toHaveLength(0);
    expect((await moderateReview(b.scope, row!.id, "approved")).ok).toBe(false);
    expect((await deleteReview(b.scope, row!.id)).ok).toBe(false);
    expect((await deleteReview(a.scope, row!.id)).ok).toBe(true);
  });
});

describe("فلاتر الكتالوج", () => {
  it("السعر والمتوفر والخيار، وكلها داخل المتجر فقط", async () => {
    const a = await shop("flt-a");
    await saveProduct(a.scope, { name: "قميص أحمر", price: 120_000, options: [{ id: "o1", name: "المقاس", values: [{ id: "v1", value: "L" }] }], variants: [{ valueIds: ["v1"], stock: 0 }] }, { limits: FALLBACK_LIMITS });
    const all = await queryProducts(a.scope, {});
    expect(all.total).toBe(2);
    expect((await queryProducts(a.scope, { minPrice: 100_000 })).items.map((p) => p.name)).toEqual(["قميص أحمر"]);
    expect((await queryProducts(a.scope, { maxPrice: 60_000 })).items.map((p) => p.name)).toEqual(["عطر الورد"]);
    expect((await queryProducts(a.scope, { inStock: true })).items.map((p) => p.name)).toEqual(["عطر الورد"]);
    expect((await queryProducts(a.scope, { optionValue: "L" })).items.map((p) => p.name)).toEqual(["قميص أحمر"]);
    expect((await queryFacets(a.scope)).options).toEqual([{ name: "المقاس", values: ["L"] }]);
    const b = await shop("flt-b");
    expect((await queryProducts(b.scope, { minPrice: 100_000 })).total).toBe(0);
    expect((await queryFacets(b.scope)).options).toEqual([]);
  });
});
