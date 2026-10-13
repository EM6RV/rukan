"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import type { Result } from "@/server/catalog/result";
import { deletePage, reorderPages, saveHomeSections, savePage, saveStoreTexts } from "@/server/content-service";
import { invalidateStore } from "@/server/storefront/data";
import { actionContext, type StoreContext } from "@/server/store-context";

async function run<T>(fn: (ctx: StoreContext) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext("settings", { write: true });
  if (!auth.ok) return auth;
  const r = await fn(auth.ctx);
  if (r.ok) {
    revalidatePath("/dashboard/content");
    revalidatePath("/dashboard/design");
    invalidateStore(auth.ctx.store);
  }
  return r;
}

export async function saveTextsAction(input: unknown) {
  return run((c) => saveStoreTexts(c.scope, input));
}
export async function savePageAction(input: unknown) {
  return run((c) => savePage(c.scope, input));
}
export async function deletePageAction(id: unknown) {
  if (typeof id !== "string" || !id) return { ok: false as const, error: "البيانات غير صحيحة." };
  return run((c) => deletePage(c.scope, id));
}
export async function reorderPagesAction(ids: unknown) {
  const p = z.array(z.string().min(1)).max(100).safeParse(ids);
  if (!p.success) return { ok: false as const, error: "البيانات غير صحيحة." };
  return run((c) => reorderPages(c.scope, p.data));
}
export async function saveSectionsAction(list: unknown) {
  return run((c) => saveHomeSections(getDb(), c.store.id, list));
}
