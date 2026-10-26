"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getEnv } from "@/lib/env";
import { addDomain, removeDomain, verifyDomain } from "@/server/domains";
import type { Result } from "@/server/catalog/result";
import { saveDeliveryConfig } from "@/server/delivery-service";
import { saveWhatsappTemplate } from "@/server/orders/whatsapp-templates";
import { saveContactSettings, saveCouriersSetting, saveDesignSettings, saveGeneralSettings, savePaymentSettings, savePixelSettings, saveSeoSettings } from "@/server/settings-service";
import { invalidateStore } from "@/server/storefront/data";
import { auditStore } from "@/server/store-audit";
import { actionContext, type StoreContext } from "@/server/store-context";

async function run(fn: (ctx: StoreContext) => Promise<Result>): Promise<Result> {
  const auth = await actionContext("settings", { write: true });
  if (!auth.ok) return auth;
  const r = await fn(auth.ctx);
  if (r.ok) {
    void auditStore(auth.ctx, "settings.write");
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

export async function saveCouriersSettingAction(input: unknown) {
  return run((c) => saveCouriersSetting(getDb(), c.store.id, input));
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

// ===== الدومين الخاص (المالك فقط: صلاحية billing) =====
async function runOwner<T>(fn: (ctx: StoreContext) => Promise<Result<T>>, touchedDomain: (d: T) => string | null): Promise<Result<T>> {
  const auth = await actionContext("billing", { write: true });
  if (!auth.ok) return auth;
  const r = await fn(auth.ctx);
  if (r.ok) {
    revalidatePath("/dashboard/settings");
    invalidateStore(auth.ctx.store);
    const d = touchedDomain(r.data);
    if (d) invalidateStore({ id: auth.ctx.store.id, slug: d }); // كاش الواجهة بمفتاح الدومين
  }
  return r;
}
const targetHost = () => { const e = getEnv(); return (e.CUSTOM_DOMAIN_TARGET || `cname.${e.ROOT_DOMAIN}`).toLowerCase(); };

export async function addDomainAction(input: unknown) {
  return runOwner((c) => addDomain(getDb(), c.store.id, input, c.limits, getEnv().ROOT_DOMAIN, c.user.id), () => null);
}
export async function verifyDomainAction() {
  return runOwner((c) => verifyDomain(getDb(), c.store.id, targetHost(), c.user.id), (d) => (d.verified ? d.domain : null));
}
export async function removeDomainAction() {
  return runOwner((c) => removeDomain(getDb(), c.store.id, c.user.id), (d) => d.domain);
}
