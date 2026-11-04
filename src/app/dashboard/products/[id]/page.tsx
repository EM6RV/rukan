import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listCategories } from "@/server/catalog/categories";
import { loadEditorLookups } from "@/server/catalog/editor-data";
import { getProductForEdit } from "@/server/catalog/products";
import { requireStoreContext } from "@/server/store-context";
import { ProductEditor } from "../product-editor";

export const metadata: Metadata = { title: "تعديل المنتج" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireStoreContext("products");
  const [product, categories, lookups] = await Promise.all([getProductForEdit(ctx.scope, id), listCategories(ctx.scope), loadEditorLookups(ctx.scope, ctx.limits, id)]);
  if (!product) notFound();
  return (
    <ProductEditor key={`${product.id}-${product.variants.map((v) => v.id).join()}`} initial={product} writable={ctx.access.writable} quotaBlocked={false} lookups={lookups}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
  );
}
