"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { PRODUCT_LINES } from "@/lib/product-lines";
import type { Result } from "@/server/catalog/result";
import { availableLines, lineLaunch, startLineTrial } from "@/server/lines";
import { auditStore } from "@/server/store-audit";
import { actionContext } from "@/server/store-context";

/** «زيد منظومة»: يبدا تجربة مجانية لمنظومة جديدة للنشاط (أول مرة بس) */
export async function startLineTrialAction(line: unknown): Promise<Result<{ trialEndsAt: number | null }>> {
  const auth = await actionContext("billing");
  if (!auth.ok) return auth;
  const p = z.enum(PRODUCT_LINES).safeParse(line);
  if (!p.success) return { ok: false, error: "منظومة مش معروفة." };
  const db = getDb();
  const r = await startLineTrial(db, auth.ctx.store.id, p.data, { available: availableLines(await lineLaunch(db), auth.ctx.store.lineBeta), setup: {} });
  if (r.ok) { void auditStore(auth.ctx, "line.start_trial", { meta: { line: p.data } }); revalidatePath("/dashboard", "layout"); }
  return r;
}
