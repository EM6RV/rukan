import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { auditLogs, plans, platformSettings, stores, users } from "@/db/schema/platform";
import { DEFAULT_TRIAL_DAYS, DEFAULT_TRIAL_PLAN_SLUG } from "@/lib/constants";
import { normalizeLibyanPhone } from "@/lib/phone";
import { firstError } from "@/lib/validation";
import { writeAudit } from "../audit";
import { fail, ok, type Result } from "../catalog/result";
import { getPlatformSetting } from "../platform-settings";
import { DEFAULT_LINE_TRIAL_DAYS, DEFAULT_LINE_TRIAL_PLAN, LINE_INFO, OPS_LINES, type LineLaunch } from "@/lib/product-lines";
import { lineLaunch, trialDaysKey, trialPlanKey } from "../lines";

type OpsLine = (typeof OPS_LINES)[number];

/** عرض ترويجي يطلع كشريط فوق الموقع التسويقي (مثلاً «أول شهر مجاني») */
export type Promo = { enabled: boolean; text: string; linkLabel: string; endsAt: number | null };
const NO_PROMO: Promo = { enabled: false, text: "", linkLabel: "", endsAt: null };

export type PlatformConfig = {
  trialDays: number; trialPlanSlug: string; supportWhatsapp: string | null;
  /** الباقة المجانية مطلقة؟ (مطفية = مخفية من الأسعار والتسجيل والمقارنة) */
  freePlanEnabled: boolean;
  /** المتاجر الجديدة تبدا بتجربة مجانية بعدد أيام، أو على الباقة المجانية (لما تكون مطلقة) */
  startMode: "trial" | "free";
  promo: Promo;
};

export async function getPlatformConfig(db: Db): Promise<PlatformConfig> {
  const [trialDays, trialPlanSlug, supportWhatsapp, freePlanEnabled, startMode, promo] = await Promise.all([
    getPlatformSetting<number>(db, "trial_days", DEFAULT_TRIAL_DAYS),
    getPlatformSetting<string>(db, "trial_plan_slug", DEFAULT_TRIAL_PLAN_SLUG),
    getPlatformSetting<string>(db, "support_whatsapp", ""),
    getPlatformSetting<boolean>(db, "free_plan_enabled", false),
    getPlatformSetting<"trial" | "free">(db, "start_mode", "trial"),
    getPlatformSetting<Promo>(db, "promo", NO_PROMO),
  ]);
  return { trialDays, trialPlanSlug, supportWhatsapp: supportWhatsapp || null, freePlanEnabled, startMode: freePlanEnabled ? startMode : "trial", promo: { ...NO_PROMO, ...promo } };
}

/** العرض الترويجي فعّال الحين؟ (مفعّل وما انتهاش) */
export const promoActive = (p: Promo, now = Date.now()) => p.enabled && !!p.text.trim() && (p.endsAt === null || p.endsAt > now);

const schema = z.object({
  startMode: z.enum(["trial", "free"]).default("trial"),
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
  if (!plan || !plan.isActive || plan.line !== "store") return fail("باقة التجربة لازم تكون من باقات المتجر وفعّالة.");
  await put(db, "trial_days", p.data.trialDays);
  await put(db, "trial_plan_slug", p.data.trialPlanSlug);
  await put(db, "support_whatsapp", p.data.supportWhatsapp ?? ""); // JSON null يتخزن NULL والعمود NOT NULL، فنخزن نص فاضي
  if (p.data.startMode === "free" && !(await getPlatformSetting<boolean>(db, "free_plan_enabled", false))) return fail("فعّل الباقة المجانية أول، وبعدين اختارها كبداية للمتاجر الجديدة.");
  await put(db, "start_mode", p.data.startMode);
  await writeAudit(db, { actorUserId, storeId: null, action: "platform.settings", meta: { ...p.data } });
  return ok(undefined);
}

/** إطلاق/إيقاف الباقة المجانية. الإيقاف يرجّع بداية المتاجر الجديدة للتجربة (والمتاجر اللي عليها تبقى) */
export async function setFreePlanEnabled(db: Db, enabled: unknown, actorUserId: string): Promise<Result> {
  if (typeof enabled !== "boolean") return fail("اختار مفعّلة أو مطفية");
  if (enabled) {
    const free = await db.select().from(plans).where(eq(plans.isFree, true)).get();
    if (!free || !free.isActive) return fail("ما لقينا باقة مجانية فعّالة. جهّزها من «الباقات» أول.");
  } else await put(db, "start_mode", "trial");
  await put(db, "free_plan_enabled", enabled);
  await writeAudit(db, { actorUserId, storeId: null, action: enabled ? "platform.free_plan_on" : "platform.free_plan_off" });
  return ok(undefined);
}

// ===== المنظومات (ماركت/بلاي/فِت): الإطلاق ومدة التجربة وباقتها =====

export type LineConfig = Record<OpsLine, { trialDays: number; trialPlanSlug: string; launch: LineLaunch }>;

export async function getLineConfig(db: Db): Promise<LineConfig> {
  const launch = await lineLaunch(db);
  const out = {} as LineConfig;
  for (const l of OPS_LINES) {
    out[l] = {
      trialDays: await getPlatformSetting<number>(db, trialDaysKey(l), DEFAULT_LINE_TRIAL_DAYS[l]),
      trialPlanSlug: await getPlatformSetting<string>(db, trialPlanKey(l), DEFAULT_LINE_TRIAL_PLAN[l]),
      launch: launch[l],
    };
  }
  return out;
}

const lineConfigSchema = z.object(Object.fromEntries(OPS_LINES.map((l) => [l, z.object({
  trialDays: z.number({ error: "اكتب عدد أيام التجربة" }).int("عدد الأيام لازم يكون رقم صحيح").min(1, "على الأقل يوم").max(90, "الحد الأقصى 90 يوم"),
  trialPlanSlug: z.string().min(1, "اختار باقة التجربة"),
  launch: z.enum(["live", "soon"]),
})])) as Record<OpsLine, z.ZodObject<{ trialDays: z.ZodNumber; trialPlanSlug: z.ZodString; launch: z.ZodEnum<{ live: "live"; soon: "soon" }> }>>);

export async function saveLineConfig(db: Db, input: unknown, actorUserId: string): Promise<Result> {
  const p = lineConfigSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  for (const l of OPS_LINES) {
    const plan = await db.select().from(plans).where(eq(plans.slug, p.data[l].trialPlanSlug)).get();
    if (!plan || !plan.isActive || plan.line !== l) return fail(`باقة تجربة ${LINE_INFO[l].brand} لازم تكون من باقاتها وفعّالة.`);
  }
  for (const l of OPS_LINES) {
    await put(db, trialDaysKey(l), p.data[l].trialDays);
    await put(db, trialPlanKey(l), p.data[l].trialPlanSlug);
  }
  await put(db, "line_launch", Object.fromEntries(OPS_LINES.map((l) => [l, p.data[l].launch])));
  await writeAudit(db, { actorUserId, storeId: null, action: "platform.lines", meta: { ...p.data } });
  return ok(undefined);
}

/** تجربة منظومة لنشاط معين قبل الإطلاق العام (زي inboxBeta) */
export async function setLineBeta(db: Db, storeId: string, input: unknown, actorUserId: string): Promise<Result<{ slug: string }>> {
  const p = z.array(z.enum(OPS_LINES)).max(OPS_LINES.length).safeParse(input);
  if (!p.success) return fail("اختيار غلط.");
  const [row] = await db.update(stores).set({ lineBeta: [...new Set(p.data)] }).where(eq(stores.id, storeId)).returning({ slug: stores.slug });
  if (!row) return fail("ما لقينا المتجر. حدّث الصفحة.");
  await writeAudit(db, { actorUserId, storeId, action: "store.line_beta", entityType: "store", entityId: storeId, meta: { lines: p.data } });
  return ok({ slug: row.slug });
}

const promoSchema = z.object({
  enabled: z.boolean(),
  text: z.string().trim().max(140, "نص العرض طويل (الحد 140 حرف)"),
  linkLabel: z.string().trim().max(30, "نص الزر طويل").default(""),
  endsAt: z.number().int().positive().nullable().default(null),
}).refine((p) => !p.enabled || p.text.length >= 4, { message: "اكتب نص العرض قبل ما تفعّله", path: ["text"] });

export async function savePromo(db: Db, input: unknown, actorUserId: string): Promise<Result> {
  const p = promoSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  await put(db, "promo", p.data);
  await writeAudit(db, { actorUserId, storeId: null, action: "platform.promo", meta: { ...p.data } });
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
