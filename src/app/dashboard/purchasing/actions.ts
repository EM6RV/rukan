"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cancelInvoice, paySupplier, receiveInvoice, returnToSupplier, saveInvoice, saveSupplier } from "@/server/inventory/purchasing";
import type { Result } from "@/server/catalog/result";
import { isModuleOn } from "@/server/modules";
import { invalidateStore } from "@/server/storefront/data";
import { auditStore } from "@/server/store-audit";
import { actionContext, type StoreContext } from "@/server/store-context";

/** صلاحية «المنتجات» + وحدة المشتريات لازم تكون شغّالة */
async function run<T>(fn: (ctx: StoreContext) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext("products", { write: true });
  if (!auth.ok) return auth;
  if (!isModuleOn(auth.ctx.store, auth.ctx.limits, "purchasing")) return { ok: false, error: "وحدة المشتريات مش شغّالة. فعّلها من الإعدادات ← الوحدات." };
  const r = await fn(auth.ctx);
  if (r.ok) { void auditStore(auth.ctx, "products.write"); invalidateStore(auth.ctx.store); revalidatePath("/dashboard/purchasing", "layout"); revalidatePath("/dashboard"); }
  return r;
}
const id = z.string().min(1).max(40);
const bad = (): Result<never> => ({ ok: false, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." });

export async function saveSupplierAction(input: unknown) { return run((c) => saveSupplier(c.scope, input)); }
export async function saveInvoiceAction(input: unknown) { return run((c) => saveInvoice(c.scope, input)); }
export async function receiveInvoiceAction(invoiceId: unknown, receipts: unknown) {
  const p = z.object({ id, receipts: z.array(z.object({ itemId: id, quantity: z.number().int().min(0).max(1_000_000) })).nullable() }).safeParse({ id: invoiceId, receipts });
  return p.success ? run((c) => receiveInvoice(c.scope, p.data.id, p.data.receipts, c.user.id)) : bad();
}
export async function cancelInvoiceAction(v: unknown) { const p = id.safeParse(v); return p.success ? run((c) => cancelInvoice(c.scope, p.data)) : bad(); }
/** دفعة مورد: لو وحدة الحسابات شغّالة وحدد حساب، تتسجل حركة خرج من الحساب في نفس العملية */
export async function paySupplierAction(input: unknown) {
  const p = z.object({ supplierId: id, amount: z.number().int(), accountId: id.nullish(), note: z.string().max(200).nullish() }).safeParse(input);
  if (!p.success) return bad();
  return run((c) => paySupplier(c.scope, { ...p.data, accountId: isModuleOn(c.store, c.limits, "accounting") ? p.data.accountId ?? null : null }, c.user.id));
}
export async function returnToSupplierAction(input: unknown) {
  const p = z.object({ supplierId: id, variantId: id, quantity: z.number().int(), warehouseId: id.nullish(), unitCost: z.number().int().min(0).nullish(), note: z.string().max(200).nullish() }).safeParse(input);
  return p.success ? run((c) => returnToSupplier(c.scope, p.data, c.user.id)) : bad();
}
