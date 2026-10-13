"use server";

import { headers } from "next/headers";
import { getDb } from "@/db";
import { actionContext } from "@/server/store-context";
import { isValidSubscription, removePushSubscription, savePushSubscription } from "@/server/push";

const bad = { ok: false as const, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." };

/** يفعّل الإشعارات لهذا الجهاز: الموظفين عن الطلبيات الجديدة، والمندوب عن الطلبيات المعيّنة له. */
export async function subscribePushAction(subscription: unknown) {
  const a = await actionContext("orders");
  if (!a.ok) return a;
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
