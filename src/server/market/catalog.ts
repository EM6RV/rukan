// بيانات الماركت للمنتج: الموزون ورقم الميزان، الوحدات (كرتونة = 24)، الباركودات المتعددة، أسعار نص الجملة والجملة،
// الأزرار السريعة والرف. وأقسام البقالة الجاهزة والبحث بالباركود (للجرد والتجهيز).
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { DEFAULT_SCALE, internalBarcode, isValidEan, parseScaleBarcode, samePlu, type ScaleConfig } from "@/lib/barcode";
import { slugify, uniqueSlug } from "@/lib/slugify";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "../catalog/result";
import { isUniqueViolation } from "../db-errors";
import { t, type StoreScope, type StoreScopeCore } from "../tenant";

type Core = Pick<StoreScopeCore, "from" | "insert" | "update" | "delete" | "count">;
const money = z.number({ error: "السعر لازم يكون رقم" }).int("السعر غير صحيح").min(0, "السعر ما يكونش بالسالب").max(1_000_000_000);
const optMoney = money.nullish().transform((v) => v ?? null);
const code = z.string().trim().min(3, "الباركود قصير").max(40, "الباركود طويل").regex(/^[\x20-\x7e]+$/, "الباركود حروف إنجليزية وأرقام بس");

export const marketProductSchema = z.object({
  productId: z.string().min(1),
  soldBy: z.enum(["unit", "weight"]).default("unit"),
  pluCode: z.string().trim().regex(/^\d{1,6}$/, "رقم الميزان أرقام بس (حتى 6)").nullish().transform((v) => v || null),
  quickPosition: z.number().int().min(0).max(999).nullish().transform((v) => v ?? null),
  quickColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish().transform((v) => v || null),
  shelf: z.string().trim().max(30, "اسم الرف طويل").nullish().transform((v) => v || null),
  units: z.array(z.object({
    id: z.string().min(1).nullish(),
    name: z.string().trim().min(1, "اكتب اسم الوحدة").max(30, "اسم الوحدة طويل"),
    factor: z.number().int("المعامل رقم صحيح").min(2, "الوحدة لازم تكون حبتين أو أكثر").max(100_000),
    price: optMoney, semiPrice: optMoney, wholesalePrice: optMoney,
  })).max(5, "خمس وحدات بالكثير").default([]),
  /** unit: اسم الوحدة (أو null للحبة) */
  barcodes: z.array(z.object({ variantId: z.string().min(1), unit: z.string().trim().max(30).nullish().transform((v) => v || null), code })).max(50, "باركودات كثيرة").default([]),
  levelPrices: z.array(z.object({ variantId: z.string().min(1), semi: optMoney, wholesale: optMoney })).max(200).default([]),
});
export type MarketProductInput = z.input<typeof marketProductSchema>;

export async function getMarketProduct(scope: StoreScope, productId: string) {
  const [p] = await scope.from(t.products, and(eq(t.products.id, productId), isNull(t.products.deletedAt))!).limit(1);
  if (!p) return null;
  const variants = await scope.from(t.productVariants, eq(t.productVariants.productId, p.id));
  const vIds = variants.map((v) => v.id);
  const [units, barcodes, prices] = await Promise.all([
    scope.from(t.productUnits, eq(t.productUnits.productId, p.id)).orderBy(t.productUnits.position),
    vIds.length ? scope.from(t.productBarcodes, inArray(t.productBarcodes.variantId, vIds)) : Promise.resolve([]),
    vIds.length ? scope.from(t.variantPrices, inArray(t.variantPrices.variantId, vIds)) : Promise.resolve([]),
  ]);
  return {
    product: { id: p.id, name: p.name, price: p.price, costPrice: p.costPrice, soldBy: p.soldBy, pluCode: p.pluCode, quickPosition: p.quickPosition, quickColor: p.quickColor, shelf: p.shelf },
    variants: variants.map((v) => ({ id: v.id, sku: v.sku, price: v.price ?? p.price, stock: v.stock })),
    units: units.map((u) => ({ id: u.id, name: u.name, factor: u.factor, price: u.price, semiPrice: u.semiPrice, wholesalePrice: u.wholesalePrice })),
    barcodes: barcodes.map((b) => ({ id: b.id, variantId: b.variantId, unit: units.find((u) => u.id === b.unitId)?.name ?? null, code: b.code, isInternal: b.isInternal })),
    levelPrices: variants.map((v) => ({
      variantId: v.id,
      semi: prices.find((x) => x.variantId === v.id && x.level === "semi")?.price ?? null,
      wholesale: prices.find((x) => x.variantId === v.id && x.level === "wholesale")?.price ?? null,
    })),
  };
}

/** يحفظ بيانات الماركت كاملة (الوحدات والباركودات والأسعار تتبدل). wholesale=false يتجاهل أسعار المستويات. */
export async function saveMarketProduct(scope: StoreScope, input: unknown, opts: { wholesale: boolean }): Promise<Result<{ productId: string }>> {
  const p = marketProductSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  const names = d.units.map((u) => u.name);
  if (new Set(names).size !== names.length) return fail("فيه وحدتين بنفس الاسم.");
  const codes = d.barcodes.map((b) => b.code);
  if (new Set(codes).size !== codes.length) return fail("فيه باركود مكرر.");
  if (d.barcodes.some((b) => b.unit && !names.includes(b.unit))) return fail("باركود مربوط بوحدة مش موجودة.");
  try {
    return await scope.transaction(async (tx) => {
      const [prod] = await tx.from(t.products, and(eq(t.products.id, d.productId), isNull(t.products.deletedAt))!).limit(1);
      if (!prod) return fail("ما لقينا المنتج. حدّث الصفحة.");
      const variants = await tx.from(t.productVariants, eq(t.productVariants.productId, prod.id));
      const vIds = new Set(variants.map((v) => v.id));
      if (d.barcodes.some((b) => !vIds.has(b.variantId)) || d.levelPrices.some((x) => !vIds.has(x.variantId))) return fail("متغير مش من المنتج هذا.");
      if (d.soldBy === "weight" && variants.length > 1) return fail("المنتج الموزون يكون بدون خيارات (متغير واحد).");
      if (d.soldBy === "weight" && d.units.length) return fail("المنتج الموزون ما عندوش وحدات (السعر للكيلو).");
      await tx.update(t.products, { soldBy: d.soldBy, pluCode: d.pluCode, quickPosition: d.quickPosition, quickColor: d.quickColor, shelf: d.shelf }, eq(t.products.id, prod.id));

      // الوحدات: نحدّث الموجود (بنفس المعرّف) ونحذف المشال ونضيف الجديد
      const existing = await tx.from(t.productUnits, eq(t.productUnits.productId, prod.id));
      const keep = new Set(d.units.map((u) => u.id).filter(Boolean) as string[]);
      const gone = existing.filter((u) => !keep.has(u.id)).map((u) => u.id);
      if (gone.length) await tx.delete(t.productUnits, inArray(t.productUnits.id, gone));
      const unitIds = new Map<string, string>();
      for (const [i, u] of d.units.entries()) {
        const row = { name: u.name, factor: u.factor, price: u.price, semiPrice: opts.wholesale ? u.semiPrice : null, wholesalePrice: opts.wholesale ? u.wholesalePrice : null, position: i };
        if (u.id && existing.some((e) => e.id === u.id)) { await tx.update(t.productUnits, row, eq(t.productUnits.id, u.id)); unitIds.set(u.name, u.id); }
        else { const [r] = await tx.insert(t.productUnits, { productId: prod.id, ...row }); unitIds.set(u.name, r!.id); }
      }

      // الباركودات: نبدلهم كاملين (الداخلي يفضل داخلي لو رجع نفس الكود)
      const oldCodes = variants.length ? await tx.from(t.productBarcodes, inArray(t.productBarcodes.variantId, [...vIds])) : [];
      if (oldCodes.length) await tx.delete(t.productBarcodes, inArray(t.productBarcodes.id, oldCodes.map((b) => b.id)));
      if (d.barcodes.length) {
        await tx.insert(t.productBarcodes, d.barcodes.map((b) => ({
          variantId: b.variantId, unitId: b.unit ? unitIds.get(b.unit)! : null, code: b.code, isInternal: oldCodes.some((o) => o.code === b.code && o.isInternal),
        })));
      }

      if (opts.wholesale) {
        await tx.delete(t.variantPrices, inArray(t.variantPrices.variantId, [...vIds]));
        const rows = d.levelPrices.flatMap((x) => [
          ...(x.semi !== null ? [{ variantId: x.variantId, level: "semi" as const, price: x.semi }] : []),
          ...(x.wholesale !== null ? [{ variantId: x.variantId, level: "wholesale" as const, price: x.wholesale }] : []),
        ]);
        if (rows.length) await tx.insert(t.variantPrices, rows);
      }
      return ok({ productId: prod.id });
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      const msg = String((e as { cause?: { message?: string } }).cause?.message ?? (e as Error).message);
      return fail(msg.includes("plu") ? "رقم الميزان مستعمل في منتج ثاني." : "الباركود مستعمل في منتج ثاني.");
    }
    throw e;
  }
}

/** يولّد باركود داخلي (EAN-13 يبدا بـ 29) فريد في النشاط ويربطه بالمتغير */
export async function generateInternalBarcode(scope: Core, variantId: string, unitId: string | null = null): Promise<Result<{ code: string }>> {
  const [v] = await scope.from(t.productVariants, eq(t.productVariants.id, variantId)).limit(1);
  if (!v) return fail("ما لقينا المنتج.");
  const n = await scope.count(t.productBarcodes, eq(t.productBarcodes.isInternal, true));
  for (let i = 0; i < 20; i++) {
    const c = internalBarcode(n + 1 + i * 7919 + Math.floor(Math.random() * 1000) * (i > 0 ? 1 : 0));
    if (await scope.count(t.productBarcodes, eq(t.productBarcodes.code, c))) continue;
    if (await scope.count(t.productVariants, eq(t.productVariants.sku, c))) continue;
    await scope.insert(t.productBarcodes, { variantId, unitId, code: c, isInternal: true });
    return ok({ code: c });
  }
  return fail("ما قدرناش نولّد باركود. جرّب مرة ثانية.");
}

export type BarcodeHit = { variantId: string; productId: string; name: string; unitId: string | null; factor: number; grams: number | null; price: number | null };

/** يلقى المنتج من الباركود: باركودات المنتج، ثم الـ SKU، ثم باركود الميزان (رقم الصنف) */
export async function lookupBarcode(scope: Pick<StoreScopeCore, "from">, raw: string, scale: ScaleConfig = DEFAULT_SCALE): Promise<BarcodeHit | null> {
  const c = raw.trim();
  if (!c || c.length > 40) return null;
  const name = async (variantId: string) => {
    const [v] = await scope.from(t.productVariants, eq(t.productVariants.id, variantId)).limit(1);
    const [p] = v ? await scope.from(t.products, and(eq(t.products.id, v.productId), isNull(t.products.deletedAt))!).limit(1) : [];
    return v && p ? { productId: p.id, name: p.name } : null;
  };
  const [b] = await scope.from(t.productBarcodes, eq(t.productBarcodes.code, c)).limit(1);
  if (b) {
    const unit = b.unitId ? (await scope.from(t.productUnits, eq(t.productUnits.id, b.unitId)).limit(1))[0] : undefined;
    const n = await name(b.variantId);
    if (n) return { variantId: b.variantId, ...n, unitId: unit?.id ?? null, factor: unit?.factor ?? 1, grams: null, price: null };
  }
  const [bySku] = await scope.from(t.productVariants, eq(t.productVariants.sku, c)).limit(1);
  if (bySku) { const n = await name(bySku.id); if (n) return { variantId: bySku.id, ...n, unitId: null, factor: 1, grams: null, price: null }; }
  if (isValidEan(c)) {
    const s = parseScaleBarcode(c, scale);
    if (s) {
      const weighed = await scope.from(t.products, and(isNull(t.products.deletedAt), eq(t.products.soldBy, "weight"))!);
      const p = weighed.find((x) => samePlu(x.pluCode, s.plu));
      const [v] = p ? await scope.from(t.productVariants, eq(t.productVariants.productId, p.id)).limit(1) : [];
      if (p && v) return { variantId: v.id, productId: p.id, name: p.name, unitId: null, factor: 1, grams: s.grams, price: s.price };
    }
  }
  return null;
}

// ===== أقسام البقالة الجاهزة =====

export const GROCERY_CATEGORIES = [
  "خضار وفواكه", "ألبان وأجبان وبيض", "لحوم ودواجن", "مخبوزات", "معلبات", "أرز ومعكرونة وبقوليات", "زيوت وسمن", "سكر وشاي وقهوة",
  "توابل وبهارات", "مشروبات ومياه", "عصائر", "حلويات وسناكس", "مجمدات", "منظفات", "عناية شخصية", "مستلزمات الأطفال", "ورقيات ومستلزمات البيت",
];

/** يضيف أقسام البقالة الناقصة (اللي موجود بنفس الاسم يتخطى) */
export async function addGroceryCategories(scope: StoreScope): Promise<Result<{ added: number }>> {
  const existing = await scope.from(t.categories);
  const names = new Set(existing.map((c) => c.name.trim()));
  const slugs = new Set(existing.map((c) => c.slug));
  let pos = existing.reduce((m, c) => Math.max(m, c.position), -1);
  let added = 0;
  for (const name of GROCERY_CATEGORIES) {
    if (names.has(name)) continue;
    const slug = uniqueSlug(slugify(name) || "category", slugs);
    slugs.add(slug);
    await scope.insert(t.categories, { name, slug, position: ++pos });
    added++;
  }
  return ok({ added });
}

/** أصناف الأزرار السريعة (للعرض في اللوحة) */
export async function listQuickKeys(scope: StoreScope) {
  const rows = await scope.from(t.products, isNull(t.products.deletedAt));
  return rows.filter((p) => p.quickPosition !== null).sort((a, b) => a.quickPosition! - b.quickPosition!).map((p) => ({ id: p.id, name: p.name, color: p.quickColor, position: p.quickPosition! }));
}

/** قائمة المنتجات ببيانات الماركت (للوحة والملصقات) */
export async function listMarketProducts(scope: StoreScope, q?: string) {
  const [products, variants, units, barcodes] = await Promise.all([
    scope.from(t.products, isNull(t.products.deletedAt)).orderBy(t.products.name),
    scope.from(t.productVariants),
    scope.from(t.productUnits),
    scope.from(t.productBarcodes),
  ]);
  const needle = q?.trim().toLowerCase();
  const codesOf = (vids: Set<string>) => barcodes.filter((b) => vids.has(b.variantId));
  return products.map((p) => {
    const vs = variants.filter((v) => v.productId === p.id);
    const vids = new Set(vs.map((v) => v.id));
    const codes = codesOf(vids);
    return {
      id: p.id, name: p.name, price: p.price, soldBy: p.soldBy, plu: p.pluCode, shelf: p.shelf, quick: p.quickPosition, kind: p.kind,
      stock: vs.reduce((s, v) => s + v.stock, 0), variants: vs.length,
      units: units.filter((u) => u.productId === p.id).map((u) => `${u.name} ${u.factor}`),
      barcode: codes.find((b) => !b.unitId)?.code ?? vs.find((v) => v.sku)?.sku ?? null, barcodes: codes.length,
    };
  }).filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.barcode?.toLowerCase() === needle || p.plu === needle || p.shelf?.toLowerCase() === needle);
}

/** بيانات الملصقات: اسم وسعر وباركود */
export async function labelData(scope: StoreScope, productIds: string[]) {
  const ids = [...new Set(productIds)].slice(0, 300);
  if (!ids.length) return [];
  const [products, variants, barcodes] = await Promise.all([
    scope.from(t.products, and(inArray(t.products.id, ids), isNull(t.products.deletedAt))!),
    scope.from(t.productVariants, inArray(t.productVariants.productId, ids)),
    scope.from(t.productBarcodes),
  ]);
  const out: { variantId: string; name: string; price: number; perKg: boolean; code: string | null; shelf: string | null }[] = [];
  for (const p of products) {
    for (const v of variants.filter((x) => x.productId === p.id && x.isActive)) {
      const code = barcodes.find((b) => b.variantId === v.id && !b.unitId)?.code ?? v.sku ?? null;
      out.push({ variantId: v.id, name: p.name, price: v.price ?? p.price, perKg: p.soldBy === "weight", code, shelf: p.shelf });
    }
  }
  return out;
}

/** يولّد باركود داخلي لكل متغير ما عندوش باركود (غير الموزون) */
export async function generateMissingBarcodes(scope: StoreScope, productIds: string[]): Promise<Result<{ created: number }>> {
  const ids = [...new Set(productIds)].slice(0, 300);
  if (!ids.length) return ok({ created: 0 });
  const [products, variants, barcodes] = await Promise.all([
    scope.from(t.products, and(inArray(t.products.id, ids), isNull(t.products.deletedAt))!),
    scope.from(t.productVariants, inArray(t.productVariants.productId, ids)),
    scope.from(t.productBarcodes),
  ]);
  let created = 0;
  for (const p of products.filter((x) => x.soldBy !== "weight")) {
    for (const v of variants.filter((x) => x.productId === p.id)) {
      if (v.sku || barcodes.some((b) => b.variantId === v.id && !b.unitId)) continue;
      const g = await generateInternalBarcode(scope, v.id);
      if (g.ok) created++;
    }
  }
  return ok({ created });
}

/** خيارات اختيار صنف (متغير) في النماذج: الاسم + المتغير */
export async function variantOptions(scope: StoreScope) {
  const [products, variants] = await Promise.all([scope.from(t.products, and(isNull(t.products.deletedAt), eq(t.products.kind, "simple"))!).orderBy(t.products.name), scope.from(t.productVariants, eq(t.productVariants.isActive, true))]);
  const out: { variantId: string; productId: string; name: string; stock: number; isWeighed: boolean; price: number; cost: number | null }[] = [];
  for (const p of products) {
    const vs = variants.filter((v) => v.productId === p.id);
    for (const [i, v] of vs.entries()) out.push({ variantId: v.id, productId: p.id, name: vs.length > 1 ? `${p.name} (${v.sku ?? i + 1})` : p.name, stock: v.stock, isWeighed: p.soldBy === "weight", price: v.price ?? p.price, cost: v.costPrice ?? p.costPrice });
  }
  return out;
}
