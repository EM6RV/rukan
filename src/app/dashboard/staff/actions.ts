"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import type { Result } from "@/server/catalog/result";
import { addStaff, changeStaffRole, removeStaff, resetStaffPassword } from "@/server/staff-service";
import { actionContext, type StoreContext } from "@/server/store-context";

async function run<T>(fn: (ctx: StoreContext) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext("staff", { write: true });
  if (!auth.ok) return auth;
  const r = await fn(auth.ctx);
  if (r.ok) revalidatePath("/dashboard/staff");
  return r;
}
const id = z.string().min(1);
const bad = () => ({ ok: false as const, error: "البيانات غير صحيحة." });

export async function addStaffAction(input: unknown) {
  return run((c) => addStaff(getDb(), c.store.id, c.user.id, input, c.limits));
}
export async function changeRoleAction(memberId: unknown, role: unknown) {
  const m = id.safeParse(memberId);
  if (!m.success) return bad();
  return run((c) => changeStaffRole(getDb(), c.store.id, c.user.id, m.data, role));
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
