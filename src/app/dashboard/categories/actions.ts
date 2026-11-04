"use server";

import { revalidatePath } from "next/cache";
import { deleteCategory, reorderCategories, saveCategory } from "@/server/catalog/categories";
import type { Result } from "@/server/catalog/result";
import { invalidateStore } from "@/server/storefront/data";
import { auditStore } from "@/server/store-audit";
import { actionContext } from "@/server/store-context";

async function run<T>(fn: (ctx: Extract<Awaited<ReturnType<typeof actionContext>>, { ok: true }>["ctx"]) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext("categories", { write: true });
  if (!auth.ok) return auth;
  const result = await fn(auth.ctx);
  if (result.ok) {
    void auditStore(auth.ctx, "categories.write");
    revalidatePath("/dashboard/categories");
    invalidateStore(auth.ctx.store);
  }
  return result;
}

export async function saveCategoryAction(input: unknown) {
  return run((ctx) => saveCategory(ctx.scope, input));
}
export async function deleteCategoryAction(id: string) {
  return run((ctx) => deleteCategory(ctx.scope, id));
}
export async function reorderCategoriesAction(ids: string[]) {
  return run((ctx) => reorderCategories(ctx.scope, ids));
}
