"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteBrand, deleteOptionPreset, saveBrand, saveOptionPreset } from "@/server/catalog/library";
import type { Result } from "@/server/catalog/result";
import { invalidateStore } from "@/server/storefront/data";
import { auditStore } from "@/server/store-audit";
import { actionContext, type StoreContext } from "@/server/store-context";

const bad = { ok: false as const, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." };
async function run<T>(fn: (ctx: StoreContext) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext("products", { write: true });
  if (!auth.ok) return auth;
  const r = await fn(auth.ctx);
  if (r.ok) { void auditStore(auth.ctx, "products.write"); invalidateStore(auth.ctx.store); revalidatePath("/dashboard/catalog"); }
  return r;
}
const id = z.string().min(1).max(40);

export async function saveBrandAction(input: unknown) { return run((c) => saveBrand(c.scope, input)); }
export async function deleteBrandAction(v: unknown) { const p = id.safeParse(v); return p.success ? run((c) => deleteBrand(c.scope, p.data)) : bad; }
export async function savePresetAction(input: unknown) { return run((c) => saveOptionPreset(c.scope, input)); }
export async function deletePresetAction(v: unknown) { const p = id.safeParse(v); return p.success ? run((c) => deleteOptionPreset(c.scope, p.data)) : bad; }
