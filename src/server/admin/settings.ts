import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { auditLogs, plans, platformSettings, stores, users } from "@/db/schema/platform";
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants";
import { normalizeLibyanPhone } from "@/lib/phone";
import { firstError } from "@/lib/validation";
import { writeAudit } from "../audit";
import { fail, ok, type Result } from "../catalog/result";
import { getPlatformSetting } from "../platform-settings";

export type PlatformConfig = { trialDays: number; trialPlanSlug: string; supportWhatsapp: string | null };

export async function getPlatformConfig(db: Db): Promise<PlatformConfig> {
  const [trialDays, trialPlanSlug, supportWhatsapp] = await Promise.all([
    getPlatformSetting<number>(db, "trial_days", DEFAULT_TRIAL_DAYS),
    getPlatformSetting<string>(db, "trial_plan_slug", "growth"),
    getPlatformSetting<string>(db, "support_whatsapp", ""),
  ]);
  return { trialDays, trialPlanSlug, supportWhatsapp: supportWhatsapp || null };
}

const schema = z.object({
  trialDays: z.number({ error: "اكتب عدد أيام التجربة" }).int("عدد الأيام لازم يكون رقم صحيح").min(1, "على الأقل يوم").max(90, "الحد الأقصى 90 يوم"),
  trialPlanSlug: z.string().min(1, "اختار باقة التجربة"),
  supportWhatsapp: z.string().trim().nullish().transform((v, ctx) => {
    if (!v) return null;
    const n = normalizeLibyanPhone(v);
    if (!n) { ctx.addIssue({ code: "custom", message: "رقم واتساب الدعم مش رقم ليبي صحيح" }); return z.NEVER; }
    return n;
  }),
});

async function put(db: Db, key: string, value: unknown) {
  await db.insert(platformSettings).values({ key, value }).onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
}

export async function savePlatformConfig(db: Db, input: unknown, actorUserId: string): Promise<Result> {
  const p = schema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const plan = await db.select().from(plans).where(eq(plans.slug, p.data.trialPlanSlug)).get();
  if (!plan || !plan.isActive) return fail("باقة التجربة لازم تكون موجودة وفعّالة.");
  await put(db, "trial_days", p.data.trialDays);
  await put(db, "trial_plan_slug", p.data.trialPlanSlug);
  await put(db, "support_whatsapp", p.data.supportWhatsapp ?? ""); // JSON null يتخزن NULL والعمود NOT NULL، فنخزن نص فاضي
  await writeAudit(db, { actorUserId, storeId: null, action: "platform.settings", meta: { ...p.data } });
  return ok(undefined);
}

export async function listAudit(db: Db, f: { storeId?: string; action?: string; page?: number; pageSize?: number } = {}) {
  const size = Math.min(f.pageSize ?? 30, 100);
  const conds = [f.storeId ? eq(auditLogs.storeId, f.storeId) : undefined, f.action ? eq(auditLogs.action, f.action) : undefined].filter((x) => !!x);
  const where = conds.length ? and(...conds) : undefined;
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(auditLogs).where(where);
  const pageCount = Math.max(1, Math.ceil(n / size));
  const page = Math.min(Math.max(1, f.page ?? 1), pageCount);
  const rows = await db.select({ a: auditLogs, actor: users.name, store: stores.name }).from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId)).leftJoin(stores, eq(stores.id, auditLogs.storeId))
    .where(where).orderBy(desc(auditLogs.createdAt), asc(auditLogs.id)).limit(size).offset((page - 1) * size);
  return { total: n, page, pageCount, items: rows.map((r) => ({ id: r.a.id, action: r.a.action, actor: r.actor, storeId: r.a.storeId, storeName: r.store, entityType: r.a.entityType, meta: r.a.meta, createdAt: r.a.createdAt.getTime() })) };
}
