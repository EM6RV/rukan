import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { writeTransaction, type Db } from "@/db";
import { addons, lineSubscriptions, media, plans, storeAddons, stores, subscriptionPayments, users, type PlanPrices } from "@/db/schema/platform";
import { addMonths, cycleMonths, periodLabel, planPrice, type BillingPeriod } from "@/lib/billing";
import { BILLING_CYCLES } from "@/lib/constants";
import { firstError } from "@/lib/validation";
import { writeAudit } from "../audit";
import { fail, ok, type Result } from "../catalog/result";
import { LINE_INFO, PRODUCT_LINES, addonFitsLine, type ProductLine } from "@/lib/product-lines";
import { computeLineState, type LineState } from "../line-access";
import { startLineTrial, syncStoreColumns } from "../lines";

const DAY = 86_400_000;
type Actor = { id: string };

/** المتجر اللي تتغير بياناته: يرجع slug وid علشان الكاش يتفرغ */
export type TouchedStore = { id: string; slug: string };

const lineField = z.enum(PRODUCT_LINES, { error: "اختار المنظومة" }).default("store");

const paymentSchema = z.object({
  storeId: z.string().min(1),
  line: lineField,
  planId: z.string().min(1, "اختار الباقة"),
  cycle: z.enum(BILLING_CYCLES, { error: "اختار مدة الاشتراك" }),
  addons: z.array(z.object({ addonId: z.string().min(1), quantity: z.number().int().min(0).max(1000) })).max(20).default([]),
  amount: z.number({ error: "اكتب المبلغ" }).int("المبلغ لازم يكون رقم صحيح بالدرهم").min(1, "المبلغ لازم يكون أكبر من صفر").max(1_000_000_000),
  method: z.enum(["cash", "bank_transfer", "other"], { error: "اختار طريقة الدفع" }),
  receiptMediaId: z.string().min(1).nullish().transform((v) => v ?? null),
  note: z.string().trim().max(300, "الملاحظة طويلة").nullish().transform((v) => v || null),
});

/** المبلغ المقترح: سعر الباقة للمدة + سعر الإضافات الشهري × عدد الشهور، ناقص خصم حزمة الدمج لو فيه (الأدمن يقدر يعدّله) */
export function suggestedAmount(plan: { prices: PlanPrices }, cycle: BillingPeriod, lines: { monthlyPrice: number; quantity: number }[], discountPercent = 0): number | null {
  const base = planPrice(plan, cycle);
  if (base === null) return null;
  const total = base + lines.reduce((s, l) => s + l.monthlyPrice * l.quantity, 0) * cycleMonths(cycle);
  return Math.round((total * (100 - Math.min(90, Math.max(0, discountPercent)))) / 100);
}

type SubRow = typeof lineSubscriptions.$inferSelect;
type Tx = Db;

/** سطر اشتراك المنظومة. سطر «store» لنشاط قديم ما عندوش سطر يتنشأ من أعمدة stores (نفس القيم). */
async function lineRow(t: Tx, storeId: string, line: ProductLine): Promise<SubRow | undefined> {
  const row = await t.select().from(lineSubscriptions).where(and(eq(lineSubscriptions.storeId, storeId), eq(lineSubscriptions.line, line))).get();
  if (row || line !== "store") return row;
  const st = await t.select().from(stores).where(eq(stores.id, storeId)).get();
  if (!st) return undefined;
  const others = await t.select({ id: lineSubscriptions.id }).from(lineSubscriptions).where(eq(lineSubscriptions.storeId, storeId)).get();
  if (others) return undefined; // عنده منظومات ثانية وما عندوش متجر: مش مشترك فيه
  const [created] = await t.insert(lineSubscriptions).values({ storeId, line: "store", planId: st.planId, billingCycle: st.billingCycle, status: st.status, trialEndsAt: st.trialEndsAt, currentPeriodEnd: st.currentPeriodEnd }).returning();
  return created;
}

const label = (line: ProductLine) => (line === "store" ? "المتجر" : LINE_INFO[line].brand);

/**
 * تسجيل دفعة اشتراك يدوية (كاش/تحويل) على منظومة: يفعّل اشتراكها ويمدّد فترتها بالمدة المختارة (شهر/3/6/سنة)،
 * ويحفظ إضافاتها المدفوعة (تمشي مع نفس الفترة). لو الاشتراك لسا ساري تبدا الفترة من نهايته (ما يضيعش اللي دفعه)، وإلا من الحين.
 * الدفعة على منظومة النشاط مش مشترك فيها تفتحها له.
 */
export async function recordPayment(db: Db, input: unknown, actor: Actor, now = Date.now()): Promise<Result<{ store: TouchedStore; periodEnd: number }>> {
  const p = paymentSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;

  const store = await db.select().from(stores).where(eq(stores.id, d.storeId)).get();
  if (!store) return fail("ما لقينا المتجر. يمكن انحذف، حدّث الصفحة.");
  const plan = await db.select().from(plans).where(eq(plans.id, d.planId)).get();
  if (!plan) return fail("ما لقينا الباقة. يمكن انحذف، حدّث الصفحة.");
  if (plan.line !== d.line) return fail(`باقة «${plan.nameAr}» مش من باقات ${label(d.line)}.`);
  if (plan.isFree) return fail("الباقة المجانية ما تحتاجش دفعة. استعمل «تغيير الباقة».");
  if (planPrice(plan, d.cycle) === null) return fail(`باقة «${plan.nameAr}» ما تطلعش في مدة «${periodLabel(d.cycle)}». اختار مدة ثانية.`);
  const items = d.addons.filter((a) => a.quantity > 0);
  const addonRows = items.length ? await db.select().from(addons).where(inArray(addons.id, items.map((l) => l.addonId))) : [];
  if (addonRows.length !== new Set(items.map((l) => l.addonId)).size) return fail("فيه إضافة مش موجودة. حدّث الصفحة.");
  const misfit = addonRows.find((a) => !addonFitsLine(a.kind, d.line));
  if (misfit) return fail(`إضافة «${misfit.nameAr}» ما تنفعش مع ${label(d.line)}.`);
  const snapshot = items.map((l) => ({ addonId: l.addonId, slug: addonRows.find((a) => a.id === l.addonId)!.slug, quantity: l.quantity }));
  if (d.receiptMediaId) {
    const m = await db.select({ id: media.id }).from(media).where(and(eq(media.id, d.receiptMediaId), eq(media.storeId, store.id), eq(media.isPrivate, true))).get();
    if (!m) return fail("ما قدرنا نقرا صورة الإيصال. ارفع صورة JPG أو PNG أو WebP.");
  }

  const result = await writeTransaction(db, async (tx) => {
    const t = tx as unknown as Db;
    const cur = await lineRow(t, store.id, d.line);
    const stillRunning = cur?.currentPeriodEnd && cur.currentPeriodEnd.getTime() > now && cur.status !== "trial";
    const periodStart = stillRunning ? cur!.currentPeriodEnd!.getTime() : now;
    const periodEnd = addMonths(periodStart, cycleMonths(d.cycle));
    await t.insert(subscriptionPayments).values({
      storeId: store.id, line: d.line, planId: d.planId, billingCycle: d.cycle, amount: d.amount, method: d.method, receiptMediaId: d.receiptMediaId,
      addons: snapshot.length ? snapshot : null, periodStart: new Date(periodStart), periodEnd: new Date(periodEnd), note: d.note, recordedBy: actor.id,
    });
    // الإضافات: اللي اندفعت مع الدفعة هي اللي تبقى مفعّلة للمنظومة هذي
    await t.delete(storeAddons).where(and(eq(storeAddons.storeId, store.id), eq(storeAddons.line, d.line)));
    if (snapshot.length) await t.insert(storeAddons).values(snapshot.map((a) => ({ storeId: store.id, line: d.line, addonId: a.addonId, quantity: a.quantity })));
    // الموقوف يبقى موقوف (الأدمن يفعّله بنفسه)، والباقي يصير نشط
    const sub = { planId: d.planId, billingCycle: d.cycle, currentPeriodEnd: new Date(periodEnd), status: cur?.status === "suspended" ? ("suspended" as const) : ("active" as const) };
    if (cur) await t.update(lineSubscriptions).set(sub).where(eq(lineSubscriptions.id, cur.id));
    else await t.insert(lineSubscriptions).values({ storeId: store.id, line: d.line, ...sub, setup: { done: true } });
    // التجديد بالأسعار الجديدة: رسالة تحويل الباقة ما عادش لها لزوم
    if (d.line === "store") await t.update(stores).set({ planNotice: null }).where(eq(stores.id, store.id));
    await syncStoreColumns(t, store.id);
    return periodEnd;
  });
  await writeAudit(db, { actorUserId: actor.id, storeId: store.id, action: "subscription.payment", entityType: "store", entityId: store.id, meta: { line: d.line, plan: plan.slug, cycle: d.cycle, addons: snapshot, amount: d.amount, method: d.method, periodEnd: result } });
  return ok({ store: { id: store.id, slug: store.slug }, periodEnd: result });
}

const daysSchema = z.number({ error: "اكتب عدد الأيام" }).int("عدد الأيام لازم يكون رقم صحيح").min(1, "على الأقل يوم").max(365, "الحد الأقصى 365 يوم");

/** تمديد التجربة المجانية لمنظومة (للي في التجربة أو المنتهية فقط) */
export async function extendTrial(db: Db, storeId: string, daysInput: unknown, actor: Actor, now = Date.now(), line: ProductLine = "store"): Promise<Result<{ store: TouchedStore; trialEndsAt: number }>> {
  const days = daysSchema.safeParse(daysInput);
  if (!days.success) return fail(firstError(days.error));
  const store = await db.select().from(stores).where(eq(stores.id, storeId)).get();
  if (!store) return fail("ما لقينا المتجر. يمكن انحذف، حدّث الصفحة.");
  const out = await writeTransaction(db, async (tx) => {
    const t = tx as unknown as Db;
    const cur = await lineRow(t, storeId, line);
    if (!cur) return fail(`النشاط مش مشترك في ${label(line)}.`);
    if (computeLineState(cur, now).state === "active") return fail(`${label(line)} مشترك فعلياً. استعمل «تسجيل دفعة» بدل تمديد التجربة.`);
    const base = Math.max(now, cur.trialEndsAt?.getTime() ?? now);
    const trialEndsAt = base + days.data * DAY;
    await t.update(lineSubscriptions).set({ trialEndsAt: new Date(trialEndsAt), status: cur.status === "suspended" ? "suspended" : "trial", updatedAt: new Date(now) }).where(eq(lineSubscriptions.id, cur.id));
    await syncStoreColumns(t, storeId);
    return ok(trialEndsAt);
  });
  if (!out.ok) return out;
  await writeAudit(db, { actorUserId: actor.id, storeId, action: "store.extend_trial", entityType: "store", entityId: storeId, meta: { line, days: days.data, trialEndsAt: out.data } });
  return ok({ store: { id: store.id, slug: store.slug }, trialEndsAt: out.data });
}

/** الحالة المنطقية بعد رفع الإيقاف: نشط/تجريبي/منتهي حسب التواريخ */
const unsuspendedStatus = (r: Pick<SubRow, "currentPeriodEnd" | "trialEndsAt">, now: number): LineState =>
  r.currentPeriodEnd && r.currentPeriodEnd.getTime() > now ? "active" : r.trialEndsAt && r.trialEndsAt.getTime() > now ? "trial" : "expired";

/**
 * إيقاف/تفعيل النشاط (كل منظوماته)، أو منظومة وحدة لو line محددة.
 * التفعيل يرجّع الحالة المنطقية (نشط/تجريبي/منتهي) حسب التواريخ.
 */
export async function setSuspended(db: Db, storeId: string, suspended: boolean, actor: Actor, reason?: string | null, now = Date.now(), line?: ProductLine): Promise<Result<{ store: TouchedStore; status: string }>> {
  const store = await db.select().from(stores).where(eq(stores.id, storeId)).get();
  if (!store) return fail("ما لقينا المتجر. يمكن انحذف، حدّث الصفحة.");
  const out = await writeTransaction(db, async (tx) => {
    const t = tx as unknown as Db;
    await lineRow(t, storeId, "store"); // نشاط قديم: ينشئ سطر المتجر
    const rows = (await t.select().from(lineSubscriptions).where(eq(lineSubscriptions.storeId, storeId))).filter((r) => !line || r.line === line);
    if (!rows.length) return fail(line ? `النشاط مش مشترك في ${label(line)}.` : "النشاط ما عندوش أي اشتراك.");
    const isSuspended = rows.every((r) => r.status === "suspended");
    if (!suspended && !isSuspended) return fail(line ? `${label(line)} مش موقوف.` : "المتجر مش موقوف.");
    if (suspended && isSuspended) return fail(line ? `${label(line)} موقوف من قبل.` : "المتجر موقوف من قبل.");
    let status: LineState = "suspended";
    for (const r of rows) {
      const next = suspended ? "suspended" : r.status === "suspended" ? unsuspendedStatus(r, now) : r.status;
      await t.update(lineSubscriptions).set({ status: next, updatedAt: new Date(now) }).where(eq(lineSubscriptions.id, r.id));
      if (r.line === "store" || rows.length === 1) status = next;
    }
    await syncStoreColumns(t, storeId);
    return ok(status);
  });
  if (!out.ok) return out;
  await writeAudit(db, { actorUserId: actor.id, storeId, action: suspended ? "store.suspend" : "store.unsuspend", entityType: "store", entityId: storeId, meta: { reason: reason?.trim().slice(0, 200) || null, status: out.data, line: line ?? null } });
  return ok({ store: { id: store.id, slug: store.slug }, status: out.data });
}

/** تغيير باقة منظومة يدوياً بدون دفعة (هدية/تصحيح). الباقة لازم تكون من نفس المنظومة. */
export async function changePlan(db: Db, storeId: string, planId: string, actor: Actor): Promise<Result<{ store: TouchedStore }>> {
  const [store, plan] = await Promise.all([db.select().from(stores).where(eq(stores.id, storeId)).get(), db.select().from(plans).where(eq(plans.id, planId)).get()]);
  if (!store) return fail("ما لقينا المتجر. يمكن انحذف، حدّث الصفحة.");
  if (!plan) return fail("ما لقينا الباقة. يمكن انحذف، حدّث الصفحة.");
  const out = await writeTransaction(db, async (tx) => {
    const t = tx as unknown as Db;
    const cur = await lineRow(t, storeId, plan.line);
    // الباقة المجانية للأبد: المنظومة تولي نشطة بدون تاريخ انتهاء (إلا لو موقوفة)
    const patch = plan.isFree ? { planId, status: cur?.status === "suspended" ? ("suspended" as const) : ("active" as const), currentPeriodEnd: null } : { planId };
    if (cur) await t.update(lineSubscriptions).set(patch).where(eq(lineSubscriptions.id, cur.id));
    else return fail(`النشاط مش مشترك في ${label(plan.line)}. سجّل دفعة أو ابدا تجربة.`);
    if (plan.isFree && plan.line === "store") await t.update(stores).set({ planNotice: null }).where(eq(stores.id, storeId));
    await syncStoreColumns(t, storeId);
    return ok(cur.planId);
  });
  if (!out.ok) return out;
  await writeAudit(db, { actorUserId: actor.id, storeId, action: "store.change_plan", entityType: "store", entityId: storeId, meta: { line: plan.line, from: out.data, to: planId, plan: plan.slug } });
  return ok({ store: { id: store.id, slug: store.slug } });
}

/** الأدمن يفتح منظومة لنشاط موجود (تجربة بالأيام الافتراضية للمنظومة) */
export async function adminStartTrial(db: Db, storeId: string, line: ProductLine, actor: Actor): Promise<Result<{ store: TouchedStore }>> {
  const store = await db.select().from(stores).where(eq(stores.id, storeId)).get();
  if (!store) return fail("ما لقينا المتجر. يمكن انحذف، حدّث الصفحة.");
  if (line === "store") await writeTransaction(db, async (tx) => void (await lineRow(tx as unknown as Db, storeId, "store")));
  const r = await startLineTrial(db, storeId, line, { setup: { done: false } });
  if (!r.ok) return r;
  await writeAudit(db, { actorUserId: actor.id, storeId, action: "line.start_trial", entityType: "store", entityId: storeId, meta: { line, trialEndsAt: r.data.trialEndsAt } });
  return ok({ store: { id: store.id, slug: store.slug } });
}

export type ExpiringStore = { id: string; slug: string; name: string; ownerName: string; ownerPhone: string; line: ProductLine; planName: string | null; state: "trial" | "active" | "expired"; daysLeft: number; endsAt: number };

/** اشتراكات منظومات قربت تخلص (≤ withinDays) أو انتهت خلال آخر graceDays: للتنبيه برسالة واتساب (سطر لكل منظومة) */
export async function listExpiring(db: Db, opts: { withinDays?: number; graceDays?: number; line?: ProductLine } = {}, now = Date.now()): Promise<ExpiringStore[]> {
  const within = opts.withinDays ?? 5, grace = opts.graceDays ?? 7;
  const rows = await db
    .select({ s: stores, sub: lineSubscriptions, ownerName: users.name, ownerPhone: users.phone, planName: plans.nameAr })
    .from(lineSubscriptions).innerJoin(stores, eq(stores.id, lineSubscriptions.storeId)).innerJoin(users, eq(users.id, stores.ownerUserId)).leftJoin(plans, eq(plans.id, lineSubscriptions.planId))
    .where(and(ne(lineSubscriptions.status, "suspended"), sql`${stores.onboardedAt} IS NOT NULL`, opts.line ? eq(lineSubscriptions.line, opts.line) : undefined));
  const out: ExpiringStore[] = [];
  for (const r of rows) {
    const end = r.sub.status === "trial" ? r.sub.trialEndsAt : r.sub.currentPeriodEnd;
    if (!end) continue;
    const left = Math.ceil((end.getTime() - now) / DAY);
    if (left > within || left < -grace) continue;
    out.push({ id: r.s.id, slug: r.s.slug, name: r.s.name, ownerName: r.ownerName, ownerPhone: r.ownerPhone, line: r.sub.line, planName: r.planName, state: left <= 0 ? "expired" : r.sub.status === "trial" ? "trial" : "active", daysLeft: left, endsAt: end.getTime() });
  }
  return out.sort((a, b) => a.endsAt - b.endsAt);
}

export async function listPayments(db: Db, opts: { storeId?: string; line?: ProductLine; page?: number; pageSize?: number } = {}) {
  const size = Math.min(opts.pageSize ?? 25, 100);
  const c = [opts.storeId ? eq(subscriptionPayments.storeId, opts.storeId) : undefined, opts.line ? eq(subscriptionPayments.line, opts.line) : undefined].filter(Boolean);
  const where = c.length ? and(...c) : undefined;
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(subscriptionPayments).where(where);
  const pageCount = Math.max(1, Math.ceil(n / size));
  const page = Math.min(Math.max(1, opts.page ?? 1), pageCount);
  const rows = await db
    .select({ p: subscriptionPayments, storeName: stores.name, storeSlug: stores.slug, planName: plans.nameAr, recorder: users.name })
    .from(subscriptionPayments).innerJoin(stores, eq(stores.id, subscriptionPayments.storeId)).innerJoin(plans, eq(plans.id, subscriptionPayments.planId)).innerJoin(users, eq(users.id, subscriptionPayments.recordedBy))
    .where(where).orderBy(desc(subscriptionPayments.createdAt), asc(subscriptionPayments.id)).limit(size).offset((page - 1) * size);
  return {
    total: n, page, pageCount,
    items: rows.map((r) => ({ id: r.p.id, storeId: r.p.storeId, line: r.p.line, storeName: r.storeName, storeSlug: r.storeSlug, planName: r.planName, billingCycle: r.p.billingCycle, amount: r.p.amount, method: r.p.method, receiptMediaId: r.p.receiptMediaId, periodStart: r.p.periodStart.getTime(), periodEnd: r.p.periodEnd.getTime(), note: r.p.note, recordedBy: r.recorder, createdAt: r.p.createdAt.getTime() })),
  };
}

