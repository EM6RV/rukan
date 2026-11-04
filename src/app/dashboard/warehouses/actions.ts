"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  cancelTransfer, closeStocktake, createTransfer, openStocktake, receiveTransfer, saveCounts, saveWarehouse, sendTransfer, setDefaultWarehouse,
} from "@/server/inventory/warehouses";
import type { Result } from "@/server/catalog/result";
import { isModuleOn } from "@/server/modules";
import { invalidateStore } from "@/server/storefront/data";
import { auditStore } from "@/server/store-audit";
import { actionContext, type StoreContext } from "@/server/store-context";

/** كل أكشن هنا يمر بصلاحية «المنتجات» + وحدة المخازن لازم تكون شغّالة (فحص السيرفر، مش الواجهة بس) */
async function run<T>(fn: (ctx: StoreContext) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext("products", { write: true });
  if (!auth.ok) return auth;
  if (!isModuleOn(auth.ctx.store, auth.ctx.limits, "warehouses")) return { ok: false, error: "وحدة المخازن مش شغّالة. فعّلها من الإعدادات ← الوحدات." };
  const r = await fn(auth.ctx);
  if (r.ok) { void auditStore(auth.ctx, "products.write"); invalidateStore(auth.ctx.store); revalidatePath("/dashboard/warehouses", "layout"); revalidatePath("/dashboard"); }
  return r;
}
const id = z.string().min(1).max(40);
const bad = (): Result<never> => ({ ok: false, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." });

export async function saveWarehouseAction(input: unknown) { return run((c) => saveWarehouse(c.scope, c.limits, input)); }
export async function setDefaultWarehouseAction(v: unknown) { const p = id.safeParse(v); return p.success ? run((c) => setDefaultWarehouse(c.scope, p.data)) : bad(); }
export async function createTransferAction(input: unknown) { return run((c) => createTransfer(c.scope, input)); }
export async function sendTransferAction(v: unknown) { const p = id.safeParse(v); return p.success ? run((c) => sendTransfer(c.scope, p.data, c.user.id)) : bad(); }
export async function receiveTransferAction(v: unknown) { const p = id.safeParse(v); return p.success ? run((c) => receiveTransfer(c.scope, p.data, c.user.id)) : bad(); }
export async function cancelTransferAction(v: unknown) { const p = id.safeParse(v); return p.success ? run((c) => cancelTransfer(c.scope, p.data, c.user.id)) : bad(); }
export async function openStocktakeAction(input: unknown) {
  const p = z.object({ warehouseId: id, lock: z.boolean().default(false), note: z.string().max(300).nullish() }).safeParse(input);
  return p.success ? run((c) => openStocktake(c.scope, p.data)) : bad();
}
export async function saveCountsAction(stocktakeId: unknown, counts: unknown) { const p = id.safeParse(stocktakeId); return p.success ? run((c) => saveCounts(c.scope, p.data, counts)) : bad(); }
export async function closeStocktakeAction(v: unknown) { const p = id.safeParse(v); return p.success ? run((c) => closeStocktake(c.scope, p.data, c.user.id)) : bad(); }
