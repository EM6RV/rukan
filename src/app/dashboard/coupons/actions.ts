"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/server/catalog/result";
import { deleteCoupon, saveCoupon, setCouponActive } from "@/server/marketing/coupons";
import { actionContext, type StoreContext } from "@/server/store-context";

async function run<T>(fn: (ctx: StoreContext) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext("marketing", { write: true });
  if (!auth.ok) return auth;
  const r = await fn(auth.ctx);
  if (r.ok) revalidatePath("/dashboard/coupons");
  return r;
}

export async function saveCouponAction(input: unknown) {
  return run((c) => saveCoupon(c.scope, input, c.limits));
}
export async function toggleCouponAction(id: unknown, active: unknown) {
  const p = z.object({ id: z.string().min(1), active: z.boolean() }).safeParse({ id, active });
  if (!p.success) return { ok: false as const, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." };
  return run((c) => setCouponActive(c.scope, p.data.id, p.data.active));
}
export async function deleteCouponAction(id: unknown) {
  if (typeof id !== "string" || !id) return { ok: false as const, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." };
  return run((c) => deleteCoupon(c.scope, id));
}
