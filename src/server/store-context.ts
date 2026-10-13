import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { plans, storeMembers, stores, type PlanLimits } from "@/db/schema/platform";
import { FALLBACK_LIMITS } from "@/lib/plan-limits";
import type { MemberRole } from "@/lib/constants";
import { getCurrentUser } from "./auth/current";
import { can, homeFor, type Permission } from "./permissions";
import { computeStoreAccess } from "./store-access";
import { forStore, type StoreScope } from "./tenant";
import type { Store } from "./types";
import type { SessionUser } from "./auth/session";

export type StoreContext = {
  user: SessionUser;
  store: Store;
  role: MemberRole;
  scope: StoreScope;
  limits: PlanLimits;
  planName: string | null;
  access: ReturnType<typeof computeStoreAccess>;
};

/** متجر المستخدم الحالي (واجهة اللوحة تعرض متجر واحد لكل مستخدم حالياً: المالك أولاً). */
export const loadStoreContext = cache(async (): Promise<StoreContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = getDb();
  const rows = await db
    .select({ store: stores, role: storeMembers.role, plan: plans })
    .from(storeMembers)
    .innerJoin(stores, eq(stores.id, storeMembers.storeId))
    .leftJoin(plans, eq(plans.id, stores.planId))
    .where(eq(storeMembers.userId, user.id))
    .orderBy(asc(storeMembers.createdAt))
    .limit(5);
  const row = rows.find((r) => r.role === "owner") ?? rows[0];
  if (!row) return null;
  return {
    user,
    store: row.store,
    role: row.role,
    scope: forStore(db, row.store.id),
    limits: row.plan?.limits ?? FALLBACK_LIMITS,
    planName: row.plan?.nameAr ?? null,
    access: computeStoreAccess(row.store),
  };
});

/** للصفحات: يحول للمكان الصحيح لو المستخدم ما عندوش متجر/ما خلصش الإعداد/ما عندوش صلاحية. */
export async function requireStoreContext(permission: Permission | null, opts: { allowUnfinishedOnboarding?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ctx = await loadStoreContext();
  if (!ctx || (!opts.allowUnfinishedOnboarding && !ctx.store.onboardedAt)) redirect("/onboarding");
  if (permission && !can(ctx.role, permission)) redirect(homeFor(ctx.role));
  return ctx;
}

export type ActionContextResult = { ok: true; ctx: StoreContext } | { ok: false; error: string };

/** للـ server actions والـ API: يرجع خطأ عربي بدل redirect. write=true يمنع الكتابة لو الاشتراك منتهي/موقوف. */
export async function actionContext(
  permission: Permission,
  opts: { write?: boolean; allowUnfinishedOnboarding?: boolean } = {},
): Promise<ActionContextResult> {
  const ctx = await loadStoreContext();
  if (!ctx) return { ok: false, error: "سجّل دخولك من جديد." };
  if (!opts.allowUnfinishedOnboarding && !ctx.store.onboardedAt) return { ok: false, error: "كمّل إعداد متجرك أول." };
  if (!can(ctx.role, permission)) return { ok: false, error: "ما عندكش صلاحية لهذا الإجراء." };
  if (opts.write && !ctx.access.writable) {
    return {
      ok: false,
      error: ctx.access.state === "suspended" ? "متجرك موقوف. تواصل مع الدعم." : "انتهت فترة اشتراكك. جدّد الاشتراك لتكمل التعديل.",
    };
  }
  return { ok: true, ctx };
}
