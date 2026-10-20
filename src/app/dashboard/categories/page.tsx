import type { Metadata } from "next";
import { listCategories } from "@/server/catalog/categories";
import { requireStoreContext } from "@/server/store-context";
import { CategoryManager } from "./category-manager";

export const metadata: Metadata = { title: "الأقسام" };

export default async function CategoriesPage() {
  const ctx = await requireStoreContext("categories");
  const categories = await listCategories(ctx.scope);
  return (
    <CategoryManager
      writable={ctx.access.writable}
      initial={categories.map((c) => ({
        id: c.id, name: c.name, description: c.description, isVisible: c.isVisible, productCount: c.productCount,
        image: c.imageMediaId ? { id: c.imageMediaId, url: `/api/media/${c.imageMediaId}?w=320` } : null,
      }))}
    />
  );
}
