import { removeUserPushSubscriptions } from "./push";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { writeTransaction, type Db } from "@/db";
import { storeMembers, users, type PlanLimits } from "@/db/schema/platform";
import type { MemberRole } from "@/lib/constants";
import { firstError, nameSchema, passwordSchema, phoneSchema } from "@/lib/validation";
import { writeAudit } from "./audit";
import { destroyAllUserSessions } from "./auth/session";
import { hashPassword } from "./auth/password";
import { fail, ok, type Result } from "./catalog/result";
import { isUniqueViolation } from "./db-errors";
import { forStore, t } from "./tenant";

import { STAFF_ROLES, type StaffRole } from "@/lib/staff-roles";
import { canUse } from "@/lib/entitlements";

export type StaffMember = { id: string; userId: string; name: string; phone: string; role: MemberRole; customRoleId: string | null; createdAt: number; isBlocked: boolean; hasPin: boolean; branchIds: string[] | null };

export async function listStaff(db: Db, storeId: string): Promise<StaffMember[]> {
  const rows = await db
    .select({ id: storeMembers.id, userId: users.id, name: users.name, phone: users.phone, role: storeMembers.role, customRoleId: storeMembers.customRoleId, createdAt: storeMembers.createdAt, status: users.status, pinHash: storeMembers.pinHash, branchIds: storeMembers.branchIds })
    .from(storeMembers).innerJoin(users, eq(users.id, storeMembers.userId))
    .where(eq(storeMembers.storeId, storeId)).orderBy(asc(storeMembers.createdAt));
  return rows.map((r) => ({ id: r.id, userId: r.userId, name: r.name, phone: r.phone, role: r.role, customRoleId: r.customRoleId, createdAt: r.createdAt.getTime(), isBlocked: r.status === "blocked", hasPin: !!r.pinHash, branchIds: r.branchIds ?? null }))
    .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));
}

const roleField = z.string({ error: "اختار الصلاحية" }).refine((v) => (STAFF_ROLES as readonly string[]).includes(v) || /^custom:[\w-]{1,40}$/.test(v), "اختار الصلاحية");
const addSchema = z.object({ name: nameSchema, phone: phoneSchema, password: passwordSchema, role: roleField });

/** «custom:<id>» = دور مخصص (يتحقق إنه من نفس المتجر وإن الباقة تسمح)، وإلا دور أساسي */
async function resolveRole(db: Db, storeId: string, raw: string, limits: Pick<PlanLimits, "customRoles">): Promise<Result<{ role: StaffRole; customRoleId: string | null }>> {
  if (!raw.startsWith("custom:")) return ok({ role: raw as StaffRole, customRoleId: null });
  if (!canUse(limits, "customRoles")) return fail("الأدوار المخصصة مش في باقتك.");
  const id = raw.slice(7);
  const [role] = await forStore(db, storeId).from(t.storeRoles, eq(t.storeRoles.id, id)).limit(1);
  return role ? ok({ role: "orders_staff" as StaffRole, customRoleId: role.id }) : fail("الدور غير موجود. حدّث الصفحة.");
}

export const staffQuota = (limits: Pick<PlanLimits, "maxStaff">, current: number) => ({ max: limits.maxStaff, canAdd: limits.maxStaff === null || current < limits.maxStaff });

/** ينشئ حساب موظف جديد (الرقم لازم يكون غير مسجّل) ويربطه بالمتجر. */
export async function addStaff(db: Db, storeId: string, actorUserId: string, input: unknown, limits: Pick<PlanLimits, "maxStaff" | "customRoles">): Promise<Result<{ memberId: string }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { name, phone, password } = parsed.data;
  const resolved = await resolveRole(db, storeId, parsed.data.role, limits as PlanLimits);
  if (!resolved.ok) return fail(resolved.error);
  const { role, customRoleId } = resolved.data;
  if (await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).get()) return fail("هذا الرقم مسجّل بحساب ثاني. استعمل رقم مختلف للموظف.");
  const passwordHash = await hashPassword(password);

  try {
    const memberId = await writeTransaction(db, async (tx) => {
      const d = tx as unknown as Db;
      const staff = await d.select({ id: storeMembers.id }).from(storeMembers).where(and(eq(storeMembers.storeId, storeId), ne(storeMembers.role, "owner")));
      if (!staffQuota(limits, staff.length).canAdd) throw new QuotaError(limits.maxStaff ?? 0);
      const [u] = await d.insert(users).values({ name, phone, passwordHash }).returning({ id: users.id });
      const [m] = await d.insert(storeMembers).values({ storeId, userId: u!.id, role, customRoleId }).returning({ id: storeMembers.id });
      if (role === "courier") await forStore(d, storeId).insert(t.couriers, { name, phone, kind: "person", userId: u!.id });
      return m!.id;
    });
    await writeAudit(db, { actorUserId, storeId, action: "staff.add", entityType: "member", entityId: memberId, meta: { role, phone } });
    return ok({ memberId });
  } catch (e) {
    if (e instanceof QuotaError) return fail(`باقتك تسمح بـ ${e.max} ${e.max === 1 ? "موظف" : "موظفين"} فقط. رقّي الباقة لإضافة المزيد.`);
    if (isUniqueViolation(e)) return fail("هذا الرقم مسجّل بحساب ثاني. استعمل رقم مختلف للموظف.");
    throw e;
  }
}
class QuotaError extends Error { constructor(public max: number) { super("quota"); } }

async function loadMember(db: Db, storeId: string, memberId: string, actorUserId: string) {
  const m = await db.select({ id: storeMembers.id, userId: storeMembers.userId, role: storeMembers.role, customRoleId: storeMembers.customRoleId, name: users.name, phone: users.phone })
    .from(storeMembers).innerJoin(users, eq(users.id, storeMembers.userId)).where(and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId))).get();
  if (!m) return { error: "ما لقينا الموظف. يمكن انحذف، حدّث الصفحة." as const };
  if (m.role === "owner") return { error: "ما ينفعش تعدّل حساب المالك." as const };
  if (m.userId === actorUserId) return { error: "ما ينفعش تعدّل حسابك أنت." as const };
  return { m };
}

export async function changeStaffRole(db: Db, storeId: string, actorUserId: string, memberId: string, role: unknown, limits: Pick<PlanLimits, "customRoles"> = { customRoles: false }): Promise<Result> {
  const parsedRole = roleField.safeParse(role);
  if (!parsedRole.success) return fail(firstError(parsedRole.error));
  const resolved = await resolveRole(db, storeId, parsedRole.data, limits as PlanLimits);
  if (!resolved.ok) return fail(resolved.error);
  const r = { data: resolved.data.role };
  const customRoleId = resolved.data.customRoleId;
  const found = await loadMember(db, storeId, memberId, actorUserId);
  if (!found.m) return fail(found.error);
  const { m } = found;
  if (m.role === r.data && m.customRoleId === customRoleId) return ok(undefined);

  await writeTransaction(db, async (tx) => {
    const d = tx as unknown as Db;
    const s = forStore(d, storeId);
    await d.update(storeMembers).set({ role: r.data, customRoleId }).where(eq(storeMembers.id, memberId));
    const [linked] = await s.from(t.couriers, eq(t.couriers.userId, m.userId)).limit(1);
    if (r.data === "courier" && !linked) await s.insert(t.couriers, { name: m.name, phone: m.phone, kind: "person", userId: m.userId });
    if (r.data !== "courier" && linked) await s.update(t.couriers, { userId: null }, eq(t.couriers.id, linked.id));
  });
  await removeUserPushSubscriptions(db, storeId, m.userId); // الدور تغيّر: يعيد التفعيل من جهازه حسب دوره الجديد
  await writeAudit(db, { actorUserId, storeId, action: "staff.role", entityType: "member", entityId: memberId, meta: { from: m.role, to: r.data } });
  return ok(undefined);
}

export async function resetStaffPassword(db: Db, storeId: string, actorUserId: string, memberId: string, password: unknown): Promise<Result> {
  const p = passwordSchema.safeParse(password);
  if (!p.success) return fail(firstError(p.error));
  const found = await loadMember(db, storeId, memberId, actorUserId);
  if (!found.m) return fail(found.error);
  await db.update(users).set({ passwordHash: await hashPassword(p.data) }).where(eq(users.id, found.m.userId));
  await destroyAllUserSessions(db, found.m.userId);
  await writeAudit(db, { actorUserId, storeId, action: "staff.password", entityType: "member", entityId: memberId });
  return ok(undefined);
}

/** يشيل الموظف من المتجر ويقفل حسابه نهائياً (الحساب ينمسح اسمه ورقمه علشان الرقم يتحرر، والسجل التاريخي يبقى). */
export async function removeStaff(db: Db, storeId: string, actorUserId: string, memberId: string): Promise<Result> {
  const found = await loadMember(db, storeId, memberId, actorUserId);
  if (!found.m) return fail(found.error);
  const { m } = found;
  await writeTransaction(db, async (tx) => {
    const d = tx as unknown as Db;
    await forStore(d, storeId).update(t.couriers, { userId: null }, eq(t.couriers.userId, m.userId));
    await d.delete(storeMembers).where(eq(storeMembers.id, memberId));
    await d.update(users).set({ status: "blocked", passwordHash: "!", name: "موظف سابق", phone: `removed:${m.userId}` }).where(eq(users.id, m.userId));
  });
  await destroyAllUserSessions(db, m.userId);
  await removeUserPushSubscriptions(db, storeId, m.userId);
  await writeAudit(db, { actorUserId, storeId, action: "staff.remove", entityType: "member", entityId: memberId, meta: { role: m.role, phone: m.phone } });
  return ok(undefined);
}
