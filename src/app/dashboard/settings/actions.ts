"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import type { Result } from "@/server/catalog/result";
import { saveContactSettings, saveGeneralSettings, savePaymentSettings, saveSeoSettings } from "@/server/settings-service";
import { invalidateStore } from "@/server/storefront/data";
import { actionContext, type StoreContext } from "@/server/store-context";

async function run(fn: (ctx: StoreContext) => Promise<Result>): Promise<Result> {
  const auth = await actionContext("settings", { write: true });
  if (!auth.ok) return auth;
  const r = await fn(auth.ctx);
  if (r.ok) {
    revalidatePath("/dashboard", "layout");
    invalidateStore(auth.ctx.store);
  }
  return r;
}

export async function saveGeneralAction(input: unknown) {
  return run((c) => saveGeneralSettings(getDb(), c.store.id, input, c.limits));
}
export async function saveContactAction(input: unknown) {
  return run((c) => saveContactSettings(getDb(), c.store.id, input));
}
export async function savePaymentAction(input: unknown) {
  return run((c) => savePaymentSettings(getDb(), c.store.id, input));
}
export async function saveSeoAction(input: unknown) {
  return run((c) => saveSeoSettings(getDb(), c.store.id, input));
}
