// أدوار مخصصة: البياع يعمل دور بصلاحيات محددة (وحدة وحدة) ويعيّنه لموظفين. ميزة باقة (customRoles).
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { storeMembers, type PlanLimits } from "@/db/schema/platform";
import { canUse } from "@/lib/entitlements";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "./catalog/result";
import { isUniqueViolation } from "./db-errors";
import { ASSIGNABLE_PERMISSIONS, isAssignable, type Permission } from "./permissions";
import { t, type StoreScope } from "./tenant";

export type CustomRole = { id: string; name: string; permissions: Permission[]; memberCount: number };

export async function listRoles(db: Db, scope: StoreScope): Promise<CustomRole[]> {
  const roles = await scope.from(t.storeRoles).orderBy(t.storeRoles.createdAt);
  if (!roles.length) return [];
  const members = await db.select({ customRoleId: storeMembers.customRoleId }).from(storeMembers).where(eq(storeMembers.storeId, scope.storeId));
  return roles.map((r) => ({ id: r.id, name: r.name, permissions: r.permissions.filter(isAssignable), memberCount: members.filter((m) => m.customRoleId === r.id).length }));
}

const roleSchema = z.object({
  id: z.string().optional(),
  name: z.string({ error: "اكتب اسم الدور" }).trim().min(1, "اكتب اسم الدور").max(40, "اسم الدور طويل"),
  permissions: z.array(z.string()).min(1, "اختار صلاحية وحدة على الأقل").refine((p) => p.every(isAssignable), "صلاحية غير صحيحة")
    .transform((p) => [...new Set(p)]),
}).refine((r) => r.permissions.includes("dashboard") || r.permissions.includes("orders"), { message: "الدور لازم يشمل «الرئيسية» أو «الطلبيات» على الأقل", path: ["permissions"] });

export async function saveRole(scope: StoreScope, limits: Pick<PlanLimits, "customRoles">, input: unknown): Promise<Result<{ id: string }>> {
  if (!canUse(limits, "customRoles")) return fail("الأدوار المخصصة مش في باقتك. رقّي باقتك لتفعلها.");
  const p = roleSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...data } = p.data;
  try {
    if (id) {
      const [row] = await scope.update(t.storeRoles, data, eq(t.storeRoles.id, id));
      return row ? ok({ id: row.id }) : fail("ما لقينا الدور. حدّث الصفحة.");
    }
    const [row] = await scope.insert(t.storeRoles, data);
    return ok({ id: row!.id });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("عندك دور بنفس الاسم.");
    throw e;
  }
}

/** حذف دور: الموظفين اللي عليه يرجعون «موظف طلبيات» (أقل صلاحيات) بدل ما يضيع حسابهم */
export async function deleteRole(db: Db, scope: StoreScope, id: string): Promise<Result> {
  const [role] = await scope.from(t.storeRoles, eq(t.storeRoles.id, id)).limit(1);
  if (!role) return fail("ما لقينا الدور. حدّث الصفحة.");
  await db.update(storeMembers).set({ customRoleId: null, role: "orders_staff" }).where(and(eq(storeMembers.storeId, scope.storeId), eq(storeMembers.customRoleId, id)));
  await scope.delete(t.storeRoles, eq(t.storeRoles.id, id));
  return ok(undefined);
}

export { ASSIGNABLE_PERMISSIONS };
