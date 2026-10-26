"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addExpense, addReceivable, closeCash, deposit, markReceivableReminded, payReceivable, refundCustomer, reverseEntry, saveAccount, setAccountActive, transfer,
} from "@/server/accounting/ledger";
import type { Result } from "@/server/catalog/result";
import { isModuleOn } from "@/server/modules";
import { auditStore } from "@/server/store-audit";
import { actionContext, type StoreContext } from "@/server/store-context";

/** صلاحية «الحسابات» + وحدة الحسابات لازم تكون شغّالة (فحص السيرفر) */
async function run<T>(fn: (ctx: StoreContext) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext("accounting", { write: true });
  if (!auth.ok) return auth;
  if (!isModuleOn(auth.ctx.store, auth.ctx.limits, "accounting")) return { ok: false, error: "وحدة الحسابات مش شغّالة. فعّلها من الإعدادات ← الوحدات." };
  const r = await fn(auth.ctx);
  if (r.ok) { void auditStore(auth.ctx, "accounting.write"); revalidatePath("/dashboard/accounting", "layout"); }
  return r;
}
const id = z.string().min(1).max(40);
const bad = (): Result<never> => ({ ok: false, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." });

export async function saveAccountAction(input: unknown) { return run((c) => saveAccount(c.scope, input, c.user.id)); }
export async function toggleAccountAction(accountId: unknown, active: unknown) { const p = z.object({ a: id, b: z.boolean() }).safeParse({ a: accountId, b: active }); return p.success ? run((c) => setAccountActive(c.scope, p.data.a, p.data.b)) : bad(); }
export async function depositAction(input: unknown) {
  const p = z.object({ accountId: id, amount: z.number().int(), memo: z.string().max(200).nullish(), withdraw: z.boolean().default(false) }).safeParse(input);
  return p.success ? run((c) => deposit(c.scope, p.data, c.user.id)) : bad();
}
export async function transferAction(input: unknown) {
  const p = z.object({ fromAccountId: id, toAccountId: id, amount: z.number().int(), memo: z.string().max(200).nullish() }).safeParse(input);
  return p.success ? run((c) => transfer(c.scope, p.data, c.user.id)) : bad();
}
export async function reverseAction(entryId: unknown) { const p = id.safeParse(entryId); return p.success ? run((c) => reverseEntry(c.scope, p.data, c.user.id)) : bad(); }
export async function addExpenseAction(input: unknown) { return run((c) => addExpense(c.scope, input, c.user.id)); }
export async function addReceivableAction(input: unknown) { return run((c) => addReceivable(c.scope, input)); }
export async function payReceivableAction(input: unknown) {
  const p = z.object({ id, amount: z.number().int(), accountId: id }).safeParse(input);
  return p.success ? run((c) => payReceivable(c.scope, p.data, c.user.id)) : bad();
}
export async function remindReceivableAction(v: unknown) { const p = id.safeParse(v); return p.success ? run((c) => markReceivableReminded(c.scope, p.data)) : bad(); }
export async function closeCashAction(input: unknown) {
  const p = z.object({ accountId: id, actual: z.number().int(), note: z.string().max(200).nullish(), adjust: z.boolean().default(false) }).safeParse(input);
  return p.success ? run((c) => closeCash(c.scope, p.data, c.user.id)) : bad();
}
export async function refundCustomerAction(input: unknown) {
  const p = z.object({ accountId: id, amount: z.number().int(), orderId: id.nullish(), memo: z.string().max(200).nullish() }).safeParse(input);
  return p.success ? run((c) => refundCustomer(c.scope, p.data, c.user.id)) : bad();
}
