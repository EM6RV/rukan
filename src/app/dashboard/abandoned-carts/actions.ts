"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dismissCart, markReminded } from "@/server/marketing/abandoned-carts";
import { canUse } from "@/lib/entitlements";
import { actionContext } from "@/server/store-context";

const LOCKED = { ok: false as const, error: "السلات المتروكة مش في باقتك. رقّي باقتك باش تستعملها." };

const id = z.string().min(1).max(40);

export async function markRemindedAction(cartId: unknown) {
  const p = id.safeParse(cartId);
  if (!p.success) return { ok: false as const, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." };
  const a = await actionContext("customers", { write: true });
  if (!a.ok) return a;
  if (!canUse(a.ctx.limits, "abandonedCarts")) return LOCKED;
  const r = await markReminded(a.ctx.scope, p.data);
  if (r.ok) revalidatePath("/dashboard/abandoned-carts");
  return r;
}

export async function dismissCartAction(cartId: unknown) {
  const p = id.safeParse(cartId);
  if (!p.success) return { ok: false as const, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." };
  const a = await actionContext("customers", { write: true });
  if (!a.ok) return a;
  if (!canUse(a.ctx.limits, "abandonedCarts")) return LOCKED;
  const r = await dismissCart(a.ctx.scope, p.data);
  if (r.ok) revalidatePath("/dashboard/abandoned-carts");
  return r;
}
