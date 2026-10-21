import { asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { addons, plans, storeAddons, stores, type DurationPerks, type PlanLimits, type PlanPrices } from "@/db/schema/platform";
import { ADDON_KINDS, DEFAULT_TRIAL_PLAN_SLUG } from "@/lib/constants";
import { firstError } from "@/lib/validation";
import { writeAudit } from "../audit";
import { fail, ok, type Result } from "../catalog/result";
import { isUniqueViolation } from "../db-errors";
import { getPlatformSetting } from "../platform-settings";

const nullableInt = (label: string, max: number) =>
  z.number({ error: `${label} لازم يكون رقم` }).int(`${label} لازم يكون رقم صحيح`).min(0, `${label} ما يكونش بالسالب`).max(max, `${label} كبير بزيادة`).nullable();

const price = z.number({ error: "السعر لازم يكون رقم" }).int("السعر لازم يكون رقم صحيح بالدرهم").min(0, "اكتب سعر 0 أو أكثر").max(1_000_000_000).nullable();
const prices = z.object({ m1: price, m3: price, m6: price, m12: price });
const perk = z.object({
  freeDesigns: z.number().int().min(0, "ما يكونش بالسالب").max(20, "عدد التصاميم المجانية كبير بزيادة").optional(),
  note: z.string().trim().max(80, "نص الميزة طويل").optional(),
}).optional();
const flag = z.boolean().default(false);

const schema = z.object({
  id: z.string().min(1).optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,23}$/, "الرمز حروف إنجليزية صغيرة وأرقام وشرطة (2 إلى 24)").optional(),
  nameAr: z.string({ error: "اكتب اسم الباقة" }).trim().min(2, "اسم الباقة قصير").max(30, "اسم الباقة طويل"),
  descriptionAr: z.string().trim().max(160, "الوصف طويل").nullish().transform((v) => v || null),
  prices,
  comparePrices: prices.partial().default({}),
  durationPerks: z.object({ m1: perk, m3: perk, m6: perk, m12: perk }).default({}),
  isFeatured: z.boolean().default(false),
  isFree: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
  limits: z.object({
    maxProducts: nullableInt("حد المنتجات", 10_000_000),
    maxStaff: nullableInt("حد الموظفين", 100_000),
    maxOrdersPerMonth: nullableInt("حد الطلبيات في الشهر", 10_000_000).default(null),
    maxWarehouses: nullableInt("حد المخازن", 1000).default(1),
    freeDesigns: z.number({ error: "عدد التصاميم المجانية لازم يكون رقم" }).int("عدد التصاميم المجانية لازم يكون رقم صحيح").min(0, "ما يكونش بالسالب").max(20, "عدد التصاميم المجانية كبير بزيادة").default(0),
    allTemplates: z.boolean(), coupons: z.boolean(), reports: z.boolean(), customDomain: z.boolean(), pixels: z.boolean(), removeBranding: z.boolean(),
    abandonedCarts: flag, bundles: flag, customRoles: flag, advancedReports: flag, analytics: flag,
    modules: z.object({ warehouses: flag, purchasing: flag, accounting: flag, marketplaceInbox: flag }).default({ warehouses: false, purchasing: false, accounting: false, marketplaceInbox: false }),
  }),
}).superRefine((d, ctx) => {
  if (!d.isFree && Object.values(d.prices).every((v) => v === null)) ctx.addIssue({ code: "custom", path: ["prices"], message: "حط سعر لمدة وحدة على الأقل (شهر أو 3 أو 6 أو سنة)." });
  for (const k of ["m1", "m3", "m6", "m12"] as const) {
    const c = d.comparePrices[k], p = d.prices[k];
    if (c != null && (p == null || c <= p)) ctx.addIssue({ code: "custom", path: ["comparePrices", k], message: "السعر الأصلي (المشطوب) لازم يكون أكبر من السعر الحالي." });
  }
});

/** الأعمدة القديمة (billing_period/price) للتوافق بس: أول مدة متاحة وسعرها */
function legacyColumns(p: Record<string, number | null>) {
  const first = (["m1", "m3", "m6", "m12"] as const).find((k) => p[k] != null) ?? "m1";
  const cycle = ({ m1: "monthly", m3: "quarterly", m6: "semiannual", m12: "yearly" } as const)[first];
  return { billingPeriod: cycle, price: p[first] ?? 0 };
}

export const listPlans = (db: Db) => db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.nameAr));

/** شكل الباقة في صفحات الأسعار (الموقع التسويقي وصفحة الاشتراك) */
export type PricingPlan = {
  id: string; slug: string; name: string; description: string | null; prices: PlanPrices; comparePrices: PlanPrices;
  durationPerks: DurationPerks; isFeatured: boolean; isFree: boolean; sortOrder: number; limits: PlanLimits;
};

/** الباقات اللي تطلع للناس: الفعّالة، والمجانية بس لو الأدمن أطلقها */
export async function publicPlans(db: Db, freePlanEnabled: boolean): Promise<PricingPlan[]> {
  return (await listPlans(db))
    .filter((p) => p.isActive && (!p.isFree || freePlanEnabled))
    .map((p) => ({ id: p.id, slug: p.slug, name: p.nameAr, description: p.descriptionAr, prices: p.prices, comparePrices: p.comparePrices, durationPerks: p.durationPerks, isFeatured: p.isFeatured, isFree: p.isFree, sortOrder: p.sortOrder, limits: p.limits }));
}

export async function savePlan(db: Db, input: unknown, actorUserId: string): Promise<Result<{ id: string; affectedStores: { id: string; slug: string }[] }>> {
  const p = schema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, slug, ...d } = p.data;
  const limits: PlanLimits = d.limits;
  const values = {
    nameAr: d.nameAr, descriptionAr: d.descriptionAr, prices: d.prices, comparePrices: d.comparePrices, durationPerks: d.durationPerks,
    isFeatured: d.isFeatured, isFree: d.isFree, sortOrder: d.sortOrder, isActive: d.isActive, limits, ...legacyColumns(d.prices),
  };

  if (d.isFree) {
    const other = await db.select({ id: plans.id }).from(plans).where(eq(plans.isFree, true)).get();
    if (other && other.id !== id) return fail("فيه باقة مجانية من قبل. عدّلها بدل ما تزيد وحدة ثانية.");
  }

  try {
    if (id) {
      const cur = await db.select().from(plans).where(eq(plans.id, id)).get();
      if (!cur) return fail("ما لقينا الباقة. يمكن انحذف، حدّث الصفحة.");
      const trialSlug = await getPlatformSetting<string>(db, "trial_plan_slug", DEFAULT_TRIAL_PLAN_SLUG);
      if (!d.isActive && cur.slug === trialSlug) return fail("هذي باقة التجربة المجانية. غيّر باقة التجربة من الإعدادات قبل ما توقفها.");
      await db.update(plans).set(values).where(eq(plans.id, id));
      if (d.isFeatured) await db.update(plans).set({ isFeatured: false }).where(ne(plans.id, id)); // باقة وحدة بس مميزة
      // الحدود تتقرا من القاعدة في اللوحة، لكن واجهات المتاجر مخزنة: لازم نفرّغ كاش المتاجر على هذي الباقة
      const affected = await db.select({ id: stores.id, slug: stores.slug }).from(stores).where(eq(stores.planId, id));
      await writeAudit(db, { actorUserId, storeId: null, action: "plan.update", entityType: "plan", entityId: id, meta: { slug: cur.slug, prices: d.prices, limits, affected: affected.length } });
      return ok({ id, affectedStores: affected });
    }
    if (!slug) return fail("اكتب رمز الباقة (حروف إنجليزية).");
    const [row] = await db.insert(plans).values({ slug, ...values }).returning({ id: plans.id });
    if (d.isFeatured) await db.update(plans).set({ isFeatured: false }).where(ne(plans.id, row!.id));
    await writeAudit(db, { actorUserId, storeId: null, action: "plan.create", entityType: "plan", entityId: row!.id, meta: { slug } });
    return ok({ id: row!.id, affectedStores: [] });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("رمز الباقة مستعمل. اختار رمز ثاني.");
    throw e;
  }
}

// ===== الإضافات (Add-ons) =====
const addonSchema = z.object({
  id: z.string().min(1).optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,23}$/, "الرمز حروف إنجليزية صغيرة وأرقام وشرطة (2 إلى 24)").optional(),
  nameAr: z.string({ error: "اكتب اسم الإضافة" }).trim().min(2, "الاسم قصير").max(40, "الاسم طويل"),
  kind: z.enum(ADDON_KINDS, { error: "اختار نوع الإضافة" }),
  units: z.number({ error: "اكتب الكمية" }).int().min(1, "الكمية على الأقل 1").max(100_000),
  monthlyPrice: z.number({ error: "اكتب السعر" }).int("السعر لازم يكون رقم صحيح بالدرهم").min(0).max(100_000_000),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const listAddons = (db: Db) => db.select().from(addons).orderBy(asc(addons.sortOrder), asc(addons.nameAr));

export async function saveAddon(db: Db, input: unknown, actorUserId: string): Promise<Result<{ id: string; affectedStores: { id: string; slug: string }[] }>> {
  const p = addonSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, slug, ...d } = p.data;
  try {
    if (id) {
      const cur = await db.select({ id: addons.id }).from(addons).where(eq(addons.id, id)).get();
      if (!cur) return fail("ما لقينا الإضافة. حدّث الصفحة.");
      await db.update(addons).set(d).where(eq(addons.id, id));
      await writeAudit(db, { actorUserId, storeId: null, action: "addon.update", entityType: "addon", entityId: id, meta: d });
      // المتاجر اللي عندها الإضافة: حدودها اتغيرت، فكاش واجهاتها يتفرغ
      const affected = await db.select({ id: stores.id, slug: stores.slug }).from(storeAddons).innerJoin(stores, eq(stores.id, storeAddons.storeId)).where(eq(storeAddons.addonId, id));
      return ok({ id, affectedStores: affected });
    }
    if (!slug) return fail("اكتب رمز الإضافة (حروف إنجليزية).");
    const [row] = await db.insert(addons).values({ slug, ...d }).returning({ id: addons.id });
    await writeAudit(db, { actorUserId, storeId: null, action: "addon.create", entityType: "addon", entityId: row!.id, meta: { slug } });
    return ok({ id: row!.id, affectedStores: [] });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("رمز الإضافة مستعمل. اختار رمز ثاني.");
    throw e;
  }
}
