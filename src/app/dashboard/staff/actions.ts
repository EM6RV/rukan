"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import type { Result } from "@/server/catalog/result";
import { deleteRole, saveRole } from "@/server/roles";
import { addStaff, changeStaffRole, removeStaff, resetStaffPassword } from "@/server/staff-service";
import { actionContext, type StoreContext } from "@/server/store-context";
import { setMemberBranches, setMemberPin } from "@/server/pos/branches";

async function run<T>(fn: (ctx: StoreContext) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext("staff", { write: true });
  if (!auth.ok) return auth;
  const r = await fn(auth.ctx);
  if (r.ok) revalidatePath("/dashboard/staff");
  return r;
}
const id = z.string().min(1);
const bad = () => ({ ok: false as const, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." });

export async function addStaffAction(input: unknown) {
  return run((c) => addStaff(getDb(), c.store.id, c.user.id, input, c.limits));
}
export async function changeRoleAction(memberId: unknown, role: unknown) {
  const m = id.safeParse(memberId);
  if (!m.success) return bad();
  return run((c) => changeStaffRole(getDb(), c.store.id, c.user.id, m.data, role, c.limits));
}
export async function resetPasswordAction(memberId: unknown, password: unknown) {
  const m = id.safeParse(memberId);
  if (!m.success) return bad();
  return run((c) => resetStaffPassword(getDb(), c.store.id, c.user.id, m.data, password));
}
export async function removeStaffAction(memberId: unknown) {
  const m = id.safeParse(memberId);
  if (!m.success) return bad();
  return run((c) => removeStaff(getDb(), c.store.id, c.user.id, m.data));
}

export async function saveRoleAction(input: unknown) {
  return run((c) => saveRole(c.scope, c.limits, input));
}
export async function deleteRoleAction(roleId: unknown) {
  const m = id.safeParse(roleId);
  if (!m.success) return bad();
  return run((c) => deleteRole(getDb(), c.scope, m.data));
}

/** PIN الكاشير (4 أرقام) لتبديل الكاشير وموافقة المشرف على الجهاز. null يشيله. */
export async function setPinAction(memberId: unknown, pin: unknown) {
  const p = z.object({ memberId: id, pin: z.string().regex(/^\d{4}$/, "الـ PIN لازم يكون 4 أرقام").nullable() }).safeParse({ memberId, pin });
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? "فيه خانة غلط." };
  return run((ctx) => setMemberPin(getDb(), ctx.store.id, p.data.memberId, p.data.pin, ctx.user.id));
}

/** الفروع المسموحة للموظف (فاضي = كل الفروع) */
export async function setBranchesAction(memberId: unknown, branchIds: unknown) {
  const p = z.object({ memberId: id, branchIds: z.array(id).max(100).nullable() }).safeParse({ memberId, branchIds });
  if (!p.success) return bad();
  return run((ctx) => setMemberBranches(getDb(), ctx.store.id, p.data.memberId, p.data.branchIds, ctx.user.id));
}
