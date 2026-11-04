"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { setModuleEnabled } from "@/server/modules";
import { actionContext } from "@/server/store-context";

export async function setModuleAction(input: unknown) {
  const auth = await actionContext("settings", { write: true });
  if (!auth.ok) return auth;
  const r = await setModuleEnabled(getDb(), auth.ctx.store, auth.ctx.limits, input);
  if (r.ok) revalidatePath("/dashboard", "layout");
  return r;
}
