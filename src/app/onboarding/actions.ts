"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { STORE_BUSINESS_TYPES, STORE_TEMPLATES, type BusinessType } from "@/lib/constants";
import { gymSetupSchema, loungeSetupSchema, marketSetupSchema } from "@/lib/line-setup";
import { OPS_LINES, PRODUCT_LINES, type ProductLine } from "@/lib/product-lines";
import { availableLines, lineLaunch, removeLineDuringOnboarding, saveLineSetup, startLineTrial } from "@/server/lines";
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

const basicsSchema = z.object({
  name: storeNameSchema, slug: slugSchema,
  lines: z.array(z.enum(PRODUCT_LINES)).min(1, "اختار نوع نشاط واحد على الأقل").max(PRODUCT_LINES.length).default(["store"]),
});

/**
 * خطوة الاسم والرابط: ينشئ النشاط أول مرة بالمنظومات اللي اختارها (تجربة لكل وحدة)، وبعدها يعدّل الاسم والرابط
 * والمنظومات (قبل ما يخلص المعالج بس).
 */
export async function saveBasicsAction(input: unknown): Promise<Result<{ slug: string }>> {
  const user = await getCurrentUser();
  if (!user) return NOT_LOGGED;
  const parsed = basicsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const db = getDb();
  const ctx = await loadStoreContext();
  const allowed = availableLines(await lineLaunch(db), ctx?.store.lineBeta ?? []);
  const lines = [...new Set(parsed.data.lines)];
  if (lines.some((l) => !allowed.includes(l))) return { ok: false, error: "فيه منظومة لسه قريباً. اختار من المتاحة." };

  if (ctx) {
    if (ctx.store.onboardedAt) return { ok: false, error: "متجرك جاهز بالفعل." };
    const r = await saveStoreBasics(db, ctx.store.id, parsed.data);
    if (!r.ok) return r;
    // تعديل المنظومات أثناء المعالج: نزيد الجديدة (تجربة) ونشيلوا اللي ما عادش يبيها
    for (const l of PRODUCT_LINES) {
      const had = ctx.lines[l].subscribed, want = lines.includes(l);
      if (want && !had) { const a = await startLineTrial(db, ctx.store.id, l, { available: allowed }); if (!a.ok) return a; }
      if (!want && had) await removeLineDuringOnboarding(db, ctx.store.id, l);
    }
    return { ok: true, data: { slug: parsed.data.slug } };
  }
  const limit = await hitRateLimit(db, `create-store:user:${user.id}`, { limit: 5, windowMs: 60 * 60_000 });
  if (!limit.allowed) return { ok: false, error: "محاولات كثيرة. استنى شوية وجرّب مرة ثانية." };
  const r = await createStoreForUser(db, { userId: user.id, name: parsed.data.name, slug: parsed.data.slug, lines });
  return r.ok ? { ok: true, data: { slug: parsed.data.slug } } : r;
}

const setupSchemas = { market: marketSetupSchema, lounge: loungeSetupSchema, gym: gymSetupSchema } as const;

/** المعالج القصير لمنظومة (ماركت/بلاي/فِت): يحفظ الإجابات والمراحل الجاية تستعملها للتجهيز */
export async function saveLineSetupAction(line: unknown, input: unknown): Promise<Result> {
  const auth = await actionContext("settings", { write: true, allowUnfinishedOnboarding: true });
  if (!auth.ok) return auth;
  const l = z.enum(OPS_LINES).safeParse(line);
  if (!l.success) return { ok: false, error: "منظومة مش معروفة." };
  if (!auth.ctx.lines[l.data].subscribed) return { ok: false, error: "ارجع للخطوة الأولى واختار المنظومة." };
  const parsed = setupSchemas[l.data].safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return saveLineSetup(getDb(), auth.ctx.store.id, l.data as ProductLine, { done: true, [l.data]: parsed.data });
}

export async function saveTypeAction(type: string): Promise<Result<{ template: string; primary: string; accent: string }>> {
  const auth = await actionContext("settings", { write: true, allowUnfinishedOnboarding: true });
  if (!auth.ok) return auth;
  if (!(STORE_BUSINESS_TYPES as readonly string[]).includes(type)) return { ok: false, error: "اختار نوع النشاط." };
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
