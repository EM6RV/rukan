import { and, eq, isNull } from "drizzle-orm";
import type { PlanLimits } from "@/db/schema/platform";
import { canUse } from "@/lib/entitlements";
import { t, type StoreScope } from "../tenant";
import { listBrands, listOptionPresets } from "./library";
import { variantLabels } from "../storefront/queries";

export type EditorLookups = {
  brands: { id: string; name: string }[];
  presets: { id: string; name: string; values: { value: string; colorHex: string | null }[] }[];
  /** متغيرات تصلح مكونات لباقة مجمعة (منتجات عادية فعّالة) */
  components: { variantId: string; label: string }[];
  canBundle: boolean;
};

export async function loadEditorLookups(scope: StoreScope, limits: PlanLimits, excludeProductId?: string): Promise<EditorLookups> {
  const [brands, presets, products, variants] = await Promise.all([
    listBrands(scope), listOptionPresets(scope),
    scope.from(t.products, and(isNull(t.products.deletedAt), eq(t.products.kind, "simple"))!).orderBy(t.products.name),
    scope.from(t.productVariants, eq(t.productVariants.isActive, true)),
  ]);
  const pName = new Map(products.filter((p) => p.id !== excludeProductId).map((p) => [p.id, p.name]));
  const mine = variants.filter((v) => pName.has(v.productId));
  const labels = await variantLabels(scope, mine.map((v) => v.id));
  return {
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
    presets,
    components: mine.map((v) => ({ variantId: v.id, label: `${pName.get(v.productId)}${labels.get(v.id) ? ` — ${labels.get(v.id)}` : ""}` })),
    canBundle: canUse(limits, "bundles"),
  };
}
