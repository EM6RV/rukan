import { and, eq, isNotNull, lte } from "drizzle-orm";
import { t, type StoreScope } from "../tenant";
import { variantLabels } from "../storefront/queries";

export const EXPIRY_WARN_DAYS = 30;
export type ExpiringItem = { variantId: string; productId: string; name: string; label: string | null; stock: number; expiresAt: number; daysLeft: number };

/** متغيرات فيها مخزون وتنتهي خلال المدة (أو انتهت). الأقرب أول. */
export async function listExpiring(scope: StoreScope, days = EXPIRY_WARN_DAYS, now = Date.now()): Promise<ExpiringItem[]> {
  const limit = new Date(now + days * 86_400_000);
  const vs = await scope.from(t.productVariants, and(isNotNull(t.productVariants.expiresAt), lte(t.productVariants.expiresAt, limit), eq(t.productVariants.isActive, true))!).orderBy(t.productVariants.expiresAt);
  const withStock = vs.filter((v) => v.stock > 0);
  if (!withStock.length) return [];
  const products = await scope.from(t.products);
  const names = new Map(products.filter((p) => !p.deletedAt).map((p) => [p.id, p.name]));
  const labels = await variantLabels(scope, withStock.map((v) => v.id));
  return withStock.filter((v) => names.has(v.productId)).map((v) => ({
    variantId: v.id, productId: v.productId, name: names.get(v.productId)!, label: labels.get(v.id) ?? null, stock: v.stock,
    expiresAt: v.expiresAt!.getTime(), daysLeft: Math.ceil((v.expiresAt!.getTime() - now) / 86_400_000),
  }));
}
