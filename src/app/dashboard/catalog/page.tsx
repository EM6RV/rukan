import type { Metadata } from "next";
import { listExpiring } from "@/server/catalog/expiry";
import { listBrands, listOptionPresets, listTags } from "@/server/catalog/library";
import { requireStoreContext } from "@/server/store-context";
import { CatalogManager } from "./catalog-manager";

export const metadata: Metadata = { title: "البراندات والخيارات" };

export default async function CatalogPage() {
  const ctx = await requireStoreContext("products");
  const [brands, presets, tags, expiring] = await Promise.all([listBrands(ctx.scope), listOptionPresets(ctx.scope), listTags(ctx.scope), listExpiring(ctx.scope)]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">البراندات والخيارات</h1><p className="text-muted">عرّف البراندات والمقاسات والألوان مرة وحدة، واستعملها في كل المنتجات.</p></div>
      <CatalogManager brands={brands} presets={presets} tags={tags} expiring={expiring} canEdit={ctx.access.writable} />
    </div>
  );
}
