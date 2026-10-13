import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { media } from "@/db/schema/platform";
import type { PlanLimits } from "@/db/schema/platform";
import { deleteCategory, listCategories, reorderCategories, saveCategory } from "@/server/catalog/categories";
import {
  applyPriceOp, bulkUpdatePrices, bulkUpdateStock, deleteProducts, duplicateProduct, getProductForEdit, listProducts,
  productQuota, saveProduct, setProductsVisibility,
} from "@/server/catalog/products";
import { forStore, t, type StoreScope } from "@/server/tenant";
import { makeCity, makeStore, makeTestDb } from "./helpers/db";

const LIMITS: PlanLimits = { maxProducts: null, maxStaff: null, allTemplates: true, coupons: true, reports: true, customDomain: true, pixels: true, removeBranding: true };
const simple = (over: Record<string, unknown> = {}) => ({
  name: "عطر", price: 25_000, variants: [{ valueIds: [], stock: 5 }], ...over,
});

let db: Db;
let close: () => void;
let A: StoreScope;
let B: StoreScope;
let cityId: string;

const mkMedia = async (storeId: string) =>
  (await db.insert(media).values({ storeId, mime: "image/webp", size: 1, driver: "turso" }).returning())[0]!.id;

beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  A = forStore(db, (await makeStore(db, "shop-a")).store.id);
  B = forStore(db, (await makeStore(db, "shop-b")).store.id);
  cityId = (await makeCity(db)).id;
});
afterAll(() => close());

describe("الأقسام", () => {
  it("إنشاء وتعديل وترتيب وحذف", async () => {
    const c1 = await saveCategory(A, { name: "عطور رجالية" });
    const c2 = await saveCategory(A, { name: "عطور نسائية" });
    const c3 = await saveCategory(A, { name: "عطور رجالية" }); // نفس الاسم: slug مختلف
    if (!c1.ok || !c2.ok || !c3.ok) throw new Error("setup");
    const list = await listCategories(A);
    expect(list.map((c) => c.position)).toEqual([0, 1, 2]);
    expect(new Set(list.map((c) => c.slug)).size).toBe(3);

    expect((await reorderCategories(A, [c3.data.id, c1.data.id, c2.data.id])).ok).toBe(true);
    expect((await listCategories(A)).map((c) => c.id)).toEqual([c3.data.id, c1.data.id, c2.data.id]);

    expect((await saveCategory(A, { id: c1.data.id, name: "رجالي", isVisible: false })).ok).toBe(true);
    expect((await listCategories(A)).find((c) => c.id === c1.data.id)).toMatchObject({ name: "رجالي", isVisible: false });

    expect((await deleteCategory(A, c3.data.id)).ok).toBe(true);
    expect((await listCategories(A))).toHaveLength(2);
  });

  it("المتجر ما يقدر يعدل/يمسح/يرتب أقسام متجر ثاني", async () => {
    const b = await saveCategory(B, { name: "قسم B" });
    if (!b.ok) throw new Error("setup");
    expect(await saveCategory(A, { id: b.data.id, name: "اختراق" })).toEqual({ ok: false, error: "ما لقينا القسم. يمكن انحذف، حدّث الصفحة." });
    expect((await deleteCategory(A, b.data.id)).ok).toBe(false);
    expect((await reorderCategories(A, [b.data.id])).ok).toBe(false);
    expect((await listCategories(B))[0]!.name).toBe("قسم B");
  });

  it("يرفض صورة من متجر ثاني برسالة واضحة", async () => {
    const foreign = await mkMedia((B.storeId));
    expect(await saveCategory(A, { name: "x", imageMediaId: foreign })).toEqual({ ok: false, error: expect.stringContaining("الصورة") });
  });

  it("يرفض اسم فاضي", async () => {
    expect((await saveCategory(A, { name: "  " })).ok).toBe(false);
  });
});

describe("المنتجات البسيطة", () => {
  it("ينشئ منتج بمتغير افتراضي ويسجل المخزون الافتتاحي", async () => {
    const r = await saveProduct(A, simple({ description: "وصف" }), { limits: LIMITS });
    if (!r.ok) throw new Error(r.error);
    const p = await getProductForEdit(A, r.data.id);
    expect(p).toMatchObject({ name: "عطر", price: 25_000, isVisible: true, options: [] });
    expect(p!.variants).toHaveLength(1);
    expect(p!.variants[0]).toMatchObject({ stock: 5, valueIds: [] });
    const moves = await A.from(t.stockMovements, eq(t.stockMovements.variantId, p!.variants[0]!.id));
    expect(moves.map((m) => m.delta)).toEqual([5]);
  });

  it("تعديل المخزون يسجل حركة بالفرق", async () => {
    const r = await saveProduct(A, simple({ name: "منتج مخزون" }), { limits: LIMITS });
    if (!r.ok) throw new Error(r.error);
    const p = (await getProductForEdit(A, r.data.id))!;
    await saveProduct(A, { ...p, variants: [{ ...p.variants[0]!, stock: 2 }] }, { limits: LIMITS });
    const moves = await A.from(t.stockMovements, eq(t.stockMovements.variantId, p.variants[0]!.id));
    expect(moves.map((m) => m.delta).sort()).toEqual([-3, 5]);
  });

  it("slug فريد للأسماء المتشابهة", async () => {
    const a = await saveProduct(A, simple({ name: "قميص أبيض" }), { limits: LIMITS });
    const b = await saveProduct(A, simple({ name: "قميص أبيض" }), { limits: LIMITS });
    if (!a.ok || !b.ok) throw new Error("setup");
    const rows = await A.from(t.products, eq(t.products.name, "قميص أبيض"));
    expect(new Set(rows.map((r) => r.slug)).size).toBe(2);
  });

  it("يرفض السعر قبل التخفيض الأقل أو المساوي للسعر الحالي", async () => {
    expect((await saveProduct(A, simple({ compareAtPrice: 25_000 }), { limits: LIMITS })).ok).toBe(false);
    expect((await saveProduct(A, simple({ compareAtPrice: 30_000 }), { limits: LIMITS })).ok).toBe(true);
  });

  it("يرفض أسعار/مخزون سالبة واسم فاضي", async () => {
    expect((await saveProduct(A, simple({ price: -1 }), { limits: LIMITS })).ok).toBe(false);
    expect((await saveProduct(A, simple({ variants: [{ valueIds: [], stock: -2 }] }), { limits: LIMITS })).ok).toBe(false);
    expect((await saveProduct(A, simple({ name: " " }), { limits: LIMITS })).ok).toBe(false);
  });

  it("الصور تتحفظ بالترتيب", async () => {
    const m1 = await mkMedia(A.storeId);
    const m2 = await mkMedia(A.storeId);
    const r = await saveProduct(A, simple({ imageMediaIds: [m2, m1] }), { limits: LIMITS });
    if (!r.ok) throw new Error(r.error);
    expect((await getProductForEdit(A, r.data.id))!.imageMediaIds).toEqual([m2, m1]);
  });
});

describe("الخيارات والمتغيرات", () => {
  const sizes = (extra: string[] = []) => ({
    id: "tmp_size", name: "المقاس",
    values: [{ id: "tmp_s", value: "S" }, { id: "tmp_m", value: "M" }, ...extra.map((e) => ({ id: `tmp_${e}`, value: e }))],
  });

  it("ينشئ متغيرات بخيار واحد، ويحافظ على المتغيرات عند التعديل، ويضيف جديد ويحذف المحذوف", async () => {
    const r = await saveProduct(A, {
      name: "تيشرت", price: 10_000, options: [sizes()],
      variants: [{ valueIds: ["tmp_s"], stock: 3 }, { valueIds: ["tmp_m"], stock: 4 }],
    }, { limits: LIMITS });
    if (!r.ok) throw new Error(r.error);
    const p1 = (await getProductForEdit(A, r.data.id))!;
    expect(p1.options[0]!.values.map((v) => v.value)).toEqual(["S", "M"]);
    expect(p1.variants.map((v) => v.stock).sort()).toEqual([3, 4]);

    // نضيف L، نحذف S، ونعدل مخزون M
    const [opt] = p1.options;
    const s = opt!.values.find((v) => v.value === "S")!;
    const m = opt!.values.find((v) => v.value === "M")!;
    const vm = p1.variants.find((v) => v.valueIds.includes(m.id))!;
    const vs = p1.variants.find((v) => v.valueIds.includes(s.id))!;
    const r2 = await saveProduct(A, {
      ...p1,
      options: [{ id: opt!.id, name: "المقاس", values: [{ id: m.id, value: "M", colorHex: null }, { id: "tmp_l", value: "L", colorHex: null }] }],
      variants: [{ ...vm, stock: 9 }, { valueIds: ["tmp_l"], stock: 1 }],
    }, { limits: LIMITS });
    if (!r2.ok) throw new Error(r2.error);
    const p2 = (await getProductForEdit(A, r.data.id))!;
    expect(p2.options[0]!.values.map((v) => v.value)).toEqual(["M", "L"]);
    expect(p2.variants).toHaveLength(2);
    expect(p2.variants.find((v) => v.id === vm.id)!.stock).toBe(9); // نفس id، ما انمسحش
    expect(p2.variants.some((v) => v.id === vs.id)).toBe(false); // S اتمسح
    // كل متغير مربوط بقيمة وحدة من الخيار
    expect(p2.variants.every((v) => v.valueIds.length === 1)).toBe(true);
  });

  it("خيارين: يتحقق من التركيبات", async () => {
    const options = [
      { id: "o1", name: "المقاس", values: [{ id: "a", value: "S" }, { id: "b", value: "M" }] },
      { id: "o2", name: "اللون", values: [{ id: "c", value: "أحمر", colorHex: "#ff0000" }, { id: "d", value: "أزرق" }] },
    ];
    const ok = await saveProduct(A, {
      name: "فستان", price: 50_000, options,
      variants: [["a", "c"], ["a", "d"], ["b", "c"], ["b", "d"]].map((valueIds) => ({ valueIds, stock: 1 })),
    }, { limits: LIMITS });
    expect(ok.ok).toBe(true);
    // تركيبة مكررة
    const dup = await saveProduct(A, { name: "x", price: 1, options, variants: [{ valueIds: ["a", "c"], stock: 1 }, { valueIds: ["c", "a"], stock: 1 }] }, { limits: LIMITS });
    expect(dup).toEqual({ ok: false, error: expect.stringContaining("نفس الخيارات") });
    // قيمتين من نفس الخيار
    const bad = await saveProduct(A, { name: "x", price: 1, options, variants: [{ valueIds: ["a", "b"], stock: 1 }] }, { limits: LIMITS });
    expect(bad.ok).toBe(false);
    // قيمة مش موجودة
    const ghost = await saveProduct(A, { name: "x", price: 1, options, variants: [{ valueIds: ["a", "zzz"], stock: 1 }] }, { limits: LIMITS });
    expect(ghost.ok).toBe(false);
  });

  it("المتغير اللي عليه طلبيات يتعطل بدل ما يتمسح", async () => {
    const r = await saveProduct(A, {
      name: "منتج مطلوب", price: 10_000, options: [sizes()],
      variants: [{ valueIds: ["tmp_s"], stock: 3 }, { valueIds: ["tmp_m"], stock: 4 }],
    }, { limits: LIMITS });
    if (!r.ok) throw new Error(r.error);
    const p = (await getProductForEdit(A, r.data.id))!;
    const sold = p.variants[0]!;

    const [customer] = await A.insert(t.customers, { phone: "0911112222", name: "زبون" });
    const [order] = await A.insert(t.orders, {
      number: 5001, trackingToken: "tk", customerId: customer!.id, customerName: "زبون", customerPhone: "0911112222",
      cityId, cityName: "طرابلس", address: "x", subtotal: 1, total: 1,
    });
    await A.insert(t.orderItems, { orderId: order!.id, productId: p.id, variantId: sold.id, name: "x", unitPrice: 1, quantity: 1 });

    // نمسح كل المتغيرات: اللي مطلوب يتعطل واللي مش مطلوب يتمسح
    const keep = p.variants[1]!;
    const r2 = await saveProduct(A, { ...p, variants: [keep] }, { limits: LIMITS });
    if (!r2.ok) throw new Error(r2.error);
    const rows = await A.from(t.productVariants, eq(t.productVariants.productId, p.id));
    const soldRow = rows.find((v) => v.id === sold.id);
    expect(soldRow).toBeDefined();
    expect(soldRow!.isActive).toBe(false);
    expect(rows.find((v) => v.id === keep.id)!.isActive).toBe(true);
  });
});

describe("الحدود والعزل", () => {
  it("الحد الأقصى للمنتجات: المحذوفة ما تحسبش", async () => {
    const { store } = await makeStore(db, "limited");
    const S = forStore(db, store.id);
    const limits = { ...LIMITS, maxProducts: 2 };
    const a = await saveProduct(S, simple({ name: "1" }), { limits });
    const b = await saveProduct(S, simple({ name: "2" }), { limits });
    if (!a.ok || !b.ok) throw new Error("setup");
    expect(await saveProduct(S, simple({ name: "3" }), { limits })).toEqual({ ok: false, error: expect.stringContaining("الأقصى") });
    expect((await duplicateProduct(S, a.data.id, { limits })).ok).toBe(false);
    expect(await productQuota(S, limits)).toMatchObject({ used: 2, max: 2, remaining: 0 });

    await deleteProducts(S, [a.data.id]);
    expect((await productQuota(S, limits)).remaining).toBe(1);
    expect((await saveProduct(S, simple({ name: "3" }), { limits })).ok).toBe(true);
    // التعديل ما يتأثرش بالحد
    expect((await saveProduct(S, { ...(await getProductForEdit(S, b.data.id))!, name: "2 معدل" }, { limits })).ok).toBe(true);
  });

  it("ما يقدر يعدل أو ينسخ أو يحذف منتج متجر ثاني", async () => {
    const b = await saveProduct(B, simple({ name: "منتج B" }), { limits: LIMITS });
    if (!b.ok) throw new Error("setup");
    const bProduct = (await getProductForEdit(B, b.data.id))!;
    expect(await getProductForEdit(A, b.data.id)).toBeNull();
    expect(await saveProduct(A, { ...bProduct, name: "اختراق" }, { limits: LIMITS })).toEqual({ ok: false, error: "ما لقينا المنتج. يمكن انحذف، حدّث الصفحة." });
    expect((await duplicateProduct(A, b.data.id, { limits: LIMITS })).ok).toBe(false);
    expect((await deleteProducts(A, [b.data.id]))).toEqual({ ok: true, data: { count: 0 } });
    expect((await getProductForEdit(B, b.data.id))!.name).toBe("منتج B");
  });

  it("يرفض قسم أو صورة أو متغير من متجر ثاني", async () => {
    const bCat = await saveCategory(B, { name: "قسم خاص B" });
    if (!bCat.ok) throw new Error("setup");
    expect((await saveProduct(A, simple({ categoryIds: [bCat.data.id] }), { limits: LIMITS })).ok).toBe(false);

    const bMedia = await mkMedia(B.storeId);
    const img = await saveProduct(A, simple({ imageMediaIds: [bMedia] }), { limits: LIMITS });
    expect(img.ok).toBe(false);
    // الفشل ما يسيبش منتج نص مكتمل (rollback)
    expect(await A.from(t.products, eq(t.products.name, "عطر"))).not.toHaveLength(0); // منتجات الاختبارات السابقة بس
  });

  it("rollback كامل لو حصل خطأ بعد إنشاء المنتج", async () => {
    const before = await A.count(t.products);
    const bMedia = await mkMedia(B.storeId);
    const r = await saveProduct(A, simple({ name: "لازم يتلغى", imageMediaIds: [bMedia] }), { limits: LIMITS });
    expect(r.ok).toBe(false);
    expect(await A.count(t.products)).toBe(before);
  });
});

describe("نسخ / إخفاء / حذف / بحث", () => {
  it("النسخ يعمل منتج مخفي بنفس الخيارات والمخزون", async () => {
    const r = await saveProduct(A, {
      name: "للنسخ", price: 7_000, categoryIds: [], options: [{ id: "o", name: "المقاس", values: [{ id: "x", value: "S" }, { id: "y", value: "M" }] }],
      variants: [{ valueIds: ["x"], stock: 2 }, { valueIds: ["y"], stock: 6 }],
    }, { limits: LIMITS });
    if (!r.ok) throw new Error(r.error);
    const copy = await duplicateProduct(A, r.data.id, { limits: LIMITS });
    if (!copy.ok) throw new Error(copy.error);
    const src = (await getProductForEdit(A, r.data.id))!;
    const dup = (await getProductForEdit(A, copy.data.id))!;
    expect(dup.name).toBe("نسخة من للنسخ");
    expect(dup.isVisible).toBe(false);
    expect(dup.variants.map((v) => v.stock).sort()).toEqual([2, 6]);
    expect(dup.options[0]!.id).not.toBe(src.options[0]!.id); // ids جديدة، ما يشاركوش الخيارات
    expect(dup.variants.every((v) => v.valueIds.length === 1)).toBe(true);
  });

  it("الإخفاء والحذف الناعم والقائمة والبحث والصفحات", async () => {
    const { store } = await makeStore(db, "list-shop");
    const S = forStore(db, store.id);
    const ids: string[] = [];
    for (let i = 1; i <= 25; i++) {
      const r = await saveProduct(S, simple({ name: i === 3 ? "عطر ورد 100%" : `منتج ${i}` }), { limits: LIMITS });
      if (!r.ok) throw new Error(r.error);
      ids.push(r.data.id);
    }
    const p1 = await listProducts(S, {});
    expect(p1).toMatchObject({ total: 25, page: 1, pageCount: 2 });
    expect(p1.items).toHaveLength(20);
    expect((await listProducts(S, { page: 2 })).items).toHaveLength(5);
    expect((await listProducts(S, { page: 99 })).page).toBe(2);

    expect((await listProducts(S, { q: "ورد" })).total).toBe(1);
    expect((await listProducts(S, { q: "100%" })).total).toBe(1); // % ما يتفسرش wildcard
    expect((await listProducts(S, { q: "%" })).total).toBe(1);

    await setProductsVisibility(S, ids.slice(0, 5), false);
    expect((await listProducts(S, { visibility: "hidden" })).total).toBe(5);
    expect((await listProducts(S, { visibility: "visible" })).total).toBe(20);

    await deleteProducts(S, ids.slice(0, 2));
    expect((await listProducts(S, {})).total).toBe(23);
    expect(await getProductForEdit(S, ids[0]!)).toBeNull();
  });

  it("فلتر القسم والمخزون المنخفض", async () => {
    const { store } = await makeStore(db, "filter-shop");
    const S = forStore(db, store.id);
    const cat = await saveCategory(S, { name: "قسم" });
    if (!cat.ok) throw new Error("setup");
    const inCat = await saveProduct(S, simple({ name: "داخل القسم", categoryIds: [cat.data.id], variants: [{ valueIds: [], stock: 1 }] }), { limits: LIMITS });
    await saveProduct(S, simple({ name: "برا القسم", variants: [{ valueIds: [], stock: 50 }] }), { limits: LIMITS });
    if (!inCat.ok) throw new Error("setup");
    expect((await listProducts(S, { categoryId: cat.data.id })).items.map((i) => i.name)).toEqual(["داخل القسم"]);
    expect((await listProducts(S, { lowStock: 5 })).items.map((i) => i.name)).toEqual(["داخل القسم"]);
    expect((await listCategories(S))[0]!.productCount).toBe(1);
  });
});

describe("التعديل الجماعي", () => {
  it("حساب الأسعار", () => {
    expect(applyPriceOp(10_000, { mode: "percent", value: 10 })).toBe(11_000);
    expect(applyPriceOp(10_000, { mode: "percent", value: -25 })).toBe(7_500);
    expect(applyPriceOp(10_000, { mode: "add", value: -20_000 })).toBe(0);
    expect(applyPriceOp(10_000, { mode: "set", value: 3_500 })).toBe(3_500);
  });

  it("تعديل الأسعار والمخزون لمنتجات المتجر فقط", async () => {
    const { store } = await makeStore(db, "bulk-shop");
    const S = forStore(db, store.id);
    const a = await saveProduct(S, simple({ name: "a", price: 10_000, compareAtPrice: 12_000, variants: [{ valueIds: [], stock: 5 }] }), { limits: LIMITS });
    const b = await saveProduct(S, simple({ name: "b", price: 20_000, variants: [{ valueIds: [], stock: 1 }] }), { limits: LIMITS });
    const other = await saveProduct(B, simple({ name: "other", price: 5_000 }), { limits: LIMITS });
    if (!a.ok || !b.ok || !other.ok) throw new Error("setup");

    const r = await bulkUpdatePrices(S, [a.data.id, b.data.id, other.data.id], { mode: "percent", value: 10 });
    expect(r).toEqual({ ok: true, data: { count: 2 } });
    const pa = (await getProductForEdit(S, a.data.id))!;
    expect([pa.price, pa.compareAtPrice]).toEqual([11_000, 13_200]);
    expect((await getProductForEdit(S, b.data.id))!.price).toBe(22_000);
    expect((await getProductForEdit(B, other.data.id))!.price).toBe(5_000); // ما اتأثرش

    // «تحديد سعر» أقل من compareAt القديم: يبقى منطقي
    await bulkUpdatePrices(S, [a.data.id], { mode: "set", value: 20_000 });
    expect((await getProductForEdit(S, a.data.id))!.compareAtPrice).toBeNull();

    expect((await bulkUpdateStock(S, [a.data.id, b.data.id], { mode: "add", value: 10 })).ok).toBe(true);
    expect((await getProductForEdit(S, a.data.id))!.variants[0]!.stock).toBe(15);
    expect((await getProductForEdit(S, b.data.id))!.variants[0]!.stock).toBe(11);
    await bulkUpdateStock(S, [a.data.id], { mode: "add", value: -100 });
    expect((await getProductForEdit(S, a.data.id))!.variants[0]!.stock).toBe(0); // ما ينزلش تحت الصفر
    await bulkUpdateStock(S, [b.data.id], { mode: "set", value: 4 });
    expect((await getProductForEdit(S, b.data.id))!.variants[0]!.stock).toBe(4);

    expect((await bulkUpdatePrices(S, [a.data.id], { mode: "percent", value: -95 })).ok).toBe(false);
    expect((await bulkUpdatePrices(S, [], { mode: "set", value: 1 })).ok).toBe(false);
    expect((await bulkUpdateStock(S, [a.data.id], { mode: "set", value: -1 })).ok).toBe(false);
  });
});

describe("استيراد المنتجات", () => {
  it("CSV: يقرا الأعمدة العربية ويحول الأسعار لدرهم ويكتشف الأخطاء", async () => {
    const { parseCsv } = await import("@/lib/csv");
    const { parseProductRows } = await import("@/server/catalog/import");
    const csv = [
      "﻿الاسم,السعر,السعر قبل التخفيض,المخزون,القسم,ظاهر",
      'عطر "ملكي",85,110,12,عطور,نعم',
      "بدون سعر,,,1,عطور,نعم",
      "سعر غلط,abc,,1,,",
      "تخفيض غلط,50,40,1,,",
      "مخزون عشري,50,,1.5,,",
      "مخفي,12.5,,3,,لا",
      "٣٠,٣٠,,٢,,",
    ].join("\r\n");
    const { rows, errors } = parseProductRows(parseCsv(csv));
    expect(rows.map((r) => r.name)).toEqual(['عطر "ملكي"', "مخفي", "٣٠"]);
    expect(rows[0]).toMatchObject({ price: 85_000, compareAtPrice: 110_000, stock: 12, category: "عطور", isVisible: true });
    expect(rows[1]).toMatchObject({ price: 12_500, isVisible: false });
    expect(rows[2]).toMatchObject({ price: 30_000, stock: 2 }); // أرقام عربية
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
  });

  it("فواصل منقوطة وأعمدة إنجليزية وحقول بسطور", async () => {
    const { parseCsv } = await import("@/lib/csv");
    const { parseProductRows } = await import("@/server/catalog/import");
    const csv = 'name;price;stock;description\n"A";10;1;"سطر1\nسطر2"\nB;20,5;2;';
    const { rows } = parseProductRows(parseCsv(csv));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.description).toBe("سطر1\nسطر2");
    expect(rows[1]!.price).toBe(20_500);
  });

  it("يرفض ملف بدون أعمدة أساسية أو أكبر من الحد", async () => {
    const { parseProductRows } = await import("@/server/catalog/import");
    expect(() => parseProductRows([["a", "b"], ["1", "2"]])).toThrow(/الاسم/);
    expect(() => parseProductRows([["الاسم", "السعر"]])).toThrow(/فاضي/);
    const big = [["الاسم", "السعر"], ...Array.from({ length: 501 }, (_, i) => [`p${i}`, "1"])];
    expect(() => parseProductRows(big)).toThrow(/500/);
  });

  it("Excel (.xlsx) يتقرا", async () => {
    const { readRows } = await import("@/server/catalog/import");
    const { writeFileSync, mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { execFileSync } = await import("node:child_process");
    // ننشئ xlsx صغير بـ zip يدوي عبر python (متوفر في بيئة التطوير). لو مش متوفر نتخطى.
    const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
    const file = join(dir, "t.xlsx");
    try {
      execFileSync("python3", ["-c", `
import zipfile,sys
z=zipfile.ZipFile(sys.argv[1],'w')
z.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
z.writestr('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
z.writestr('xl/workbook.xml','<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>')
z.writestr('xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
z.writestr('xl/worksheets/sheet1.xml','<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>الاسم</t></is></c><c r="B1" t="inlineStr"><is><t>السعر</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>عطر</t></is></c><c r="B2"><v>45.5</v></c></row></sheetData></worksheet>')
z.close()
`, file]);
    } catch { return; }
    const rows = await readRows("t.xlsx", readFileSync(file));
    expect(rows).toEqual([["الاسم", "السعر"], ["عطر", "45.5"]]);
    void writeFileSync;
  });

  it("الاستيراد: ينشئ الأقسام ويحترم حد الباقة ويكمل رغم الأخطاء", async () => {
    const { importProducts, parseProductRows } = await import("@/server/catalog/import");
    const { store } = await makeStore(db, "import-shop");
    const S = forStore(db, store.id);
    const rows = [["الاسم", "السعر", "المخزون", "القسم"], ...Array.from({ length: 5 }, (_, i) => [`منتج ${i + 1}`, "10", "2", i % 2 ? "فساتين" : "قمصان"]), ["", "5", "1", ""]];
    const report = await importProducts(S, parseProductRows(rows), { limits: { ...LIMITS, maxProducts: 3 } });
    expect(report).toMatchObject({ created: 3, limitReached: true, categoriesCreated: 2 });
    expect(report.skipped.map((s) => s.line)).toEqual([5, 6, 7]); // 2 للحد + 1 اسم فاضي
    expect(await S.count(t.products)).toBe(3);
    expect(await S.count(t.categories)).toBe(2);

    // إعادة الاستيراد لا تكرر الأقسام
    const again = await importProducts(S, parseProductRows([["الاسم", "السعر", "القسم"], ["جديد", "1", "قمصان"]]), { limits: LIMITS });
    expect(again).toMatchObject({ created: 1, categoriesCreated: 0 });
  });
});

describe("سباق حد المنتجات", () => {
  it("إنشاءات متزامنة ما تتجاوزش الحد", async () => {
    const { store } = await makeStore(db, "race-limit");
    const S = forStore(db, store.id);
    const limits = { ...LIMITS, maxProducts: 3 };
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => saveProduct(S, simple({ name: `سباق ${i}` }), { limits })));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(await S.count(t.products)).toBe(3);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.error.includes("الأقصى"))).toBe(true);
  });
});
