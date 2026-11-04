// الباقات المجمعة: مخزون الباقة يتحسب من مكوناتها (min(floor(مخزون المكون / كميته))) ولا يتخزن.
import { and, eq, inArray } from "drizzle-orm";
import { t, type StoreScope } from "../tenant";

/** متاح كم باقة لكل منتج-باقة (0 لو مكون ناقص أو معطّل) */
export async function bundleAvailability(scope: Pick<StoreScope, "from">, bundleProductIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!bundleProductIds.length) return out;
  const items = await scope.from(t.bundleItems, inArray(t.bundleItems.bundleProductId, bundleProductIds));
  const comps = items.length ? await scope.from(t.productVariants, inArray(t.productVariants.id, items.map((i) => i.variantId))) : [];
  const byId = new Map(comps.map((c) => [c.id, c]));
  for (const id of bundleProductIds) {
    const mine = items.filter((i) => i.bundleProductId === id);
    if (!mine.length) { out.set(id, 0); continue; }
    out.set(id, Math.min(...mine.map((i) => { const c = byId.get(i.variantId); return c && c.isActive ? Math.floor(c.stock / i.quantity) : 0; })));
  }
  return out;
}

/** يطبّق مخزون الباقات المحسوب على متغيراتها (تقرا بس) */
export async function withBundleStock<V extends { productId: string; stock: number }>(scope: Pick<StoreScope, "from">, products: { id: string; kind: "simple" | "bundle" }[], variants: V[]): Promise<V[]> {
  const bundles = products.filter((p) => p.kind === "bundle").map((p) => p.id);
  if (!bundles.length) return variants;
  const avail = await bundleAvailability(scope, bundles);
  return variants.map((v) => (avail.has(v.productId) ? { ...v, stock: avail.get(v.productId)! } : v));
}

/** تفكيك سطر مخزون: متغير عادي = نفسه، باقة = مكوناتها × الكمية */
export async function expandStockLines(scope: Pick<StoreScope, "from">, variantId: string, quantity: number): Promise<{ variantId: string; quantity: number; viaBundle: boolean }[]> {
  const [v] = await scope.from(t.productVariants, eq(t.productVariants.id, variantId)).limit(1);
  if (!v) return [{ variantId, quantity, viaBundle: false }];
  const [p] = await scope.from(t.products, eq(t.products.id, v.productId)).limit(1);
  if (!p || p.kind !== "bundle") return [{ variantId, quantity, viaBundle: false }];
  const items = await scope.from(t.bundleItems, and(eq(t.bundleItems.bundleProductId, p.id))!);
  return items.map((i) => ({ variantId: i.variantId, quantity: i.quantity * quantity, viaBundle: true }));
}
