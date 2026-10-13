"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { BUSINESS_TYPES, STORE_TEMPLATES, type BusinessType } from "@/lib/constants";
import { dinarAmountSchema, firstError, hexColorSchema, slugSchema, storeNameSchema } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth/current";
import { hitRateLimit } from "@/server/ratelimit";
import { invalidateStore } from "@/server/storefront/data";
import { actionContext } from "@/server/store-context";
import {
  checkSlugAvailable, completeOnboarding, createStoreForUser, saveBusinessType, saveDelivery, saveIdentity, saveStoreBasics, type Result,
} from "@/server/store-service";
import { loadStoreContext } from "@/server/store-context";

const NOT_LOGGED = { ok: false as const, error: "انتهت الجلسة. سجّل دخولك من جديد." };

export async function checkSlugAction(slug: string): Promise<Result<string>> {
  const user = await getCurrentUser();
  if (!user) return NOT_LOGGED;
  const db = getDb();
  const limit = await hitRateLimit(db, `slug-check:user:${user.id}`, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, error: "محاولات كثيرة. استنى شوية وجرّب مرة ثانية." };
  const ctx = await loadStoreContext();
  return checkSlugAvailable(db, slug, ctx?.store.id);
}

const basicsSchema = z.object({ name: storeNameSchema, slug: slugSchema });

/** الخطوة 2: ينشئ المتجر أول مرة، وبعدها يعدّل الاسم والرابط. */
export async function saveBasicsAction(input: unknown): Promise<Result<{ slug: string }>> {
  const user = await getCurrentUser();
  if (!user) return NOT_LOGGED;
  const parsed = basicsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const db = getDb();

  const ctx = await loadStoreContext();
  if (ctx) {
    if (ctx.store.onboardedAt) return { ok: false, error: "متجرك جاهز بالفعل." };
    const r = await saveStoreBasics(db, ctx.store.id, parsed.data);
    return r.ok ? { ok: true, data: { slug: parsed.data.slug } } : r;
  }
  const limit = await hitRateLimit(db, `create-store:user:${user.id}`, { limit: 5, windowMs: 60 * 60_000 });
  if (!limit.allowed) return { ok: false, error: "محاولات كثيرة. استنى شوية وجرّب مرة ثانية." };
  const r = await createStoreForUser(db, { userId: user.id, ...parsed.data });
  return r.ok ? { ok: true, data: { slug: parsed.data.slug } } : r;
}

export async function saveTypeAction(type: string): Promise<Result<{ template: string; primary: string; accent: string }>> {
  const auth = await actionContext("settings", { write: true, allowUnfinishedOnboarding: true });
  if (!auth.ok) return auth;
  if (!BUSINESS_TYPES.includes(type as BusinessType)) return { ok: false, error: "اختار نوع النشاط." };
  return saveBusinessType(getDb(), auth.ctx.store.id, type as BusinessType, auth.ctx.limits);
}

const identitySchema = z.object({
  template: z.enum(STORE_TEMPLATES, { error: "اختار قالب" }),
  primaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  logoMediaId: z.string().min(1).nullable(),
});

export async function saveIdentityAction(input: unknown): Promise<Result> {
  const auth = await actionContext("settings", { write: true, allowUnfinishedOnboarding: true });
  if (!auth.ok) return auth;
  const parsed = identitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return saveIdentity(getDb(), auth.ctx.store.id, parsed.data, auth.ctx.limits);
}

const deliverySchema = z.object({
  cityId: z.string().min(1, "اختار مدينتك"),
  feeInCity: dinarAmountSchema({ max: 500, label: "سعر التوصيل داخل المدينة" }),
  feeOther: dinarAmountSchema({ max: 500, label: "سعر التوصيل لباقي المدن" }),
  freeDeliveryOver: dinarAmountSchema({ min: 1, max: 100_000, label: "حد التوصيل المجاني" }).nullable(),
  bankTransfer: z.boolean(),
  bankName: z.string().trim().max(60, "اسم المصرف طويل").nullish(),
  accountNumber: z.string().trim().max(60, "رقم الحساب طويل").nullish(),
  accountHolder: z.string().trim().max(80, "اسم صاحب الحساب طويل").nullish(),
});

export async function saveDeliveryAction(input: unknown): Promise<Result> {
  const auth = await actionContext("settings", { write: true, allowUnfinishedOnboarding: true });
  if (!auth.ok) return auth;
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return saveDelivery(getDb(), auth.ctx.store.id, parsed.data);
}

export async function finishOnboardingAction(): Promise<Result> {
  const auth = await actionContext("settings", { write: true, allowUnfinishedOnboarding: true });
  if (!auth.ok) return auth;
  const r = await completeOnboarding(getDb(), auth.ctx.store.id);
  if (r.ok) invalidateStore(auth.ctx.store);
  return r;
}
