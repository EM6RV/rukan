// جدول التعديل السريع (زي الإكسل) للأسعار والمخزون + التصدير.
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { firstError } from "@/lib/validation";
import { variantPrice } from "@/lib/pricing";
import { variantLabels } from "../storefront/queries";
import { t, type StoreScope } from "../tenant";
import { fail, ok, type Result } from "./result";

export type GridRow = {
  variantId: string; productId: string; name: string; label: string | null; sku: string | null;
  price: number; cost: number | null; stock: number; expiresAt: number | null; isBundle: boolean; singleVariant: boolean;
};

export async function listGridRows(scope: StoreScope, opts: { q?: string; limit?: number } = {}): Promise<GridRow[]> {
  const products = await scope.from(t.products, isNull(t.products.deletedAt)).orderBy(desc(t.products.createdAt)).limit(opts.limit ?? 500);
  const q = opts.q?.trim().toLowerCase();
  const shown = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  if (!shown.length) return [];
  const variants = await scope.from(t.productVariants, inArray(t.productVariants.productId, shown.map((p) => p.id))).orderBy(t.productVariants.position);
  const labels = await variantLabels(scope, variants.map((v) => v.id));
  const count = new Map<string, number>();
  for (const v of variants) count.set(v.productId, (count.get(v.productId) ?? 0) + 1);
  return shown.flatMap((p) => variants.filter((v) => v.productId === p.id).map((v) => ({
    variantId: v.id, productId: p.id, name: p.name, label: labels.get(v.id) ?? null, sku: v.sku, price: variantPrice(p, v),
    cost: v.costPrice ?? p.costPrice, stock: v.stock, expiresAt: v.expiresAt?.getTime() ?? null, isBundle: p.kind === "bundle", singleVariant: count.get(p.id) === 1,
  })));
}

const rowSchema = z.object({
  variantId: z.string().min(1),
  price: z.number().int().min(0, "السعر 0 أو أكثر").max(1_000_000_000),
  stock: z.number().int("المخزون رقم صحيح").min(0, "المخزون ما يكونش بالسالب").max(1_000_000),
  cost: z.number().int().min(0).max(1_000_000_000).nullable(),
  expiresAt: z.number().int().positive().nullable(),
});
const MAX_ROWS = 300;

/** يحفظ الصفوف المعدلة فقط. سعر متغير وحيد = سعر المنتج، ومتغير ضمن خيارات = سعر خاص بالمتغير. */
export async function saveGridRows(scope: StoreScope, input: unknown, actorUserId?: string): Promise<Result<{ updated: number }>> {
  const p = z.array(rowSchema).min(1, "ما فيه تعديلات للحفظ.").max(MAX_ROWS, `الحد الأقصى ${MAX_ROWS} صف في المرة.`).safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const variants = await scope.from(t.productVariants, inArray(t.productVariants.id, p.data.map((r) => r.variantId)));
  if (variants.length !== p.data.length) return fail("أحد الصفوف غير صحيح. حدّث الصفحة وجرّب.");
  const products = await scope.from(t.products, and(inArray(t.products.id, [...new Set(variants.map((v) => v.productId))]), isNull(t.products.deletedAt))!);
  const pById = new Map(products.map((x) => [x.id, x]));
  const siblings = await scope.from(t.productVariants, inArray(t.productVariants.productId, products.map((x) => x.id)));
  let updated = 0;
  await scope.transaction(async (tx) => {
    for (const r of p.data) {
      const v = variants.find((x) => x.id === r.variantId)!;
      const prod = pById.get(v.productId);
      if (!prod) continue;
      const single = siblings.filter((s) => s.productId === prod.id).length === 1;
      const stock = prod.kind === "bundle" ? v.stock : r.stock;
      if (single) {
        if (r.price !== prod.price) await tx.update(t.products, { price: r.price, compareAtPrice: prod.compareAtPrice !== null && prod.compareAtPrice > r.price ? prod.compareAtPrice : null }, eq(t.products.id, prod.id));
      } else {
        const eff = variantPrice(prod, v);
        if (r.price !== eff) await tx.update(t.productVariants, { price: r.price === prod.price ? null : r.price }, eq(t.productVariants.id, v.id));
      }
      await tx.update(t.productVariants, { costPrice: r.cost, expiresAt: r.expiresAt ? new Date(r.expiresAt) : null, stock }, eq(t.productVariants.id, v.id));
      if (stock !== v.stock) await tx.insert(t.stockMovements, { variantId: v.id, delta: stock - v.stock, reason: "manual", note: "جدول التعديل السريع", actorUserId: actorUserId ?? null });
      updated++;
    }
  });
  return ok({ updated });
}
