import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cities, stores, users } from "@/db/schema/platform";
import { FALLBACK_LIMITS } from "@/lib/plan-limits";
import { PRO_LIMITS } from "@/lib/plan-catalog";
import { listExpiring } from "@/server/catalog/expiry";
import { listGridRows, saveGridRows } from "@/server/catalog/grid";
import { deleteBrand, deleteOptionPreset, listBrands, listOptionPresets, listTags, saveBrand, saveOptionPreset } from "@/server/catalog/library";
import { getProductForEdit, saveProduct } from "@/server/catalog/products";
import { createOrder } from "@/server/orders/create";
import { changeOrderStatus } from "@/server/orders/manage";
import { queryProductDetail, queryProducts, resolveCart } from "@/server/storefront/queries";
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
  const [u] = await db.insert(users).values({ phone: `0917${String(++n).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  await db.update(stores).set({ onboardedAt: new Date() }).where(eq(stores.id, r.data.storeId));
  const scope = forStore(db, r.data.storeId);
  await scope.insert(t.deliveryRates, [{ cityId: city, fee: 10_000 }]);
  return { id: r.data.storeId, scope };
}
type Shop = Awaited<ReturnType<typeof shop>>;
const simple = async (s: Shop, name: string, stock: number, extra: object = {}) => {
  const p = await saveProduct(s.scope, { name, price: 50_000, variants: [{ valueIds: [], stock }], ...extra }, { limits: PRO_LIMITS });
  if (!p.ok) throw new Error(p.error);
  const [v] = await s.scope.from(t.productVariants, eq(t.productVariants.productId, p.data.id));
  return { productId: p.data.id, variantId: v!.id };
};
const order = (s: Shop, items: object[]) => createOrder(db, s.id, { items, name: "خديجة البيضاوي", phone: "0927771234", cityId: city, address: "طرابلس شارع عمر المختار", paymentMethod: "cod" });

describe("البراندات ومكتبة الخيارات والوسوم", () => {
  it("تتعزل بين المتاجر، والبراند ما ينربط بمنتج متجر ثاني", async () => {
    const a = await shop("cv-a"), b = await shop("cv-b");
    const br = await saveBrand(a.scope, { name: "الندى" });
    if (!br.ok) throw new Error(br.error);
    expect(await saveBrand(a.scope, { name: "الندى" })).toEqual({ ok: false, error: expect.stringContaining("بنفس الاسم") });
    expect(await listBrands(b.scope)).toEqual([]);
    expect((await saveBrand(b.scope, { id: br.data.id, name: "سرقة" })).ok).toBe(false);
    expect(await saveProduct(b.scope, { name: "x", price: 1000, brandId: br.data.id, variants: [{ valueIds: [], stock: 1 }] }, { limits: PRO_LIMITS })).toEqual({ ok: false, error: "براند غير صحيح." });

    const p = await saveProduct(a.scope, { name: "عطر", price: 1000, brandId: br.data.id, tags: ["عروض", "#جديد", "عروض"], variants: [{ valueIds: [], stock: 1 }] }, { limits: PRO_LIMITS });
    if (!p.ok) throw new Error(p.error);
    expect((await getProductForEdit(a.scope, p.data.id))).toMatchObject({ brandId: br.data.id, tags: ["جديد", "عروض"] });
    expect((await queryProducts(a.scope, { brandSlug: "غير-موجود" })).total).toBe(0);
    const [brand] = await a.scope.from(t.brands);
    expect((await queryProducts(a.scope, { brandSlug: brand!.slug })).total).toBe(1);
    expect((await queryProducts(a.scope, { tag: "جديد" })).total).toBe(1);
    expect((await queryProducts(b.scope, { tag: "جديد" })).total).toBe(0);
    expect(await listTags(a.scope)).toEqual([{ tag: "جديد", count: 1 }, { tag: "عروض", count: 1 }]);
    expect((await deleteBrand(b.scope, br.data.id)).ok).toBe(false);
    expect((await deleteBrand(a.scope, br.data.id)).ok).toBe(true);
    expect((await getProductForEdit(a.scope, p.data.id))?.brandId).toBeNull();
  });

  it("مكتبة الخيارات: حفظ وتحقق وعزل", async () => {
    const a = await shop("cv-p-a"), b = await shop("cv-p-b");
    expect((await saveOptionPreset(a.scope, { name: "مقاسات", values: [{ value: "S" }, { value: "s" }] })).ok).toBe(false);
    const r = await saveOptionPreset(a.scope, { name: "مقاسات", values: [{ value: "S" }, { value: "M" }] });
    if (!r.ok) throw new Error(r.error);
    expect(await listOptionPresets(a.scope)).toHaveLength(1);
    expect(await listOptionPresets(b.scope)).toHaveLength(0);
    expect((await deleteOptionPreset(b.scope, r.data.id)).ok).toBe(false);
  });
});

describe("الباقات المجمعة", () => {
  it("تتحجب بالباقة، المخزون من المكونات، ينقص ويرجع مع الإلغاء", async () => {
    const s = await shop("cv-bundle");
    const a = await simple(s, "عطر", 5), b = await simple(s, "كريم", 3);
    const input = { name: "باقة الهدية", price: 80_000, kind: "bundle", bundleItems: [{ variantId: a.variantId, quantity: 1 }, { variantId: b.variantId, quantity: 2 }], variants: [{ valueIds: [], stock: 99 }] };
    expect(await saveProduct(s.scope, input, { limits: FALLBACK_LIMITS })).toEqual({ ok: false, error: expect.stringContaining("مش في باقتك") });
    const made = await saveProduct(s.scope, input, { limits: PRO_LIMITS });
    if (!made.ok) throw new Error(made.error);
    const detail = await queryProductDetail(s.scope, (await s.scope.from(t.products, eq(t.products.id, made.data.id)))[0]!.slug);
    expect(detail?.isBundle).toBe(true);
    expect(detail?.variants[0]?.stock).toBe(1); // min(5/1, 3/2) = 1
    const [bv] = await s.scope.from(t.productVariants, eq(t.productVariants.productId, made.data.id));
    expect(bv!.stock).toBe(0); // الباقة نفسها ما لها مخزون مخزّن

    const o = await order(s, [{ variantId: bv!.id, quantity: 1 }]);
    if (!o.ok) throw new Error(o.error);
    const stock = async (id: string) => (await s.scope.from(t.productVariants, eq(t.productVariants.id, id)))[0]!.stock;
    expect([await stock(a.variantId), await stock(b.variantId)]).toEqual([4, 1]);
    expect(await order(s, [{ variantId: bv!.id, quantity: 1 }])).toEqual({ ok: false, error: expect.stringContaining("نفد") }); // التاني يحتاج 2 والمتبقي 1
    expect((await changeOrderStatus(s.scope, { orderId: o.data.orderId, to: "cancelled", actorUserId: null })).ok).toBe(true);
    expect([await stock(a.variantId), await stock(b.variantId)]).toEqual([5, 3]);
    expect(await resolveCart(s.scope, [{ variantId: bv!.id, quantity: 5 }])).toMatchObject([{ quantity: 1, stock: 1 }]);
  });

  it("المكونات لازم منتجات عادية من نفس المتجر", async () => {
    const a = await shop("cv-bundle-a"), b = await shop("cv-bundle-b");
    const other = await simple(b, "غريب", 5);
    const r = await saveProduct(a.scope, { name: "باقة", price: 1000, kind: "bundle", bundleItems: [{ variantId: other.variantId, quantity: 1 }], variants: [{ valueIds: [], stock: 0 }] }, { limits: PRO_LIMITS });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("غير صحيح") });
  });
});

describe("التخصيص (نقش / إهداء)", () => {
  it("يزيد السعر ويتسجل في الطلبية، ويحترم حد الحروف", async () => {
    const s = await shop("cv-pz");
    const p = await simple(s, "ميدالية", 10, { personalization: { label: "الاسم", maxChars: 5, price: 5_000 } });
    expect(await order(s, [{ variantId: p.variantId, quantity: 1, note: "اسم طويل جداً" }])).toEqual({ ok: false, error: expect.stringContaining("5 حرف") });
    const o = await order(s, [{ variantId: p.variantId, quantity: 2, note: "أحمد" }]);
    if (!o.ok) throw new Error(o.error);
    const [item] = await s.scope.from(t.orderItems, eq(t.orderItems.orderId, o.data.orderId));
    expect(item).toMatchObject({ personalizationText: "أحمد", unitPrice: 55_000, quantity: 2 });
    const [cart] = await resolveCart(s.scope, [{ variantId: p.variantId, quantity: 1, note: "علي" }]);
    expect(cart).toMatchObject({ note: "علي", price: 55_000 });
    // منتج بدون تخصيص يتجاهل النص
    const plain = await simple(s, "عادي", 10);
    const o2 = await order(s, [{ variantId: plain.variantId, quantity: 1, note: "تجاهل" }]);
    if (!o2.ok) throw new Error(o2.error);
    expect((await s.scope.from(t.orderItems, eq(t.orderItems.orderId, o2.data.orderId)))[0]).toMatchObject({ personalizationText: null, unitPrice: 50_000 });
  });
});

describe("تواريخ الانتهاء وجدول التعديل السريع", () => {
  it("قرب ينتهي يظهر المتغيرات ذات المخزون فقط", async () => {
    const s = await shop("cv-exp");
    const day = 86_400_000, now = Date.now();
    await simple(s, "لبن", 4, { variants: [{ valueIds: [], stock: 4, expiresAt: now + 5 * day }] });
    await simple(s, "جبن", 0, { variants: [{ valueIds: [], stock: 0, expiresAt: now + 2 * day }] });
    await simple(s, "عسل", 4, { variants: [{ valueIds: [], stock: 4, expiresAt: now + 200 * day }] });
    const list = await listExpiring(s.scope, 30, now);
    expect(list.map((x) => x.name)).toEqual(["لبن"]);
    expect(list[0]!.daysLeft).toBe(5);
  });

  it("الحفظ يغير السعر والمخزون ويسجل حركة، ولا يلمس متجر ثاني", async () => {
    const a = await shop("cv-grid-a"), b = await shop("cv-grid-b");
    const p = await simple(a, "قميص", 5);
    const other = await simple(b, "غريب", 5);
    const rows = await listGridRows(a.scope);
    expect(rows).toHaveLength(1);
    expect((await saveGridRows(a.scope, [{ variantId: other.variantId, price: 1, stock: 1, cost: null, expiresAt: null }])).ok).toBe(false);
    expect((await saveGridRows(a.scope, [{ variantId: p.variantId, price: 70_000, stock: 9, cost: 20_000, expiresAt: null }], "u1")).ok).toBe(true);
    const [prod] = await a.scope.from(t.products, eq(t.products.id, p.productId));
    const [v] = await a.scope.from(t.productVariants, eq(t.productVariants.id, p.variantId));
    expect([prod!.price, v!.stock, v!.costPrice]).toEqual([70_000, 9, 20_000]);
    expect((await a.scope.from(t.stockMovements, eq(t.stockMovements.variantId, p.variantId))).some((m) => m.delta === 4 && m.note?.includes("جدول"))).toBe(true);
    expect((await saveGridRows(a.scope, [{ variantId: p.variantId, price: -5, stock: 1, cost: null, expiresAt: null }])).ok).toBe(false);
    expect((await listGridRows(b.scope))[0]!.stock).toBe(5);
  });
});
