"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setCustomerFlag } from "@/server/orders/customers";
import { actionContext } from "@/server/store-context";

export async function setCustomerFlagAction(id: string, flag: unknown, notes: unknown) {
  const p = z.object({ id: z.string().min(1), flag: z.enum(["none", "problematic"]), notes: z.string().trim().max(300).nullish() }).safeParse({ id, flag, notes });
  if (!p.success) return { ok: false as const, error: "البيانات غير صحيحة." };
  const auth = await actionContext("customers", { write: true });
  if (!auth.ok) return auth;
  const r = await setCustomerFlag(auth.ctx.scope, p.data.id, p.data.flag, p.data.notes ?? null);
  if (r.ok) revalidatePath("/dashboard", "layout");
  return r;
}
