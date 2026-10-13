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

import { STAFF_ROLES } from "@/lib/staff-roles";

export type StaffMember = { id: string; userId: string; name: string; phone: string; role: MemberRole; createdAt: number; isBlocked: boolean };

export async function listStaff(db: Db, storeId: string): Promise<StaffMember[]> {
  const rows = await db
    .select({ id: storeMembers.id, userId: users.id, name: users.name, phone: users.phone, role: storeMembers.role, createdAt: storeMembers.createdAt, status: users.status })
    .from(storeMembers).innerJoin(users, eq(users.id, storeMembers.userId))
    .where(eq(storeMembers.storeId, storeId)).orderBy(asc(storeMembers.createdAt));
  return rows.map((r) => ({ id: r.id, userId: r.userId, name: r.name, phone: r.phone, role: r.role, createdAt: r.createdAt.getTime(), isBlocked: r.status === "blocked" }))
    .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));
}

const addSchema = z.object({ name: nameSchema, phone: phoneSchema, password: passwordSchema, role: z.enum(STAFF_ROLES, { error: "اختار الصلاحية" }) });

export const staffQuota = (limits: Pick<PlanLimits, "maxStaff">, current: number) => ({ max: limits.maxStaff, canAdd: limits.maxStaff === null || current < limits.maxStaff });

/** ينشئ حساب موظف جديد (الرقم لازم يكون غير مسجّل) ويربطه بالمتجر. */
export async function addStaff(db: Db, storeId: string, actorUserId: string, input: unknown, limits: Pick<PlanLimits, "maxStaff">): Promise<Result<{ memberId: string }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { name, phone, password, role } = parsed.data;
  if (await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).get()) return fail("هذا الرقم مسجّل بحساب ثاني. استعمل رقم مختلف للموظف.");
  const passwordHash = await hashPassword(password);

  try {
    const memberId = await writeTransaction(db, async (tx) => {
      const d = tx as unknown as Db;
      const staff = await d.select({ id: storeMembers.id }).from(storeMembers).where(and(eq(storeMembers.storeId, storeId), ne(storeMembers.role, "owner")));
      if (!staffQuota(limits, staff.length).canAdd) throw new QuotaError(limits.maxStaff ?? 0);
      const [u] = await d.insert(users).values({ name, phone, passwordHash }).returning({ id: users.id });
      const [m] = await d.insert(storeMembers).values({ storeId, userId: u!.id, role }).returning({ id: storeMembers.id });
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
  const m = await db.select({ id: storeMembers.id, userId: storeMembers.userId, role: storeMembers.role, name: users.name, phone: users.phone })
    .from(storeMembers).innerJoin(users, eq(users.id, storeMembers.userId)).where(and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId))).get();
  if (!m) return { error: "الموظف غير موجود." as const };
  if (m.role === "owner") return { error: "ما ينفعش تعدّل حساب المالك." as const };
  if (m.userId === actorUserId) return { error: "ما ينفعش تعدّل حسابك أنت." as const };
  return { m };
}

export async function changeStaffRole(db: Db, storeId: string, actorUserId: string, memberId: string, role: unknown): Promise<Result> {
  const r = z.enum(STAFF_ROLES, { error: "اختار الصلاحية" }).safeParse(role);
  if (!r.success) return fail(firstError(r.error));
  const found = await loadMember(db, storeId, memberId, actorUserId);
  if (!found.m) return fail(found.error);
  const { m } = found;
  if (m.role === r.data) return ok(undefined);

  await writeTransaction(db, async (tx) => {
    const d = tx as unknown as Db;
    const s = forStore(d, storeId);
    await d.update(storeMembers).set({ role: r.data }).where(eq(storeMembers.id, memberId));
    const [linked] = await s.from(t.couriers, eq(t.couriers.userId, m.userId)).limit(1);
    if (r.data === "courier" && !linked) await s.insert(t.couriers, { name: m.name, phone: m.phone, kind: "person", userId: m.userId });
    if (r.data !== "courier" && linked) await s.update(t.couriers, { userId: null }, eq(t.couriers.id, linked.id));
  });
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
  await writeAudit(db, { actorUserId, storeId, action: "staff.remove", entityType: "member", entityId: memberId, meta: { role: m.role, phone: m.phone } });
  return ok(undefined);
}
