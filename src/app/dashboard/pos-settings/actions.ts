"use server";

import { revalidatePath } from "next/cache";
import { savePosConfig } from "@/server/pos/settings";
import { auditStore } from "@/server/store-audit";
import { actionContext } from "@/server/store-context";

export async function savePosConfigAction(input: unknown) {
  const auth = await actionContext("settings", { write: true });
  if (!auth.ok) return auth;
  const r = await savePosConfig(auth.ctx.scope, input);
  if (r.ok) { void auditStore(auth.ctx, "pos.settings", { meta: input as Record<string, unknown> }); revalidatePath("/dashboard/pos-settings"); }
  return r;
}
