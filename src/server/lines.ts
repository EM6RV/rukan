// اشتراكات المنظومات: القراءة (lineAccess) والتجربة ونسخ سطر «store» لأعمدة stores القديمة.
import { and, eq } from "drizzle-orm";
import { writeTransaction, type Db } from "@/db";
import { addons, lineSubscriptions, plans, storeAddons, stores, type LineSetup, type PlanLimits } from "@/db/schema/platform";
import { combineLimits, effectiveLimits } from "@/lib/entitlements";
import { NO_STORE_LIMITS } from "@/lib/plan-catalog";
import { FALLBACK_LIMITS } from "@/lib/plan-limits";
import {
  DEFAULT_LINE_LAUNCH, DEFAULT_LINE_TRIAL_DAYS, DEFAULT_LINE_TRIAL_PLAN, LINE_INFO, PRODUCT_LINES,
  type LineLaunch, type ProductLine,
} from "@/lib/product-lines";
import { DEFAULT_TRIAL_PLAN_SLUG } from "@/lib/constants";
import { fail, ok, type Result } from "./catalog/result";
import { computeLineState, notSubscribed, type LineAccess, type LineState } from "./line-access";
import { getPlatformSetting } from "./platform-settings";
import type { Store } from "./types";

const DAY = 86_400_000;
export type BusinessLines = Record<ProductLine, LineAccess>;

type Row = {
  line: ProductLine; status: LineState; trialEndsAt: Date | null; currentPeriodEnd: Date | null;
  billingCycle: LineAccess["cycle"]; planId: string | null;
  plan: { slug: string; nameAr: string; limits: PlanLimits; durationPerks: typeof plans.$inferSelect.durationPerks } | null;
};

/** كل منظومات النشاط بحالتها وحدودها الفعلية (استعلامين بس) */
export async function loadLines(db: Db, store: Pick<Store, "id" | "status" | "planId" | "billingCycle" | "trialEndsAt" | "currentPeriodEnd">, now = Date.now(), opts: { openShiftStartedAt?: Partial<Record<ProductLine, number | null>> } = {}): Promise<BusinessLines> {
  const [subs, addonRows] = await Promise.all([
    db.select({ s: lineSubscriptions, plan: plans }).from(lineSubscriptions).leftJoin(plans, eq(plans.id, lineSubscriptions.planId)).where(eq(lineSubscriptions.storeId, store.id)),
    db.select({ line: storeAddons.line, kind: addons.kind, units: addons.units, quantity: storeAddons.quantity })
      .from(storeAddons).innerJoin(addons, eq(addons.id, storeAddons.addonId))
      .where(and(eq(storeAddons.storeId, store.id), eq(addons.isActive, true))),
  ]);
  let rows: Row[] = subs.map(({ s, plan }) => ({ line: s.line, status: s.status, trialEndsAt: s.trialEndsAt, currentPeriodEnd: s.currentPeriodEnd, billingCycle: s.billingCycle, planId: s.planId, plan }));
  // نشاط قديم بدون أي سطر (بيانات قبل الـ migration أو اختبارات): أعمدة stores هي اشتراك المتجر
  if (!rows.length) {
    const plan = store.planId ? (await db.select().from(plans).where(eq(plans.id, store.planId)).get()) ?? null : null;
    rows = [{ line: "store", status: store.status, trialEndsAt: store.trialEndsAt, currentPeriodEnd: store.currentPeriodEnd, billingCycle: store.billingCycle, planId: store.planId, plan }];
  }
  const out = Object.fromEntries(PRODUCT_LINES.map((l) => [l, notSubscribed(l)])) as BusinessLines;
  for (const r of rows) {
    const limits = effectiveLimits(r.plan?.limits ?? (r.line === "store" ? FALLBACK_LIMITS : NO_STORE_LIMITS), {
      cycle: r.billingCycle, perks: r.plan?.durationPerks, addons: addonRows.filter((a) => a.line === r.line),
    });
    out[r.line] = {
      line: r.line, subscribed: true, ...computeLineState(r, now, { openShiftStartedAt: opts.openShiftStartedAt?.[r.line] }),
      planId: r.planId, planSlug: r.plan?.slug ?? null, planName: r.plan?.nameAr ?? null, cycle: r.billingCycle, limits,
      trialEndsAt: r.trialEndsAt?.getTime() ?? null, periodEnd: r.currentPeriodEnd?.getTime() ?? null,
    };
  }
  return out;
}

/** منظومة وحدة (لكل صفحة وأكشن في المنظومة: يتفحص في السيرفر) */
export async function lineAccess(db: Db, storeId: string, line: ProductLine, now = Date.now(), opts: { openShiftStartedAt?: number | null } = {}): Promise<LineAccess> {
  const store = await db.select().from(stores).where(eq(stores.id, storeId)).get();
  if (!store) return notSubscribed(line);
  return (await loadLines(db, store, now, { openShiftStartedAt: { [line]: opts.openShiftStartedAt ?? null } }))[line];
}

export const subscribedLines = (lines: BusinessLines): ProductLine[] => PRODUCT_LINES.filter((l) => lines[l].subscribed);

/** حدود النشاط كامل (مميزات المتجر من اشتراك store، والموارد المشتركة الأوسع بين المنظومات) */
export function businessLimits(lines: BusinessLines): PlanLimits {
  const others = PRODUCT_LINES.filter((l) => l !== "store" && lines[l].subscribed).map((l) => lines[l].limits!);
  return combineLimits(lines.store.subscribed ? lines.store.limits : null, others, NO_STORE_LIMITS);
}

// ===== الإطلاق والتجربة =====

/** حالة إطلاق كل منظومة (الأدمن يغيّرها من الإعدادات) */
export async function lineLaunch(db: Db): Promise<Record<ProductLine, LineLaunch>> {
  const saved = await getPlatformSetting<Partial<Record<ProductLine, LineLaunch>>>(db, "line_launch", {});
  return { ...DEFAULT_LINE_LAUNCH, ...saved, store: "live" };
}

/** المنظومات اللي يقدر النشاط يشترك فيها: المطلقة للكل + اللي فتحها الأدمن له كتجربة */
export const availableLines = (launch: Record<ProductLine, LineLaunch>, beta: readonly ProductLine[] = []): ProductLine[] =>
  PRODUCT_LINES.filter((l) => launch[l] === "live" || beta.includes(l));

export const trialDaysKey = (line: ProductLine) => (line === "store" ? "trial_days" : `trial_days_${line}`);
export const trialPlanKey = (line: ProductLine) => (line === "store" ? "trial_plan_slug" : `trial_plan_slug_${line}`);

export async function lineTrialDays(db: Db, line: ProductLine): Promise<number> {
  return getPlatformSetting<number>(db, trialDaysKey(line), DEFAULT_LINE_TRIAL_DAYS[line]);
}

/** باقة التجربة للمنظومة: من الإعدادات، ولو انحذفت أو مش لنفس المنظومة نرجعوا للافتراضية */
export async function lineTrialPlan(db: Db, line: ProductLine): Promise<{ id: string } | undefined> {
  const slug = await getPlatformSetting<string>(db, trialPlanKey(line), line === "store" ? DEFAULT_TRIAL_PLAN_SLUG : DEFAULT_LINE_TRIAL_PLAN[line]);
  const plan = await db.select({ id: plans.id, line: plans.line }).from(plans).where(eq(plans.slug, slug)).get();
  if (plan?.line === line) return { id: plan.id };
  return db.select({ id: plans.id }).from(plans).where(and(eq(plans.line, line), eq(plans.isActive, true), eq(plans.isFree, false))).orderBy(plans.sortOrder).get();
}

type Tx = Db;

/**
 * أعمدة stores القديمة (status/planId/…) = نسخة من سطر «store». النشاط بدون متجر أونلاين: منتهي
 * (واجهة المتجر مقفولة)، أو موقوف لو كل منظوماته موقوفة. لازم تتنادى بعد أي تغيير في line_subscriptions.
 */
export async function syncStoreColumns(tx: Tx, storeId: string) {
  const rows = await tx.select().from(lineSubscriptions).where(eq(lineSubscriptions.storeId, storeId));
  const store = rows.find((r) => r.line === "store");
  if (store) {
    await tx.update(stores).set({ status: store.status, planId: store.planId, billingCycle: store.billingCycle, trialEndsAt: store.trialEndsAt, currentPeriodEnd: store.currentPeriodEnd }).where(eq(stores.id, storeId));
  } else if (rows.length) {
    const suspended = rows.every((r) => r.status === "suspended");
    await tx.update(stores).set({ status: suspended ? "suspended" : "expired", trialEndsAt: null, currentPeriodEnd: null }).where(eq(stores.id, storeId));
  }
}

/**
 * يبدا تجربة مجانية لمنظومة (أول مرة بس لكل منظومة). يستعمله التسجيل، و«زيد منظومة» في الاشتراك، والأدمن.
 * opts.free: باقة مجانية للأبد (المتجر بس، لو الأدمن أطلقها).
 */
export async function startLineTrial(
  db: Db, storeId: string, line: ProductLine,
  opts: { now?: number; setup?: LineSetup; planId?: string; free?: boolean; available?: readonly ProductLine[] } = {},
): Promise<Result<{ trialEndsAt: number | null }>> {
  const now = opts.now ?? Date.now();
  if (opts.available && !opts.available.includes(line)) return fail(`${LINE_INFO[line].brand} لسه قريباً.`);
  const existing = await db.select({ id: lineSubscriptions.id }).from(lineSubscriptions).where(and(eq(lineSubscriptions.storeId, storeId), eq(lineSubscriptions.line, line))).get();
  if (existing) return fail(`نشاطك مشترك في ${LINE_INFO[line].brand} من قبل.`);
  const plan = opts.planId ? { id: opts.planId } : await lineTrialPlan(db, line);
  if (!plan) return fail(`ما فيش باقات لـ ${LINE_INFO[line].brand} حالياً. كلّم الدعم.`);
  const trialEndsAt = opts.free ? null : now + (await lineTrialDays(db, line)) * DAY;
  await writeTransaction(db, async (tx) => {
    const t = tx as unknown as Db;
    await t.insert(lineSubscriptions).values({
      storeId, line, planId: plan.id, status: opts.free ? "active" : "trial",
      trialEndsAt: trialEndsAt === null ? null : new Date(trialEndsAt), setup: opts.setup ?? {},
    });
    await syncStoreColumns(t, storeId);
  });
  return ok({ trialEndsAt });
}

/** يشيل منظومة ما بداش فيها (أثناء التسجيل بس: قبل ما يخلص المعالج، ومافيش دفعات عليها) */
export async function removeLineDuringOnboarding(db: Db, storeId: string, line: ProductLine): Promise<Result> {
  await writeTransaction(db, async (tx) => {
    const t = tx as unknown as Db;
    await t.delete(lineSubscriptions).where(and(eq(lineSubscriptions.storeId, storeId), eq(lineSubscriptions.line, line)));
    await syncStoreColumns(t, storeId);
  });
  return ok(undefined);
}

/** يحفظ إجابات المعالج القصير للمنظومة */
export async function saveLineSetup(db: Db, storeId: string, line: ProductLine, setup: LineSetup): Promise<Result> {
  const [row] = await db.update(lineSubscriptions).set({ setup }).where(and(eq(lineSubscriptions.storeId, storeId), eq(lineSubscriptions.line, line))).returning({ id: lineSubscriptions.id });
  return row ? ok(undefined) : fail("ما لقينا اشتراك المنظومة. ارجع للخطوة الأولى.");
}

export async function lineSetups(db: Db, storeId: string): Promise<Partial<Record<ProductLine, LineSetup>>> {
  const rows = await db.select({ line: lineSubscriptions.line, setup: lineSubscriptions.setup }).from(lineSubscriptions).where(eq(lineSubscriptions.storeId, storeId));
  return Object.fromEntries(rows.map((r) => [r.line, r.setup]));
}
