import { canUse } from "@/lib/entitlements";
import { and, eq, sql } from "drizzle-orm";
import { writeTransaction, type Db } from "@/db";
import { cities, lineSubscriptions, media, plans, storeMembers, stores, type PlanLimits } from "@/db/schema/platform";
import { BUSINESS_PRESETS } from "@/lib/business-presets";
import { BASE_TEMPLATE } from "@/lib/plan-limits";
import type { BusinessType, StoreTemplate } from "@/lib/constants";
import { LINE_INFO, type ProductLine } from "@/lib/product-lines";
import { lineTrialDays, lineTrialPlan, syncStoreColumns } from "./lines";
import { DEFAULT_FOOTER_TEXT, DEFAULT_THANKS_MESSAGE, defaultHomeSections, defaultPages } from "@/lib/store-defaults";
import { DEFAULT_WHATSAPP_TEMPLATES } from "@/lib/whatsapp-defaults";
import { firstError, slugSchema, storeNameSchema } from "@/lib/validation";
import { isUniqueViolation } from "./db-errors";
import { getPlatformSetting } from "./platform-settings";
import { forStore, t } from "./tenant";

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const DAY = 86_400_000;


// ===== الرابط =====

export async function checkSlugAvailable(db: Db, rawSlug: string, excludeStoreId?: string): Promise<Result<string>> {
  const parsed = slugSchema.safeParse(rawSlug);
  if (!parsed.success) return fail(firstError(parsed.error));
  const existing = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, parsed.data)).get();
  if (existing && existing.id !== excludeStoreId) return fail("هذا الرابط مستعمل، جرّب اسم ثاني.");
  return { ok: true, data: parsed.data };
}

// ===== الإنشاء =====

/**
 * ينشئ النشاط (صف stores) مع اشتراك تجريبي لكل منظومة اختارها (افتراضياً المتجر الأونلاين بس).
 * المتجر: تجربة مجانية، أو الباقة المجانية للأبد لو الأدمن أطلقها واختارها.
 */
export async function createStoreForUser(db: Db, input: { userId: string; name: string; slug: string; lines?: ProductLine[] }): Promise<Result<{ storeId: string }>> {
  const name = storeNameSchema.safeParse(input.name);
  if (!name.success) return fail(firstError(name.error));
  const slug = await checkSlugAvailable(db, input.slug);
  if (!slug.ok) return slug;
  const lines = [...new Set(input.lines?.length ? input.lines : (["store"] as ProductLine[]))];

  const already = await db.select({ id: storeMembers.id }).from(storeMembers).where(eq(storeMembers.userId, input.userId)).get();
  if (already) return fail("عندك متجر بالفعل.");

  const now = Date.now();
  const subs: (typeof lineSubscriptions.$inferInsert)[] = [];
  for (const line of lines) {
    if (line === "store") {
      const freeStart = (await getPlatformSetting<boolean>(db, "free_plan_enabled", false)) && (await getPlatformSetting<string>(db, "start_mode", "trial")) === "free";
      const freePlan = freeStart ? await db.select({ id: plans.id }).from(plans).where(and(eq(plans.isFree, true), eq(plans.isActive, true), eq(plans.line, "store"))).get() : undefined;
      if (freePlan) { subs.push({ storeId: "", line, planId: freePlan.id, status: "active", trialEndsAt: null }); continue; }
    }
    const plan = await lineTrialPlan(db, line);
    subs.push({ storeId: "", line, planId: plan?.id ?? null, status: "trial", trialEndsAt: new Date(now + (await lineTrialDays(db, line)) * DAY) });
  }
  // نوع النشاط المبدئي: من المنظومة الأساسية لو ما فيش متجر أونلاين (المتجر يختار نوعه في المعالج)
  const firstOps = lines.find((l) => l !== "store");
  const businessType: BusinessType = lines.includes("store") || !firstOps ? "other" : LINE_INFO[firstOps].businessType;

  try {
    return await writeTransaction(db, async (tx) => {
      const db2 = tx as unknown as Db;
      const [store] = await db2
        .insert(stores)
        .values({
          slug: slug.data,
          name: name.data,
          ownerUserId: input.userId,
          businessType,
          template: BASE_TEMPLATE, // القالب الافتراضي للمتجر الجديد (المعالج يقترح غيره حسب النشاط)
          onboardingStep: 2,
        })
        .returning({ id: stores.id });
      const storeId = store!.id;
      await db2.insert(storeMembers).values({ storeId, userId: input.userId, role: "owner" });
      await db2.insert(lineSubscriptions).values(subs.map((x) => ({ ...x, storeId })));
      await syncStoreColumns(db2, storeId);

      const s = forStore(db2, storeId);
      await s.insert(t.storeSettings, { thanksMessage: DEFAULT_THANKS_MESSAGE, footerText: DEFAULT_FOOTER_TEXT });
      await s.insert(t.storePages, defaultPages(name.data));
      await s.insert(t.storeHomeSections, defaultHomeSections());
      await s.insert(t.storePaymentMethods, [
        { method: "cod", isEnabled: true, sortOrder: 0 },
        { method: "bank_transfer", isEnabled: false, sortOrder: 1 },
      ]);
      await s.insert(
        t.whatsappTemplates,
        Object.entries(DEFAULT_WHATSAPP_TEMPLATES).map(([key, body]) => ({ key, body })),
      );
      return { ok: true as const, data: { storeId } };
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("هذا الرابط مستعمل، جرّب اسم ثاني.");
    throw e;
  }
}

async function bumpStep(db: Db, storeId: string, step: number, extra: Partial<typeof stores.$inferInsert> = {}) {
  await db
    .update(stores)
    .set({ ...extra, onboardingStep: sql`max(${stores.onboardingStep}, ${step})` })
    .where(eq(stores.id, storeId));
}

// ===== خطوات المعالج =====

export async function saveStoreBasics(db: Db, storeId: string, input: { name: string; slug: string }): Promise<Result> {
  const name = storeNameSchema.safeParse(input.name);
  if (!name.success) return fail(firstError(name.error));
  const slug = await checkSlugAvailable(db, input.slug, storeId);
  if (!slug.ok) return slug;
  try {
    await bumpStep(db, storeId, 2, { name: name.data, slug: slug.data });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("هذا الرابط مستعمل، جرّب اسم ثاني.");
    throw e;
  }
  return { ok: true, data: undefined };
}

/** يحفظ نوع النشاط ويطبق القالب والألوان المقترحة (البياع يعدلهم في الخطوة الجاية). */
export async function saveBusinessType(db: Db, storeId: string, type: BusinessType, limits: PlanLimits): Promise<Result<{ template: StoreTemplate; primary: string; accent: string }>> {
  const preset = BUSINESS_PRESETS[type];
  if (!preset) return fail("نوع النشاط غير صحيح.");
  const template = canUse(limits, "allTemplates") ? preset.template : BASE_TEMPLATE;
  await bumpStep(db, storeId, 3, { businessType: type, template });
  await forStore(db, storeId).update(t.storeSettings, { primaryColor: preset.palette.primary, accentColor: preset.palette.accent });
  return { ok: true, data: { template, primary: preset.palette.primary, accent: preset.palette.accent } };
}

export async function validateOwnMedia(db: Db, storeId: string, mediaId: string | null): Promise<boolean> {
  if (!mediaId) return true;
  const row = await db.select({ id: media.id }).from(media).where(and(eq(media.id, mediaId), eq(media.storeId, storeId))).get();
  return !!row;
}

export async function saveIdentity(
  db: Db,
  storeId: string,
  input: { template: StoreTemplate; primaryColor: string; accentColor: string; logoMediaId: string | null },
  limits: PlanLimits,
): Promise<Result> {
  if (!canUse(limits, "allTemplates") && input.template !== BASE_TEMPLATE) return fail("هذا القالب ضمن الباقات الأعلى. رقّي باقتك لتستعمله.");
  if (!(await validateOwnMedia(db, storeId, input.logoMediaId))) return fail("ما قدرنا نقرا اللوجو. ارفع صورة JPG أو PNG أو WebP.");
  await bumpStep(db, storeId, 4, { template: input.template, logoMediaId: input.logoMediaId });
  await forStore(db, storeId).update(t.storeSettings, { primaryColor: input.primaryColor, accentColor: input.accentColor });
  return { ok: true, data: undefined };
}

export async function saveDelivery(
  db: Db,
  storeId: string,
  input: {
    cityId: string; feeInCity: number; feeOther: number; freeDeliveryOver: number | null;
    bankTransfer: boolean; bankName?: string | null; accountNumber?: string | null; accountHolder?: string | null;
  },
): Promise<Result> {
  if (input.bankTransfer && (!input.bankName?.trim() || !input.accountNumber?.trim())) {
    return fail("اكتب اسم المصرف ورقم الحساب لتفعيل التحويل المصرفي.");
  }
  const city = await db.select({ id: cities.id }).from(cities).where(eq(cities.id, input.cityId)).get();
  if (!city) return fail("اختار مدينتك.");
  const allCities = await db.select({ id: cities.id }).from(cities);

  await writeTransaction(db, async (tx) => {
    const s = forStore(tx as unknown as Db, storeId);
    await s.delete(t.deliveryRates);
    await s.insert(
      t.deliveryRates,
      allCities.map((c) => ({ cityId: c.id, fee: c.id === input.cityId ? input.feeInCity : input.feeOther })),
    );
    await s.update(t.storeSettings, { cityId: input.cityId, freeDeliveryOver: input.freeDeliveryOver });
    await s.update(
      t.storePaymentMethods,
      {
        isEnabled: input.bankTransfer,
        config: input.bankTransfer
          ? { bankName: input.bankName!.trim(), accountNumber: input.accountNumber!.trim(), accountHolder: input.accountHolder?.trim() || null }
          : {},
      },
      eq(t.storePaymentMethods.method, "bank_transfer"),
    );
  });
  await bumpStep(db, storeId, 5);
  return { ok: true, data: undefined };
}

/** إنهاء المعالج: كل منظومة مشترك فيها خلصت خطواتها (المتجر: النوع والهوية والتوصيل، والباقي: المعالج القصير) */
export async function completeOnboarding(db: Db, storeId: string): Promise<Result> {
  const store = await db.select().from(stores).where(eq(stores.id, storeId)).get();
  if (!store) return fail("ما لقينا المتجر. يمكن انحذف، حدّث الصفحة.");
  const subs = await db.select({ line: lineSubscriptions.line, setup: lineSubscriptions.setup }).from(lineSubscriptions).where(eq(lineSubscriptions.storeId, storeId));
  const hasStore = !subs.length || subs.some((x) => x.line === "store"); // نشاط قديم بدون سطور = متجر
  if (hasStore && store.onboardingStep < 5) return fail("كمّل الخطوات اللي قبل.");
  const pending = subs.find((x) => x.line !== "store" && !x.setup.done);
  if (pending) return fail(`كمّل إعداد ${LINE_INFO[pending.line].brand} أول.`);
  await bumpStep(db, storeId, 6, { onboardedAt: store.onboardedAt ?? new Date() });
  await db.update(lineSubscriptions).set({ setup: sql`json_set(${lineSubscriptions.setup}, '$.done', json('true'))` }).where(and(eq(lineSubscriptions.storeId, storeId), eq(lineSubscriptions.line, "store")));
  return { ok: true, data: undefined };
}
