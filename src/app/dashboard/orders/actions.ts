"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/constants";
import type { Result } from "@/server/catalog/result";
import { courierRestriction } from "@/server/orders/access";
import { bulkAssignCourier, changeOrderStatus, registerReturn, reviewReceipt, setPaymentStatus, updateOrderDetails } from "@/server/orders/manage";
import { getDb } from "@/db";
import { notifyCourierAssigned } from "@/server/push";
import { invalidateStore } from "@/server/storefront/data";
import { actionContext, type StoreContext } from "@/server/store-context";

const bad = (): Result<never> => ({ ok: false, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." });

/** المندوب ما يقدر يعمل غير تسجيل التوصيل؛ باقي العمليات للموظفين */
async function run<T>(permission: "orders" | "returns", opts: { staffOnly?: boolean }, fn: (ctx: StoreContext, restrict: string | null) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext(permission, { write: true });
  if (!auth.ok) return auth;
  if (opts.staffOnly && auth.ctx.role === "courier") return { ok: false, error: "ما عندكش صلاحية للإجراء هذا. كلّم مدير المتجر." };
  const r = await fn(auth.ctx, await courierRestriction(auth.ctx));
  if (r.ok) {
    revalidatePath("/dashboard", "layout");
    invalidateStore(auth.ctx.store);
  }
  return r;
}

const statusSchema = z.object({
  orderId: z.string().min(1),
  to: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(300).nullish(),
  courierId: z.string().min(1).nullish(),
  shipmentNumber: z.string().trim().max(60).nullish(),
});

export async function changeStatusAction(input: unknown): Promise<Result<{ status: OrderStatus }>> {
  const p = statusSchema.safeParse(input);
  if (!p.success) return bad();
  return run("orders", {}, async (ctx, restrict) => {
    const r = await changeOrderStatus(ctx.scope, { ...p.data, note: p.data.note ?? null, courierId: p.data.courierId ?? null, shipmentNumber: p.data.shipmentNumber ?? null, actorUserId: ctx.user.id, restrictCourierId: restrict });
    if (r.ok && p.data.to === "with_courier") void notifyCourierAssigned(getDb(), ctx.store.id, [p.data.orderId]); // إشعار للمندوب
    return r;
  });
}

export async function updateOrderAction(orderId: string, patch: unknown) {
  if (typeof orderId !== "string" || !orderId) return bad();
  return run("orders", { staffOnly: true }, (ctx, restrict) => updateOrderDetails(ctx.scope, orderId, patch, ctx.user.id, restrict));
}

export async function bulkAssignAction(orderIds: unknown, courierId: unknown) {
  const p = z.object({ ids: z.array(z.string().min(1)).min(1).max(200), courierId: z.string().min(1).nullable() }).safeParse({ ids: orderIds, courierId });
  if (!p.success) return bad();
  return run("orders", { staffOnly: true }, async (ctx) => {
    const r = await bulkAssignCourier(ctx.scope, p.data.ids, p.data.courierId, ctx.user.id);
    if (r.ok && p.data.courierId) void notifyCourierAssigned(getDb(), ctx.store.id, p.data.ids);
    return r;
  });
}

export async function paymentStatusAction(orderId: string, status: unknown) {
  const p = z.object({ orderId: z.string().min(1), status: z.enum(["pending", "paid", "refunded"]) }).safeParse({ orderId, status });
  if (!p.success) return bad();
  return run("orders", { staffOnly: true }, (ctx) => setPaymentStatus(ctx.scope, p.data.orderId, p.data.status, ctx.user.id));
}

export async function reviewReceiptAction(receiptId: string, decision: unknown) {
  const p = z.object({ receiptId: z.string().min(1), decision: z.enum(["approved", "rejected"]) }).safeParse({ receiptId, decision });
  if (!p.success) return bad();
  return run("orders", { staffOnly: true }, (ctx) => reviewReceipt(ctx.scope, p.data.receiptId, p.data.decision, ctx.user.id));
}

export async function registerReturnAction(input: unknown) {
  return run("returns", { staffOnly: true }, (ctx, restrict) => registerReturn(ctx.scope, input, ctx.user.id, restrict));
}
