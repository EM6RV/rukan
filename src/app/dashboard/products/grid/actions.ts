"use server";

import { revalidatePath } from "next/cache";
import { saveGridRows } from "@/server/catalog/grid";
import { invalidateStore } from "@/server/storefront/data";
import { auditStore } from "@/server/store-audit";
import { actionContext } from "@/server/store-context";

export async function saveGridAction(input: unknown) {
  const auth = await actionContext("products", { write: true });
  if (!auth.ok) return auth;
  const r = await saveGridRows(auth.ctx.scope, input, auth.ctx.user.id);
  if (r.ok) { void auditStore(auth.ctx, "products.write", { meta: { rows: r.data.updated } }); invalidateStore(auth.ctx.store); revalidatePath("/dashboard/products"); revalidatePath("/dashboard/products/grid"); }
  return r;
}
