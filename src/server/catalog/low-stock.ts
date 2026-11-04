import { and, eq, isNull, sql } from "drizzle-orm";
import { variantLabels } from "../storefront/queries";
import { t, type StoreScope } from "../tenant";

/** حد «قرب يخلص» الافتراضي لو المتغير ما عندوش حد خاص */
export const DEFAULT_MIN_STOCK = 5;

/** شرط SQL: متغير فعّال مخزونه <= حده (الباقات المجمعة مستثناة: مخزونها من مكوناتها) */
export const lowStockCondition = () =>
  and(eq(t.productVariants.isActive, true), sql`${t.productVariants.stock} <= coalesce(${t.productVariants.minStock}, ${DEFAULT_MIN_STOCK})`)!;

export type LowStockItem = { variantId: string; productId: string; name: string; label: string | null; stock: number; min: number };

export async function listLowStock(scope: StoreScope): Promise<LowStockItem[]> {
  const variants = await scope.from(t.productVariants, lowStockCondition());
  if (!variants.length) return [];
  const products = await scope.from(t.products, isNull(t.products.deletedAt));
  const byId = new Map(products.filter((p) => p.kind === "simple").map((p) => [p.id, p]));
  const labels = await variantLabels(scope, variants.map((v) => v.id));
  return variants.filter((v) => byId.has(v.productId)).map((v) => ({
    variantId: v.id, productId: v.productId, name: byId.get(v.productId)!.name, label: labels.get(v.id) ?? null, stock: v.stock, min: v.minStock ?? DEFAULT_MIN_STOCK,
  })).sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
}
