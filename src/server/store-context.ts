import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { storeMembers, stores, type PlanLimits } from "@/db/schema/platform";
import { businessAccess } from "./line-access";
import { businessLimits, loadLines, type BusinessLines } from "./lines";
import type { MemberRole } from "@/lib/constants";
import { LINE_INFO, type ProductLine } from "@/lib/product-lines";
import { getCurrentUser } from "./auth/current";
import { hasPermission, homeForCtx, isAssignable, type Permission } from "./permissions";
import type { StoreAccess } from "./store-access";
import { forStore, t, type StoreScope } from "./tenant";
import type { Store } from "./types";
import type { SessionUser } from "./auth/session";

export type StoreContext = {
  user: SessionUser;
  store: Store;
  role: MemberRole;
  /** صلاحيات الدور المخصص (null = حسب role) */
  customPermissions: Permission[] | null;
  scope: StoreScope;
  /** حدود النشاط: مميزات المتجر الأونلاين من اشتراكه، والموارد المشتركة (موظفين/مخازن/فروع/وحدات) الأوسع بين المنظومات */
  limits: PlanLimits;
  planName: string | null;
  /** وصول النشاط للوحة (المتجر لو مشترك فيه، وإلا أحسن منظومة) */
  access: StoreAccess;
  /** كل منظومة بحالتها وحدودها (lineAccess) */
  lines: BusinessLines;
};

/** متجر المستخدم الحالي (واجهة اللوحة تعرض متجر واحد لكل مستخدم حالياً: المالك أولاً). */
export const loadStoreContext = cache(async (): Promise<StoreContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = getDb();
  const rows = await db
    .select({ store: stores, role: storeMembers.role, customRoleId: storeMembers.customRoleId })
    .from(storeMembers)
    .innerJoin(stores, eq(stores.id, storeMembers.storeId))
    .where(eq(storeMembers.userId, user.id))
    .orderBy(asc(storeMembers.createdAt))
    .limit(5);
  const row = rows.find((r) => r.role === "owner") ?? rows[0];
  if (!row) return null;
  const scope = forStore(db, row.store.id);
  const customRole = row.customRoleId ? (await scope.from(t.storeRoles, eq(t.storeRoles.id, row.customRoleId)).limit(1))[0] : undefined;
  const lines = await loadLines(db, row.store);
  const named = lines.store.subscribed ? lines.store : Object.values(lines).find((l) => l.subscribed);
  return {
    user,
    store: row.store,
    role: row.role,
    customPermissions: customRole ? customRole.permissions.filter(isAssignable) : null,
    scope,
    limits: businessLimits(lines),
    planName: named?.planName ?? null,
    access: businessAccess(lines),
    lines,
  };
});

/** للصفحات: يحول للمكان الصحيح لو المستخدم ما عندوش متجر/ما خلصش الإعداد/ما عندوش صلاحية. */
export async function requireStoreContext(permission: Permission | null, opts: { allowUnfinishedOnboarding?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ctx = await loadStoreContext();
  if (!ctx || (!opts.allowUnfinishedOnboarding && !ctx.store.onboardedAt)) redirect("/onboarding");
  if (permission && !hasPermission(ctx, permission)) redirect(homeForCtx(ctx));
  return ctx;
}

export type ActionContextResult = { ok: true; ctx: StoreContext } | { ok: false; error: string };

/** للـ server actions والـ API: يرجع خطأ عربي بدل redirect. write=true يمنع الكتابة لو الاشتراك منتهي/موقوف. */
export async function actionContext(
  permission: Permission,
  opts: { write?: boolean; allowUnfinishedOnboarding?: boolean } = {},
): Promise<ActionContextResult> {
  const ctx = await loadStoreContext();
  if (!ctx) return { ok: false, error: "انتهت الجلسة. سجّل دخولك من جديد." };
  if (!opts.allowUnfinishedOnboarding && !ctx.store.onboardedAt) return { ok: false, error: "كمّل إعداد متجرك أول." };
  if (!hasPermission(ctx, permission)) return { ok: false, error: "ما عندكش صلاحية للإجراء هذا. كلّم مدير المتجر." };
  if (opts.write && !ctx.access.writable) {
    return {
      ok: false,
      error: ctx.access.state === "suspended" ? "متجرك موقوف. تواصل مع الدعم." : "انتهت فترة اشتراكك. جدّد الاشتراك لتكمل التعديل.",
    };
  }
  return { ok: true, ctx };
}

// ===== المنظومات (ماركت/بلاي/فِت/المتجر) =====

/** للصفحات داخل منظومة: لازم النشاط مشترك فيها (حتى لو منتهية: القراءة مسموحة) */
export async function requireLineContext(line: ProductLine, permission: Permission | null) {
  const ctx = await requireStoreContext(permission);
  if (!ctx.lines[line].subscribed) redirect(`/dashboard/lines?add=${line}`);
  return ctx;
}

/**
 * للأكشنات داخل منظومة: النشاط مشترك فيها، و write=true يمنع الكتابة لو اشتراكها منتهي/موقوف.
 * pos=true (البيع في الكاشير): يسمح لين تتقفل الوردية اللي فُتحت قبل الانتهاء.
 */
export async function lineActionContext(line: ProductLine, permission: Permission, opts: { write?: boolean; pos?: boolean } = {}): Promise<ActionContextResult> {
  const auth = await actionContext(permission);
  if (!auth.ok) return auth;
  const l = auth.ctx.lines[line];
  const brand = LINE_INFO[line].brand;
  if (!l.subscribed) return { ok: false, error: `نشاطك مش مشترك في ${brand}.` };
  if (opts.write && !(opts.pos ? l.posWritable : l.writable)) {
    return { ok: false, error: l.state === "suspended" ? `${brand} موقوف لنشاطك. تواصل مع الدعم.` : `انتهى اشتراك ${brand}. جدّد اشتراكك باش تكمل.` };
  }
  return auth;
}
