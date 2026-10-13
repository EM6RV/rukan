"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import type { Result } from "@/server/catalog/result";
import { saveDeliveryConfig } from "@/server/delivery-service";
import { saveWhatsappTemplate } from "@/server/orders/whatsapp-templates";
import { saveContactSettings, saveDesignSettings, saveGeneralSettings, savePaymentSettings, savePixelSettings, saveSeoSettings } from "@/server/settings-service";
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

export async function saveDeliveryAction(input: unknown) {
  return run((c) => saveDeliveryConfig(getDb(), c.store.id, input));
}
export async function saveWhatsappTemplateAction(input: unknown) {
  return run((c) => saveWhatsappTemplate(c.scope, input));
}

export async function savePixelAction(input: unknown) {
  return run((c) => savePixelSettings(getDb(), c.store.id, input, c.limits));
}

export async function saveDesignAction(input: unknown) {
  return run((c) => saveDesignSettings(getDb(), c.store.id, input, c.limits));
}
