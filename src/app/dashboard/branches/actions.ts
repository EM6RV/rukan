"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/server/catalog/result";
import { createDevice, DEVICE_COOKIE, revokeDevice, saveBranch, saveRegister } from "@/server/pos/branches";
import { auditStore } from "@/server/store-audit";
import { actionContext, type StoreContext } from "@/server/store-context";

async function run<T>(fn: (ctx: StoreContext) => Promise<Result<T>>, action: string): Promise<Result<T>> {
  const auth = await actionContext("settings", { write: true });
  if (!auth.ok) return auth;
  const r = await fn(auth.ctx);
  if (r.ok) { void auditStore(auth.ctx, action); revalidatePath("/dashboard/branches"); }
  return r;
}

export async function saveBranchAction(input: unknown) {
  return run((c) => saveBranch(c.scope, c.limits, input), "branch.save");
}

export async function saveRegisterAction(input: unknown) {
  return run((c) => saveRegister(c.scope, c.lines.market.subscribed ? c.lines.market.limits?.maxRegisters : null, input), "register.save");
}

/** يفعّل المتصفح الحالي كجهاز تشغيل (كاشير): التوكن في كوكي httpOnly لسنة، ويتلغى من هنا وقت ما تبي */
export async function activateDeviceAction(input: unknown): Promise<Result<{ redirect: string }>> {
  const auth = await actionContext("settings", { write: true });
  if (!auth.ok) return auth;
  const line = z.object({ line: z.enum(["market", "lounge", "gym"]) }).safeParse(input);
  if (!line.success) return { ok: false, error: "اختار المنظومة." };
  const l = auth.ctx.lines[line.data.line];
  if (!l.subscribed || !l.writable) return { ok: false, error: "المنظومة هذي مش مشترك فيها أو اشتراكها منتهي." };
  const r = await createDevice(auth.ctx.scope, { ...(input as object), kind: "pos" }, auth.ctx.user.id);
  if (!r.ok) return r;
  (await cookies()).set(DEVICE_COOKIE, r.data.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 86_400 });
  void auditStore(auth.ctx, "device.activate", { entityType: "device", entityId: r.data.id });
  revalidatePath("/dashboard/branches");
  return { ok: true, data: { redirect: "/pos" } };
}

export async function revokeDeviceAction(id: unknown) {
  if (typeof id !== "string" || !id) return { ok: false as const, error: "جهاز غير صحيح." };
  return run((c) => revokeDevice(c.scope, id), "device.revoke");
}
