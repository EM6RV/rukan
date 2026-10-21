import { canUse } from "@/lib/entitlements";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { stores, type PlanLimits } from "@/db/schema/platform";
import { BASE_TEMPLATE } from "@/lib/plan-limits";
import { BUSINESS_TYPES, STORE_TEMPLATES } from "@/lib/constants";
import { normalizeLibyanPhone } from "@/lib/phone";
import { normalizeSocial } from "@/lib/social";
import { isStoreFont, STORE_FONTS } from "@/lib/store-fonts";
import { validPixelId } from "@/lib/pixels";
import { firstError, hexColorSchema, storeNameSchema } from "@/lib/validation";
import { isFkViolation } from "./db-errors";
import { fail, ok, type Result } from "./catalog/result";
import { forStore, t } from "./tenant";
import { validateOwnMedia } from "./store-service";

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} طويل بزيادة`).nullish().transform((v) => v || null);

// ===== عام: الاسم، النشاط، الهوية =====

const generalSchema = z.object({
  name: storeNameSchema,
  businessType: z.enum(BUSINESS_TYPES, { error: "اختار نوع النشاط" }),
  template: z.enum(STORE_TEMPLATES, { error: "اختار قالب" }),
  primaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  logoMediaId: z.string().min(1).nullish().transform((v) => v ?? null),
});

export async function saveGeneralSettings(db: Db, storeId: string, input: unknown, limits: PlanLimits): Promise<Result> {
  const parsed = generalSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const d = parsed.data;
  if (!canUse(limits, "allTemplates") && d.template !== BASE_TEMPLATE) return fail("هذا القالب ضمن الباقات الأعلى. رقّي باقتك لتستعمله.");
  if (!(await validateOwnMedia(db, storeId, d.logoMediaId))) return fail("ما قدرنا نقرا اللوجو. ارفع صورة JPG أو PNG أو WebP.");

  await db.update(stores).set({ name: d.name, businessType: d.businessType, template: d.template, logoMediaId: d.logoMediaId }).where(eq(stores.id, storeId));
  await forStore(db, storeId).update(t.storeSettings, { primaryColor: d.primaryColor, accentColor: d.accentColor });
  return ok(undefined);
}

// ===== التواصل =====

const phoneField = (label: string) =>
  z.string().trim().nullish().transform((v, ctx) => {
    if (!v) return null;
    const n = normalizeLibyanPhone(v);
    if (!n) { ctx.addIssue({ code: "custom", message: `${label} مش رقم ليبي صحيح` }); return z.NEVER; }
    return n;
  });

const socialField = (label: string) =>
  z.string().nullish().transform((v, ctx) => {
    const n = normalizeSocial(v ?? "");
    if (n === undefined) { ctx.addIssue({ code: "custom", message: `${label}: اكتب اسم المستخدم أو رابط صحيح` }); return z.NEVER; }
    return n;
  });

const contactSchema = z.object({
  contactPhone: phoneField("رقم الهاتف"),
  whatsapp: phoneField("رقم واتساب"),
  email: z.string().trim().nullish().transform((v, ctx) => {
    if (!v) return null;
    if (!z.email().safeParse(v).success) { ctx.addIssue({ code: "custom", message: "البريد الإلكتروني غير صحيح" }); return z.NEVER; }
    return v.slice(0, 120);
  }),
  address: optionalText(200, "العنوان"),
  instagram: socialField("إنستغرام"),
  tiktok: socialField("تيك توك"),
  facebook: socialField("فيسبوك"),
  snapchat: socialField("سناب شات"),
});

export async function saveContactSettings(db: Db, storeId: string, input: unknown): Promise<Result> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  await forStore(db, storeId).update(t.storeSettings, parsed.data);
  return ok(undefined);
}

// ===== الدفع =====

const paymentSchema = z
  .object({
    bankTransfer: z.boolean(),
    bankName: optionalText(60, "اسم المصرف"),
    accountHolder: optionalText(80, "اسم صاحب الحساب"),
    accountNumber: optionalText(60, "رقم الحساب"),
    note: optionalText(200, "الملاحظة"),
  })
  .superRefine((p, ctx) => {
    if (p.bankTransfer && (!p.bankName || !p.accountNumber)) {
      ctx.addIssue({ code: "custom", message: "اكتب اسم المصرف ورقم الحساب لتفعيل التحويل المصرفي" });
    }
  });

export async function savePaymentSettings(db: Db, storeId: string, input: unknown): Promise<Result> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { bankTransfer, ...config } = parsed.data;
  const scope = forStore(db, storeId);
  await scope.update(t.storePaymentMethods, { isEnabled: bankTransfer, config }, eq(t.storePaymentMethods.method, "bank_transfer"));
  await scope.update(t.storePaymentMethods, { isEnabled: true }, eq(t.storePaymentMethods.method, "cod")); // الدفع عند الاستلام دايماً مفعّل
  return ok(undefined);
}

// ===== SEO =====

const seoSchema = z.object({
  seoTitle: optionalText(70, "العنوان"),
  seoDescription: optionalText(160, "الوصف"),
  ogMediaId: z.string().min(1).nullish().transform((v) => v ?? null),
});

export async function saveSeoSettings(db: Db, storeId: string, input: unknown): Promise<Result> {
  const parsed = seoSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  if (!(await validateOwnMedia(db, storeId, parsed.data.ogMediaId))) return fail("ما قدرنا نقرا الصورة. ارفع صورة JPG أو PNG أو WebP.");
  try {
    await forStore(db, storeId).update(t.storeSettings, parsed.data);
  } catch (e) {
    if (isFkViolation(e)) return fail("الصورة غير صحيحة.");
    throw e;
  }
  return ok(undefined);
}

// ===== Pixels (باقات أعلى) =====

const pixelField = (label: string) =>
  z.string().trim().nullish().transform((v, ctx) => {
    if (!v) return null;
    const id = validPixelId(v);
    if (!id) { ctx.addIssue({ code: "custom", message: `${label}: المعرّف أرقام وحروف إنجليزية فقط (5 إلى 25)` }); return z.NEVER; }
    return id;
  });

const pixelSchema = z.object({ metaPixelId: pixelField("Meta Pixel"), tiktokPixelId: pixelField("TikTok Pixel") });

export async function savePixelSettings(db: Db, storeId: string, input: unknown, limits: Pick<PlanLimits, "pixels">): Promise<Result> {
  if (!canUse(limits, "pixels")) return fail("Pixels متاحة في الباقات الأعلى.");
  const parsed = pixelSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  await forStore(db, storeId).update(t.storeSettings, parsed.data);
  return ok(undefined);
}

// ===== التصميم: قالب، ألوان، خط، لوجو =====

const designSchema = z.object({
  template: z.enum(STORE_TEMPLATES, { error: "اختار قالب" }),
  primaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  fontKey: z.enum(STORE_FONTS, { error: "اختار خط من القائمة" }),
  logoMediaId: z.string().min(1).nullish().transform((v) => v ?? null),
});

export async function saveDesignSettings(db: Db, storeId: string, input: unknown, limits: PlanLimits): Promise<Result> {
  const parsed = designSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const d = parsed.data;
  if (!isStoreFont(d.fontKey)) return fail("اختار خط من القائمة");
  if (!canUse(limits, "allTemplates") && d.template !== BASE_TEMPLATE) return fail("هذا القالب ضمن الباقات الأعلى. رقّي باقتك لتستعمله.");
  if (!(await validateOwnMedia(db, storeId, d.logoMediaId))) return fail("ما قدرنا نقرا اللوجو. ارفع صورة JPG أو PNG أو WebP.");
  await db.update(stores).set({ template: d.template, logoMediaId: d.logoMediaId }).where(eq(stores.id, storeId));
  await forStore(db, storeId).update(t.storeSettings, { primaryColor: d.primaryColor, accentColor: d.accentColor, fontKey: d.fontKey });
  return ok(undefined);
}

// ===== المندوبين والكاش (اختياري) =====
const couriersSchema = z.object({ useCouriers: z.boolean({ error: "اختار شغّال أو مقفل" }) });

/** تشغيل/إيقاف المندوبين والكاش للمتجر. الإيقاف يخفي الواجهات فقط: ما يمسح مندوبين ولا حركات كاش قديمة. */
export async function saveCouriersSetting(db: Db, storeId: string, input: unknown): Promise<Result> {
  const p = couriersSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  await db.update(stores).set({ useCouriers: p.data.useCouriers }).where(eq(stores.id, storeId));
  return ok(undefined);
}
