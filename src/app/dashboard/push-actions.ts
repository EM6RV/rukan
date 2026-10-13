"use server";

import { headers } from "next/headers";
import { getDb } from "@/db";
import { actionContext } from "@/server/store-context";
import { isValidSubscription, removePushSubscription, savePushSubscription } from "@/server/push";

const bad = { ok: false as const, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." };

/** يفعّل إشعارات الطلبيات لهذا الجهاز. المندوب ما يستلم إشعارات الطلبيات (يشوف طلبياته بس). */
export async function subscribePushAction(subscription: unknown) {
  const a = await actionContext("orders");
  if (!a.ok) return a;
  if (a.ctx.role === "courier") return { ok: false as const, error: "ما عندكش صلاحية للإجراء هذا. كلّم مدير المتجر." };
  if (!isValidSubscription(subscription)) return bad;
  await savePushSubscription(getDb(), a.ctx.store.id, a.ctx.user.id, subscription, (await headers()).get("user-agent"));
  return { ok: true as const };
}

export async function unsubscribePushAction(endpoint: unknown) {
  const a = await actionContext("orders");
  if (!a.ok) return a;
  if (typeof endpoint !== "string" || !endpoint) return bad;
  await removePushSubscription(getDb(), a.ctx.store.id, a.ctx.user.id, endpoint);
  return { ok: true as const };
}
