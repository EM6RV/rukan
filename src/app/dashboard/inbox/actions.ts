"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/server/catalog/result";
import { closeConversation, logManualConversation } from "@/server/inbox/service";
import { isModuleOn } from "@/server/modules";
import { actionContext, type StoreContext } from "@/server/store-context";

/** صلاحية «الطلبيات» + وحدة صندوق الرسائل لازم تكون شغّالة (تجربة من الأدمن) */
async function run<T>(fn: (ctx: StoreContext) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext("orders", { write: true });
  if (!auth.ok) return auth;
  if (!isModuleOn(auth.ctx.store, auth.ctx.limits, "marketplaceInbox")) return { ok: false, error: "صندوق الرسائل لسه «قريباً» لمتجرك." };
  const r = await fn(auth.ctx);
  if (r.ok) revalidatePath("/dashboard/inbox");
  return r;
}

export async function logConversationAction(input: unknown) { return run((c) => logManualConversation(c.scope, input)); }
export async function closeConversationAction(id: unknown) {
  const p = z.string().min(1).max(40).safeParse(id);
  return p.success ? run((c) => closeConversation(c.scope, p.data)) : ({ ok: false, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." } as Result<never>);
}
