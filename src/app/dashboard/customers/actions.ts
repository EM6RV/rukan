"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setCustomerFlag } from "@/server/orders/customers";
import { adjustCustomer, recordCustomerMoney, setCustomerTerms } from "@/server/pos/customers";
import { auditStore } from "@/server/store-audit";
import { actionContext } from "@/server/store-context";

export async function setCustomerFlagAction(id: string, flag: unknown, notes: unknown) {
  const p = z.object({ id: z.string().min(1), flag: z.enum(["none", "problematic"]), notes: z.string().trim().max(300).nullish() }).safeParse({ id, flag, notes });
  if (!p.success) return { ok: false as const, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." };
  const auth = await actionContext("customers", { write: true });
  if (!auth.ok) return auth;
  const r = await setCustomerFlag(auth.ctx.scope, p.data.id, p.data.flag, p.data.notes ?? null);
  if (r.ok) { void auditStore(auth.ctx, "customers.write"); revalidatePath("/dashboard", "layout"); }
  return r;
}

// ===== الدين والمحفظة (من اللوحة) =====
export async function customerMoneyAction(kind: unknown, input: unknown) {
  const auth = await actionContext("customers", { write: true });
  if (!auth.ok) return auth;
  if (kind !== "payment" && kind !== "topup") return { ok: false as const, error: "عملية غير صحيحة." };
  const r = await recordCustomerMoney(auth.ctx.scope, kind, input, auth.ctx.user.id);
  if (r.ok) { void auditStore(auth.ctx, kind === "payment" ? "customer.debt_payment" : "customer.wallet_topup", { meta: input as Record<string, unknown> }); revalidatePath("/dashboard", "layout"); }
  return r;
}
export async function adjustCustomerAction(input: unknown) {
  const auth = await actionContext("customers", { write: true });
  if (!auth.ok) return auth;
  const r = await adjustCustomer(auth.ctx.scope, input, auth.ctx.user.id);
  if (r.ok) { void auditStore(auth.ctx, "customer.adjust", { meta: input as Record<string, unknown> }); revalidatePath("/dashboard", "layout"); }
  return r;
}
export async function customerTermsAction(input: unknown) {
  const auth = await actionContext("customers", { write: true });
  if (!auth.ok) return auth;
  const r = await setCustomerTerms(auth.ctx.scope, input);
  if (r.ok) revalidatePath("/dashboard", "layout");
  return r;
}
