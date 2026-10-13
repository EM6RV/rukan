import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { writeTransaction, type Db } from "@/db";
import { media, plans, stores, subscriptionPayments, users } from "@/db/schema/platform";
import { addMonths, cycleMonths } from "@/lib/billing";
import { BILLING_CYCLES } from "@/lib/constants";
import { firstError } from "@/lib/validation";
import { writeAudit } from "../audit";
import { fail, ok, type Result } from "../catalog/result";
import { computeStoreAccess } from "../store-access";

const DAY = 86_400_000;
type Actor = { id: string };

/** المتجر اللي تتغير بياناته: يرجع slug وid علشان الكاش يتفرغ */
export type TouchedStore = { id: string; slug: string };

const paymentSchema = z.object({
  storeId: z.string().min(1),
  planId: z.string().min(1, "اختار الباقة"),
  billingCycle: z.enum(BILLING_CYCLES, { error: "اختار دورة الدفع" }),
  amount: z.number({ error: "اكتب المبلغ" }).int("المبلغ لازم يكون رقم صحيح بالدرهم").min(1, "المبلغ لازم يكون أكبر من صفر").max(1_000_000_000),
  method: z.enum(["cash", "bank_transfer", "other"], { error: "اختار طريقة الدفع" }),
  receiptMediaId: z.string().min(1).nullish().transform((v) => v ?? null),
  note: z.string().trim().max(300, "الملاحظة طويلة").nullish().transform((v) => v || null),
});

/**
 * تسجيل دفعة اشتراك يدوية (كاش/تحويل): يفعّل الاشتراك ويمدّد الفترة تلقائياً.
 * لو الاشتراك لسا ساري تبدا الفترة من نهايته (ما يضيعش اللي دفعه)، وإلا من الحين.
 */
export async function recordPayment(db: Db, input: unknown, actor: Actor, now = Date.now()): Promise<Result<{ store: TouchedStore; periodEnd: number }>> {
  const p = paymentSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;

  const store = await db.select().from(stores).where(eq(stores.id, d.storeId)).get();
  if (!store) return fail("المتجر غير موجود.");
  const plan = await db.select().from(plans).where(eq(plans.id, d.planId)).get();
  if (!plan) return fail("الباقة غير موجودة.");
  if (d.receiptMediaId) {
    const m = await db.select({ id: media.id }).from(media).where(and(eq(media.id, d.receiptMediaId), eq(media.storeId, store.id), eq(media.isPrivate, true))).get();
    if (!m) return fail("صورة الإيصال غير صحيحة، ارفعها من جديد.");
  }

  const result = await writeTransaction(db, async (tx) => {
    const t = tx as unknown as Db;
    const cur = await t.select().from(stores).where(eq(stores.id, store.id)).get();
    const stillRunning = cur?.currentPeriodEnd && cur.currentPeriodEnd.getTime() > now && cur.status !== "trial";
    const periodStart = stillRunning ? cur!.currentPeriodEnd!.getTime() : now;
    const periodEnd = addMonths(periodStart, cycleMonths(d.billingCycle));
    await t.insert(subscriptionPayments).values({
      storeId: store.id, planId: d.planId, billingCycle: d.billingCycle, amount: d.amount, method: d.method, receiptMediaId: d.receiptMediaId,
      periodStart: new Date(periodStart), periodEnd: new Date(periodEnd), note: d.note, recordedBy: actor.id,
    });
    await t.update(stores).set({
      planId: d.planId, billingCycle: d.billingCycle, currentPeriodEnd: new Date(periodEnd),
      // المتجر الموقوف يبقى موقوف (الأدمن يفعّله بنفسه)، والباقي يصير نشط
      status: cur?.status === "suspended" ? "suspended" : "active",
    }).where(eq(stores.id, store.id));
    return periodEnd;
  });
  await writeAudit(db, { actorUserId: actor.id, storeId: store.id, action: "subscription.payment", entityType: "store", entityId: store.id, meta: { plan: plan.slug, cycle: d.billingCycle, amount: d.amount, method: d.method, periodEnd: result } });
  return ok({ store: { id: store.id, slug: store.slug }, periodEnd: result });
}

const daysSchema = z.number({ error: "اكتب عدد الأيام" }).int("عدد الأيام لازم يكون رقم صحيح").min(1, "على الأقل يوم").max(365, "الحد الأقصى 365 يوم");

/** تمديد التجربة المجانية (للمتاجر في التجربة أو المنتهية فقط) */
export async function extendTrial(db: Db, storeId: string, daysInput: unknown, actor: Actor, now = Date.now()): Promise<Result<{ store: TouchedStore; trialEndsAt: number }>> {
  const days = daysSchema.safeParse(daysInput);
  if (!days.success) return fail(firstError(days.error));
  const store = await db.select().from(stores).where(eq(stores.id, storeId)).get();
  if (!store) return fail("المتجر غير موجود.");
  const access = computeStoreAccess(store, now);
  if (access.state === "active") return fail("المتجر مشترك فعلياً. استعمل «تسجيل دفعة» بدل تمديد التجربة.");

  const base = Math.max(now, store.trialEndsAt?.getTime() ?? now);
  const trialEndsAt = base + days.data * DAY;
  await db.update(stores).set({ trialEndsAt: new Date(trialEndsAt), status: store.status === "suspended" ? "suspended" : "trial", updatedAt: new Date(now) }).where(eq(stores.id, storeId));
  await writeAudit(db, { actorUserId: actor.id, storeId, action: "store.extend_trial", entityType: "store", entityId: storeId, meta: { days: days.data, trialEndsAt } });
  return ok({ store: { id: store.id, slug: store.slug }, trialEndsAt });
}

/** إيقاف/تفعيل متجر. التفعيل يرجّع الحالة المنطقية (نشط/تجريبي/منتهي) حسب التواريخ. */
export async function setSuspended(db: Db, storeId: string, suspended: boolean, actor: Actor, reason?: string | null, now = Date.now()): Promise<Result<{ store: TouchedStore; status: string }>> {
  const store = await db.select().from(stores).where(eq(stores.id, storeId)).get();
  if (!store) return fail("المتجر غير موجود.");
  let status: "suspended" | "active" | "trial" | "expired" = "suspended";
  if (!suspended) {
    if (store.status !== "suspended") return fail("المتجر مش موقوف.");
    status = store.currentPeriodEnd && store.currentPeriodEnd.getTime() > now ? "active" : store.trialEndsAt && store.trialEndsAt.getTime() > now ? "trial" : "expired";
  } else if (store.status === "suspended") return fail("المتجر موقوف من قبل.");
  await db.update(stores).set({ status, updatedAt: new Date(now) }).where(eq(stores.id, storeId));
  await writeAudit(db, { actorUserId: actor.id, storeId, action: suspended ? "store.suspend" : "store.unsuspend", entityType: "store", entityId: storeId, meta: { reason: reason?.trim().slice(0, 200) || null, status } });
  return ok({ store: { id: store.id, slug: store.slug }, status });
}

/** تغيير الباقة يدوياً بدون دفعة (هدية/تصحيح) */
export async function changePlan(db: Db, storeId: string, planId: string, actor: Actor): Promise<Result<{ store: TouchedStore }>> {
  const [store, plan] = await Promise.all([db.select().from(stores).where(eq(stores.id, storeId)).get(), db.select().from(plans).where(eq(plans.id, planId)).get()]);
  if (!store) return fail("المتجر غير موجود.");
  if (!plan) return fail("الباقة غير موجودة.");
  await db.update(stores).set({ planId }).where(eq(stores.id, storeId));
  await writeAudit(db, { actorUserId: actor.id, storeId, action: "store.change_plan", entityType: "store", entityId: storeId, meta: { from: store.planId, to: planId, plan: plan.slug } });
  return ok({ store: { id: store.id, slug: store.slug } });
}

export type ExpiringStore = { id: string; slug: string; name: string; ownerName: string; ownerPhone: string; planName: string | null; state: "trial" | "active" | "expired"; daysLeft: number; endsAt: number };

/** متاجر قربت تخلص (≤ withinDays) أو انتهت خلال آخر graceDays: للتنبيه برسالة واتساب */
export async function listExpiring(db: Db, opts: { withinDays?: number; graceDays?: number } = {}, now = Date.now()): Promise<ExpiringStore[]> {
  const within = opts.withinDays ?? 5, grace = opts.graceDays ?? 7;
  const rows = await db
    .select({ s: stores, ownerName: users.name, ownerPhone: users.phone, planName: plans.nameAr })
    .from(stores).innerJoin(users, eq(users.id, stores.ownerUserId)).leftJoin(plans, eq(plans.id, stores.planId))
    .where(and(ne(stores.status, "suspended"), sql`${stores.onboardedAt} IS NOT NULL`));
  const out: ExpiringStore[] = [];
  for (const r of rows) {
    const end = r.s.status === "trial" ? r.s.trialEndsAt : r.s.currentPeriodEnd;
    if (!end) continue;
    const left = Math.ceil((end.getTime() - now) / DAY);
    if (left > within || left < -grace) continue;
    out.push({ id: r.s.id, slug: r.s.slug, name: r.s.name, ownerName: r.ownerName, ownerPhone: r.ownerPhone, planName: r.planName, state: left <= 0 ? "expired" : r.s.status === "trial" ? "trial" : "active", daysLeft: left, endsAt: end.getTime() });
  }
  return out.sort((a, b) => a.endsAt - b.endsAt);
}

export async function listPayments(db: Db, opts: { storeId?: string; page?: number; pageSize?: number } = {}) {
  const size = Math.min(opts.pageSize ?? 25, 100);
  const where = opts.storeId ? eq(subscriptionPayments.storeId, opts.storeId) : undefined;
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(subscriptionPayments).where(where);
  const pageCount = Math.max(1, Math.ceil(n / size));
  const page = Math.min(Math.max(1, opts.page ?? 1), pageCount);
  const rows = await db
    .select({ p: subscriptionPayments, storeName: stores.name, storeSlug: stores.slug, planName: plans.nameAr, recorder: users.name })
    .from(subscriptionPayments).innerJoin(stores, eq(stores.id, subscriptionPayments.storeId)).innerJoin(plans, eq(plans.id, subscriptionPayments.planId)).innerJoin(users, eq(users.id, subscriptionPayments.recordedBy))
    .where(where).orderBy(desc(subscriptionPayments.createdAt), asc(subscriptionPayments.id)).limit(size).offset((page - 1) * size);
  return {
    total: n, page, pageCount,
    items: rows.map((r) => ({ id: r.p.id, storeId: r.p.storeId, storeName: r.storeName, storeSlug: r.storeSlug, planName: r.planName, billingCycle: r.p.billingCycle, amount: r.p.amount, method: r.p.method, receiptMediaId: r.p.receiptMediaId, periodStart: r.p.periodStart.getTime(), periodEnd: r.p.periodEnd.getTime(), note: r.p.note, recordedBy: r.recorder, createdAt: r.p.createdAt.getTime() })),
  };
}

