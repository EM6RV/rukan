"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteReview, moderateReview } from "@/server/reviews";
import { invalidateStore } from "@/server/storefront/data";
import { auditStore } from "@/server/store-audit";
import { actionContext } from "@/server/store-context";

const bad = { ok: false as const, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." };

export async function moderateReviewAction(id: unknown, status: unknown) {
  const p = z.object({ id: z.string().min(1), status: z.enum(["approved", "rejected", "pending"]) }).safeParse({ id, status });
  if (!p.success) return bad;
  const auth = await actionContext("marketing", { write: true });
  if (!auth.ok) return auth;
  const r = await moderateReview(auth.ctx.scope, p.data.id, p.data.status);
  if (r.ok) { void auditStore(auth.ctx, "marketing.write"); invalidateStore(auth.ctx.store); revalidatePath("/dashboard/reviews"); }
  return r;
}

export async function deleteReviewAction(id: unknown) {
  if (typeof id !== "string" || !id) return bad;
  const auth = await actionContext("marketing", { write: true });
  if (!auth.ok) return auth;
  const r = await deleteReview(auth.ctx.scope, id);
  if (r.ok) { void auditStore(auth.ctx, "marketing.write"); invalidateStore(auth.ctx.store); revalidatePath("/dashboard/reviews"); }
  return r;
}
