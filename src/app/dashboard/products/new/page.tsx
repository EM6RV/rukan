import type { Metadata } from "next";
import { listCategories } from "@/server/catalog/categories";
import { productQuota } from "@/server/catalog/products";
import { requireStoreContext } from "@/server/store-context";
import { ProductEditor } from "../product-editor";

export const metadata: Metadata = { title: "منتج جديد" };

export default async function NewProductPage() {
  const ctx = await requireStoreContext("products");
  const [categories, quota] = await Promise.all([listCategories(ctx.scope), productQuota(ctx.scope, ctx.limits)]);
  return (
    <ProductEditor initial={null} writable={ctx.access.writable} quotaBlocked={quota.remaining === 0}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
  );
}
