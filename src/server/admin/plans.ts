import { asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { plans, stores, type PlanLimits } from "@/db/schema/platform";
import { BILLING_CYCLES, DEFAULT_TRIAL_PLAN_SLUG } from "@/lib/constants";
import { firstError } from "@/lib/validation";
import { writeAudit } from "../audit";
import { fail, ok, type Result } from "../catalog/result";
import { isUniqueViolation } from "../db-errors";
import { getPlatformSetting } from "../platform-settings";

const nullableInt = (label: string, max: number) =>
  z.number({ error: `${label} لازم يكون رقم` }).int(`${label} لازم يكون رقم صحيح`).min(0, `${label} ما يكونش بالسالب`).max(max, `${label} كبير بزيادة`).nullable();

const schema = z.object({
  id: z.string().min(1).optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,23}$/, "الرمز حروف إنجليزية صغيرة وأرقام وشرطة (2 إلى 24)").optional(),
  nameAr: z.string({ error: "اكتب اسم الباقة" }).trim().min(2, "اسم الباقة قصير").max(30, "اسم الباقة طويل"),
  descriptionAr: z.string().trim().max(160, "الوصف طويل").nullish().transform((v) => v || null),
  billingPeriod: z.enum(BILLING_CYCLES, { error: "اختار مدة الباقة (شهرية أو سنوية)" }),
  price: z.number({ error: "اكتب سعر الباقة" }).int("السعر لازم يكون رقم صحيح بالدرهم").min(0, "اكتب سعر 0 أو أكثر").max(1_000_000_000),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
  limits: z.object({
    maxProducts: nullableInt("حد المنتجات", 10_000_000),
    maxStaff: nullableInt("حد الموظفين", 100_000),
    allTemplates: z.boolean(), coupons: z.boolean(), reports: z.boolean(), customDomain: z.boolean(), pixels: z.boolean(), removeBranding: z.boolean(),
  }),
});

export const listPlans = (db: Db) => db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.price));

export async function savePlan(db: Db, input: unknown, actorUserId: string): Promise<Result<{ id: string; affectedStores: { id: string; slug: string }[] }>> {
  const p = schema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, slug, ...d } = p.data;
  const limits: PlanLimits = d.limits;

  try {
    if (id) {
      const cur = await db.select().from(plans).where(eq(plans.id, id)).get();
      if (!cur) return fail("ما لقينا الباقة. يمكن انحذف، حدّث الصفحة.");
      const trialSlug = await getPlatformSetting<string>(db, "trial_plan_slug", DEFAULT_TRIAL_PLAN_SLUG);
      if (!d.isActive && cur.slug === trialSlug) return fail("هذي باقة التجربة المجانية. غيّر باقة التجربة من الإعدادات قبل ما توقفها.");
      await db.update(plans).set({ nameAr: d.nameAr, descriptionAr: d.descriptionAr, billingPeriod: d.billingPeriod, price: d.price, isFeatured: d.isFeatured, sortOrder: d.sortOrder, isActive: d.isActive, limits }).where(eq(plans.id, id));
      if (d.isFeatured) await db.update(plans).set({ isFeatured: false }).where(ne(plans.id, id)); // باقة وحدة بس مميزة
      // الحدود تتقرا من القاعدة في اللوحة، لكن واجهات المتاجر مخزنة: لازم نفرّغ كاش المتاجر على هذي الباقة
      const affected = await db.select({ id: stores.id, slug: stores.slug }).from(stores).where(eq(stores.planId, id));
      await writeAudit(db, { actorUserId, storeId: null, action: "plan.update", entityType: "plan", entityId: id, meta: { slug: cur.slug, billingPeriod: d.billingPeriod, price: d.price, limits, affected: affected.length } });
      return ok({ id, affectedStores: affected });
    }
    if (!slug) return fail("اكتب رمز الباقة (حروف إنجليزية).");
    const [row] = await db.insert(plans).values({ slug, nameAr: d.nameAr, descriptionAr: d.descriptionAr, billingPeriod: d.billingPeriod, price: d.price, isFeatured: d.isFeatured, sortOrder: d.sortOrder, isActive: d.isActive, limits }).returning({ id: plans.id });
    if (d.isFeatured) await db.update(plans).set({ isFeatured: false }).where(ne(plans.id, row!.id));
    await writeAudit(db, { actorUserId, storeId: null, action: "plan.create", entityType: "plan", entityId: row!.id, meta: { slug } });
    return ok({ id: row!.id, affectedStores: [] });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("رمز الباقة مستعمل. اختار رمز ثاني.");
    throw e;
  }
}
