"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/server/catalog/result";
import { saveTrackingUrls } from "@/server/orders/shipping";
import { deleteCourier, recordAdjustment, recordSettlement, saveCourier } from "@/server/orders/couriers";
import { ledgerAccountFor } from "@/server/accounting/hooks";
import { auditStore } from "@/server/store-audit";
import { actionContext, type StoreContext } from "@/server/store-context";

async function run<T>(fn: (ctx: StoreContext) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext("couriers", { write: true });
  if (!auth.ok) return auth;
  const r = await fn(auth.ctx);
  if (r.ok) { void auditStore(auth.ctx, "couriers.write"); revalidatePath("/dashboard", "layout"); }
  return r;
}
const bad = (): Result<never> => ({ ok: false, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." });

export async function saveCourierAction(input: unknown) {
  return run((c) => saveCourier(c.scope, input));
}
export async function deleteCourierAction(id: unknown) {
  if (typeof id !== "string" || !id) return bad();
  return run((c) => deleteCourier(c.scope, id));
}

const money = z.number().int("المبلغ لازم يكون رقم صحيح");
export async function settleAction(input: unknown) {
  const p = z.object({ courierId: z.string().min(1), amount: money.min(1, "اكتب مبلغ أكبر من صفر"), note: z.string().trim().max(200).nullish() }).safeParse(input);
  if (!p.success) return p.error.issues[0]?.message ? ({ ok: false, error: p.error.issues[0].message } as Result<never>) : bad();
  return run(async (c) => recordSettlement(c.scope, p.data, c.user.id, await ledgerAccountFor(c, "cash")));
}
export async function adjustAction(input: unknown) {
  const p = z.object({ courierId: z.string().min(1), amount: money, note: z.string().trim().min(3, "اكتب سبب التعديل").max(200) }).safeParse(input);
  if (!p.success) return p.error.issues[0]?.message ? ({ ok: false, error: p.error.issues[0].message } as Result<never>) : bad();
  return run((c) => recordAdjustment(c.scope, p.data, c.user.id));
}

export async function saveTrackingUrlsAction(input: unknown) {
  return run((c) => saveTrackingUrls(c.scope, input));
}
