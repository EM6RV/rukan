import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { PlanLimits } from "@/db/schema/platform";
import { slugify, uniqueSlug } from "@/lib/slugify";
import { firstError } from "@/lib/validation";
import { isFkViolation, isUniqueViolation } from "../db-errors";
import { t, type StoreScope } from "../tenant";
import { productInputSchema, type ProductData } from "./product-schema";
import { fail, ok, type Result } from "./result";

const PAGE_SIZE = 20;

// ===== الحدود =====

export async function productQuota(scope: Pick<StoreScope, "count">, limits: PlanLimits) {
  const used = await scope.count(t.products, isNull(t.products.deletedAt));
  const max = limits.maxProducts;
  return { used, max, remaining: max === null ? Infinity : Math.max(0, max - used) };
}

const limitMessage = (max: number) => `وصلت للحد الأقصى من المنتجات في باقتك (${max}). رقّي باقتك لتضيف أكثر.`;

// ===== القراءة =====

export type ProductListItem = {
  id: string; name: string; price: number; compareAtPrice: number | null; isVisible: boolean; isFeatured: boolean;
  thumbMediaId: string | null; stock: number; variantCount: number; createdAt: Date;
};

export async function listProducts(
  scope: StoreScope,
  opts: { q?: string; categoryId?: string; visibility?: "visible" | "hidden"; lowStock?: number; page?: number } = {},
): Promise<{ items: ProductListItem[]; total: number; page: number; pageCount: number }> {
  const conds = [isNull(t.products.deletedAt)];
  if (opts.q?.trim()) {
    // الهروب من % و _ و \ وإلا بحث المستخدم يتفسر كـ wildcard (SQLite يحتاج ESCAPE صريح)
    const term = `%${opts.q.trim().replace(/[\\%_]/g, "\\$&")}%`;
    conds.push(or(sql`${t.products.name} LIKE ${term} ESCAPE '\\'`, sql`${t.products.description} LIKE ${term} ESCAPE '\\'`)!);
  }
  if (opts.visibility) conds.push(eq(t.products.isVisible, opts.visibility === "visible"));
  if (opts.categoryId) {
    const links = await scope.from(t.productCategories, eq(t.productCategories.categoryId, opts.categoryId));
    conds.push(inArray(t.products.id, links.length ? links.map((l) => l.productId) : ["__none__"]));
  }
  if (opts.lowStock !== undefined) {
    const low = await scope.from(t.productVariants, and(eq(t.productVariants.isActive, true))!);
    const totals = new Map<string, number>();
    for (const v of low) totals.set(v.productId, (totals.get(v.productId) ?? 0) + v.stock);
    const ids = [...totals].filter(([, s]) => s <= opts.lowStock!).map(([id]) => id);
    conds.push(inArray(t.products.id, ids.length ? ids : ["__none__"]));
  }
  const where = and(...conds);

  const total = await scope.count(t.products, where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), pageCount);
  const rows = await scope.from(t.products, where).orderBy(desc(t.products.createdAt), t.products.id).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);

  const ids = rows.map((r) => r.id);
  const [variants, images] = ids.length
    ? await Promise.all([
        scope.from(t.productVariants, inArray(t.productVariants.productId, ids)),
        scope.from(t.productImages, inArray(t.productImages.productId, ids)).orderBy(t.productImages.position),
      ])
    : [[], []];
  const stock = new Map<string, { stock: number; n: number }>();
  for (const v of variants) {
    const cur = stock.get(v.productId) ?? { stock: 0, n: 0 };
    stock.set(v.productId, { stock: cur.stock + (v.isActive ? v.stock : 0), n: cur.n + 1 });
  }
  const thumb = new Map<string, string>();
  for (const im of images) if (!thumb.has(im.productId)) thumb.set(im.productId, im.mediaId);

  return {
    total, page, pageCount,
    items: rows.map((r) => ({
      id: r.id, name: r.name, price: r.price, compareAtPrice: r.compareAtPrice, isVisible: r.isVisible, isFeatured: r.isFeatured,
      thumbMediaId: thumb.get(r.id) ?? null, stock: stock.get(r.id)?.stock ?? 0, variantCount: stock.get(r.id)?.n ?? 0, createdAt: r.createdAt,
    })),
  };
}

export type ProductEditData = {
  id: string; name: string; description: string | null; price: number; compareAtPrice: number | null; costPrice: number | null;
  isFeatured: boolean; isVisible: boolean; categoryIds: string[]; imageMediaIds: string[];
  options: { id: string; name: string; values: { id: string; value: string; colorHex: string | null }[] }[];
  variants: { id: string; valueIds: string[]; sku: string | null; price: number | null; compareAtPrice: number | null; costPrice: number | null; stock: number; isActive: boolean }[];
};

export async function getProductForEdit(scope: StoreScope, id: string): Promise<ProductEditData | null> {
  const [p] = await scope.from(t.products, and(eq(t.products.id, id), isNull(t.products.deletedAt))!).limit(1);
  if (!p) return null;
  const [cats, imgs, opts, vars] = await Promise.all([
    scope.from(t.productCategories, eq(t.productCategories.productId, id)),
    scope.from(t.productImages, eq(t.productImages.productId, id)).orderBy(t.productImages.position),
    scope.from(t.productOptions, eq(t.productOptions.productId, id)).orderBy(t.productOptions.position),
    scope.from(t.productVariants, eq(t.productVariants.productId, id)).orderBy(t.productVariants.position),
  ]);
  const optIds = opts.map((o) => o.id);
  const varIds = vars.map((v) => v.id);
  const [values, links] = await Promise.all([
    optIds.length ? scope.from(t.productOptionValues, inArray(t.productOptionValues.optionId, optIds)).orderBy(t.productOptionValues.position) : [],
    varIds.length ? scope.from(t.variantOptionValues, inArray(t.variantOptionValues.variantId, varIds)) : [],
  ]);
  return {
    id: p.id, name: p.name, description: p.description, price: p.price, compareAtPrice: p.compareAtPrice, costPrice: p.costPrice,
    isFeatured: p.isFeatured, isVisible: p.isVisible,
    categoryIds: cats.map((c) => c.categoryId),
    imageMediaIds: imgs.map((i) => i.mediaId),
    options: opts.map((o) => ({
      id: o.id, name: o.name,
      values: values.filter((v) => v.optionId === o.id).map((v) => ({ id: v.id, value: v.value, colorHex: v.colorHex })),
    })),
    variants: vars.map((v) => ({
      id: v.id, valueIds: links.filter((l) => l.variantId === v.id).map((l) => l.optionValueId),
      sku: v.sku, price: v.price, compareAtPrice: v.compareAtPrice, costPrice: v.costPrice, stock: v.stock, isActive: v.isActive,
    })),
  };
}

// ===== الحفظ =====

type SaveCtx = { limits: PlanLimits; actorUserId?: string };

export async function saveProduct(scope: StoreScope, input: unknown, ctx: SaveCtx): Promise<Result<{ id: string }>> {
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const data = parsed.data;

  // الأقسام لازم تكون من نفس المتجر
  if (data.categoryIds.length) {
    const found = await scope.count(t.categories, inArray(t.categories.id, data.categoryIds));
    if (found !== data.categoryIds.length) return fail("قسم غير صحيح.");
  }

  try {
    return await scope.transaction(async (tx) => {
      let productId = data.id;
      const base = {
        name: data.name, description: data.description, price: data.price, compareAtPrice: data.compareAtPrice,
        costPrice: data.costPrice, isFeatured: data.isFeatured, isVisible: data.isVisible,
      };
      if (productId) {
        const [row] = await tx.update(t.products, base, and(eq(t.products.id, productId), isNull(t.products.deletedAt)));
        if (!row) throw new SaveError("المنتج غير موجود.");
      } else {
        // الفحص جوّا المعاملة (الكتابة متسلسلة) علشان طلبين متزامنين ما يتجاوزوش الحد
        if (ctx.limits.maxProducts !== null && (await productQuota(tx, ctx.limits)).used >= ctx.limits.maxProducts) {
          throw new SaveError(limitMessage(ctx.limits.maxProducts));
        }
        const slugs = new Set((await tx.from(t.products)).map((p) => p.slug));
        const slug = uniqueSlug(slugify(data.name) || "product", slugs);
        const [row] = await tx.insert(t.products, { ...base, slug });
        productId = row!.id;
      }

      await syncCategories(tx, productId, data.categoryIds);
      await syncImages(tx, productId, data.imageMediaIds);
      await syncOptionsAndVariants(tx, productId, data, ctx);
      return ok({ id: productId });
    });
  } catch (e) {
    if (e instanceof SaveError) return fail(e.message);
    if (isFkViolation(e)) return fail("صورة أو بيانات غير صحيحة. حدّث الصفحة وجرّب مرة ثانية.");
    if (isUniqueViolation(e)) return fail("فيه تعارض في البيانات (كود مكرر؟). جرّب مرة ثانية.");
    throw e;
  }
}

class SaveError extends Error {}
type Tx = Parameters<Parameters<StoreScope["transaction"]>[0]>[0];

async function syncCategories(tx: Tx, productId: string, categoryIds: string[]) {
  await tx.delete(t.productCategories, eq(t.productCategories.productId, productId));
  if (categoryIds.length) await tx.insert(t.productCategories, categoryIds.map((categoryId) => ({ productId, categoryId })));
}

async function syncImages(tx: Tx, productId: string, mediaIds: string[]) {
  await tx.delete(t.productImages, eq(t.productImages.productId, productId));
  if (mediaIds.length) await tx.insert(t.productImages, mediaIds.map((mediaId, position) => ({ productId, mediaId, position })));
}

async function syncOptionsAndVariants(tx: Tx, productId: string, data: ProductData, ctx: SaveCtx) {
  // --- الخيارات والقيم (نحافظ على الـ ids الحالية، والجديدة تاخذ ids حقيقية) ---
  const existingOptions = await tx.from(t.productOptions, eq(t.productOptions.productId, productId));
  const existingOptionIds = new Set(existingOptions.map((o) => o.id));
  const optionIdMap = new Map<string, string>(); // id من العميل -> id حقيقي
  const valueIdMap = new Map<string, string>();

  const keepOptionIds: string[] = [];
  for (const [position, o] of data.options.entries()) {
    if (existingOptionIds.has(o.id)) {
      await tx.update(t.productOptions, { name: o.name, position }, eq(t.productOptions.id, o.id));
      optionIdMap.set(o.id, o.id);
    } else {
      const [row] = await tx.insert(t.productOptions, { productId, name: o.name, position });
      optionIdMap.set(o.id, row!.id);
    }
    keepOptionIds.push(optionIdMap.get(o.id)!);
  }
  const removedOptions = existingOptions.filter((o) => !keepOptionIds.includes(o.id)).map((o) => o.id);
  if (removedOptions.length) await tx.delete(t.productOptions, inArray(t.productOptions.id, removedOptions)); // القيم والروابط بالـ cascade

  const realOptionIds = keepOptionIds;
  const existingValues = realOptionIds.length ? await tx.from(t.productOptionValues, inArray(t.productOptionValues.optionId, realOptionIds)) : [];
  const existingValueIds = new Set(existingValues.map((v) => v.id));
  const keepValueIds: string[] = [];
  for (const o of data.options) {
    const optionId = optionIdMap.get(o.id)!;
    for (const [position, v] of o.values.entries()) {
      if (existingValueIds.has(v.id) && existingValues.find((x) => x.id === v.id)?.optionId === optionId) {
        await tx.update(t.productOptionValues, { value: v.value, colorHex: v.colorHex, position }, eq(t.productOptionValues.id, v.id));
        valueIdMap.set(v.id, v.id);
      } else {
        const [row] = await tx.insert(t.productOptionValues, { optionId, value: v.value, colorHex: v.colorHex, position });
        valueIdMap.set(v.id, row!.id);
      }
      keepValueIds.push(valueIdMap.get(v.id)!);
    }
  }
  const removedValues = existingValues.filter((v) => !keepValueIds.includes(v.id)).map((v) => v.id);
  if (removedValues.length) await tx.delete(t.productOptionValues, inArray(t.productOptionValues.id, removedValues));

  // --- المتغيرات ---
  const existingVariants = await tx.from(t.productVariants, eq(t.productVariants.productId, productId));
  const existingById = new Map(existingVariants.map((v) => [v.id, v]));
  const keepVariantIds: string[] = [];

  for (const [position, v] of data.variants.entries()) {
    const fields = { sku: v.sku, price: v.price, compareAtPrice: v.compareAtPrice, costPrice: v.costPrice, stock: v.stock, isActive: v.isActive, position };
    let variantId: string;
    const prev = v.id ? existingById.get(v.id) : undefined;
    if (v.id && !prev) throw new SaveError("متغير غير صحيح. حدّث الصفحة وجرّب مرة ثانية.");
    if (prev) {
      variantId = prev.id;
      await tx.update(t.productVariants, fields, eq(t.productVariants.id, variantId));
      await tx.delete(t.variantOptionValues, eq(t.variantOptionValues.variantId, variantId));
      if (prev.stock !== v.stock) await logStock(tx, variantId, v.stock - prev.stock, "تعديل يدوي", ctx.actorUserId);
    } else {
      const [row] = await tx.insert(t.productVariants, { productId, ...fields });
      variantId = row!.id;
      if (v.stock > 0) await logStock(tx, variantId, v.stock, "رصيد افتتاحي", ctx.actorUserId);
    }
    keepVariantIds.push(variantId);
    if (v.valueIds.length) {
      await tx.insert(t.variantOptionValues, v.valueIds.map((id) => ({ variantId, optionValueId: valueIdMap.get(id)! })));
    }
  }

  // المتغيرات المحذوفة: لو عليها طلبيات نعطلها (الطلبيات القديمة تفضل سليمة)، وإلا نمسحها
  const removedVariants = existingVariants.filter((v) => !keepVariantIds.includes(v.id));
  if (removedVariants.length) {
    const removedIds = removedVariants.map((v) => v.id);
    const used = new Set((await tx.from(t.orderItems, inArray(t.orderItems.variantId, removedIds))).map((i) => i.variantId));
    const toDelete = removedIds.filter((id) => !used.has(id));
    const toDeactivate = removedIds.filter((id) => used.has(id));
    if (toDeactivate.length) await tx.update(t.productVariants, { isActive: false }, inArray(t.productVariants.id, toDeactivate));
    if (toDelete.length) await tx.delete(t.productVariants, inArray(t.productVariants.id, toDelete));
  }
}

async function logStock(tx: Tx, variantId: string, delta: number, note: string, actorUserId?: string) {
  if (!delta) return;
  await tx.insert(t.stockMovements, { variantId, delta, reason: "manual", note, actorUserId: actorUserId ?? null });
}

// ===== نسخ / إخفاء / حذف =====

export async function duplicateProduct(scope: StoreScope, id: string, ctx: SaveCtx): Promise<Result<{ id: string }>> {
  const src = await getProductForEdit(scope, id);
  if (!src) return fail("المنتج غير موجود.");
  const tmp = () => `tmp_${nanoid(8)}`;
  const optionMap = new Map(src.options.map((o) => [o.id, tmp()]));
  const valueMap = new Map(src.options.flatMap((o) => o.values.map((v) => [v.id, tmp()] as const)));
  return saveProduct(scope, {
    name: `نسخة من ${src.name}`.slice(0, 120),
    description: src.description, price: src.price, compareAtPrice: src.compareAtPrice, costPrice: src.costPrice,
    isFeatured: false, isVisible: false, categoryIds: src.categoryIds, imageMediaIds: src.imageMediaIds,
    options: src.options.map((o) => ({ id: optionMap.get(o.id)!, name: o.name, values: o.values.map((v) => ({ id: valueMap.get(v.id)!, value: v.value, colorHex: v.colorHex })) })),
    variants: src.variants.map((v) => ({ valueIds: v.valueIds.map((x) => valueMap.get(x)!), sku: null, price: v.price, compareAtPrice: v.compareAtPrice, costPrice: v.costPrice, stock: v.stock, isActive: v.isActive })),
  }, ctx);
}

export async function setProductsVisibility(scope: StoreScope, ids: string[], isVisible: boolean): Promise<Result<{ count: number }>> {
  if (!ids.length) return fail("ما اخترت أي منتج.");
  const rows = await scope.update(t.products, { isVisible }, and(inArray(t.products.id, ids), isNull(t.products.deletedAt)));
  return ok({ count: rows.length });
}

export async function setProductFeatured(scope: StoreScope, id: string, isFeatured: boolean): Promise<Result> {
  const rows = await scope.update(t.products, { isFeatured }, and(eq(t.products.id, id), isNull(t.products.deletedAt)));
  return rows.length ? ok(undefined) : fail("المنتج غير موجود.");
}

/** حذف ناعم: المنتج يختفي من المتجر واللوحة، والطلبيات القديمة تفضل سليمة. */
export async function deleteProducts(scope: StoreScope, ids: string[]): Promise<Result<{ count: number }>> {
  if (!ids.length) return fail("ما اخترت أي منتج.");
  const rows = await scope.update(t.products, { deletedAt: new Date(), isVisible: false, isFeatured: false }, and(inArray(t.products.id, ids), isNull(t.products.deletedAt)));
  return ok({ count: rows.length });
}

// ===== تعديل جماعي =====

export type BulkPriceOp = { mode: "set" | "percent" | "add"; value: number };
export type BulkStockOp = { mode: "set" | "add"; value: number };

export function applyPriceOp(current: number, op: BulkPriceOp): number {
  const next = op.mode === "set" ? op.value : op.mode === "percent" ? current * (1 + op.value / 100) : current + op.value;
  return Math.max(0, Math.round(next));
}

export async function bulkUpdatePrices(scope: StoreScope, ids: string[], op: BulkPriceOp): Promise<Result<{ count: number }>> {
  if (!ids.length) return fail("ما اخترت أي منتج.");
  if (!Number.isFinite(op.value)) return fail("القيمة غير صحيحة.");
  if (op.mode === "set" && op.value < 0) return fail("السعر ما يكونش بالسالب.");
  if (op.mode === "percent" && (op.value < -90 || op.value > 500)) return fail("النسبة لازم تكون بين -90% و 500%.");

  const products = await scope.from(t.products, and(inArray(t.products.id, ids), isNull(t.products.deletedAt)));
  const variants = products.length ? await scope.from(t.productVariants, inArray(t.productVariants.productId, products.map((p) => p.id))) : [];
  await scope.transaction(async (tx) => {
    for (const p of products) {
      const price = applyPriceOp(p.price, op);
      const compare = p.compareAtPrice !== null && op.mode !== "set" ? applyPriceOp(p.compareAtPrice, op) : p.compareAtPrice;
      await tx.update(t.products, { price, compareAtPrice: compare !== null && compare > price ? compare : null }, eq(t.products.id, p.id));
      for (const v of variants.filter((x) => x.productId === p.id && x.price !== null)) {
        // «تحديد سعر» يلغي الأسعار الخاصة بالمتغيرات، والباقي يطبق عليها
        const vp = op.mode === "set" ? null : applyPriceOp(v.price!, op);
        const vc = v.compareAtPrice !== null && op.mode !== "set" ? applyPriceOp(v.compareAtPrice, op) : op.mode === "set" ? null : v.compareAtPrice;
        await tx.update(t.productVariants, { price: vp, compareAtPrice: vc !== null && vc > (vp ?? price) ? vc : null }, eq(t.productVariants.id, v.id));
      }
    }
  });
  return ok({ count: products.length });
}

export async function bulkUpdateStock(scope: StoreScope, ids: string[], op: BulkStockOp, actorUserId?: string): Promise<Result<{ count: number }>> {
  if (!ids.length) return fail("ما اخترت أي منتج.");
  if (!Number.isInteger(op.value)) return fail("المخزون لازم يكون رقم صحيح.");
  if (op.mode === "set" && op.value < 0) return fail("المخزون ما يكونش بالسالب.");
  if (Math.abs(op.value) > 1_000_000) return fail("القيمة كبيرة بزيادة.");

  const products = await scope.from(t.products, and(inArray(t.products.id, ids), isNull(t.products.deletedAt)));
  const variants = products.length ? await scope.from(t.productVariants, inArray(t.productVariants.productId, products.map((p) => p.id))) : [];
  await scope.transaction(async (tx) => {
    for (const v of variants) {
      const next = Math.max(0, op.mode === "set" ? op.value : v.stock + op.value);
      if (next === v.stock) continue;
      await tx.update(t.productVariants, { stock: next }, eq(t.productVariants.id, v.id));
      await logStock(tx, v.id, next - v.stock, "تعديل جماعي", actorUserId);
    }
  });
  return ok({ count: products.length });
}
