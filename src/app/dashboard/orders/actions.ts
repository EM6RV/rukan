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
import { SHIPPING_COMPANY_IDS } from "@/lib/shipping-companies";
import { auditStore } from "@/server/store-audit";
import { actionContext, type StoreContext } from "@/server/store-context";
import { lockedOrderIds, ORDER_LOCKED_ERROR } from "@/server/entitlements";
import { t } from "@/server/tenant";
import { eq } from "drizzle-orm";

const bad = (): Result<never> => ({ ok: false, error: "فيه خانة ناقصة أو غلط. راجع الخانات وجرّب." });

/** المندوب ما يقدر يعمل غير تسجيل التوصيل؛ باقي العمليات للموظفين */
async function run<T>(permission: "orders" | "returns", opts: { staffOnly?: boolean; orderIds?: string[] }, fn: (ctx: StoreContext, restrict: string | null) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext(permission, { write: true });
  if (!auth.ok) return auth;
  if (opts.staffOnly && auth.ctx.role === "courier") return { ok: false, error: "ما عندكش صلاحية للإجراء هذا. كلّم مدير المتجر." };
  // الطلبيات فوق حد الباقة الشهري مقفولة على البياع لين يرقّي
  if (opts.orderIds && (await lockedOrderIds(auth.ctx.scope, auth.ctx.limits, opts.orderIds)).length) return { ok: false, error: ORDER_LOCKED_ERROR };
  const r = await fn(auth.ctx, await courierRestriction(auth.ctx));
  if (r.ok) {
    void auditStore(auth.ctx, "orders.write");
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
  shippingCompany: z.enum(SHIPPING_COMPANY_IDS).nullish(),
});

export async function changeStatusAction(input: unknown): Promise<Result<{ status: OrderStatus }>> {
  const p = statusSchema.safeParse(input);
  if (!p.success) return bad();
  return run("orders", { orderIds: [p.data.orderId] }, async (ctx, restrict) => {
    if (p.data.to === "with_courier" && !ctx.store.useCouriers) return { ok: false, error: "المندوبين مقفلين في متجرك. شغّلهم من الإعدادات ← التوصيل." };
    const r = await changeOrderStatus(ctx.scope, { ...p.data, note: p.data.note ?? null, courierId: p.data.courierId ?? null, shipmentNumber: p.data.shipmentNumber ?? null, shippingCompany: p.data.shippingCompany ?? null, actorUserId: ctx.user.id, restrictCourierId: restrict });
    if (r.ok && p.data.to === "with_courier") void notifyCourierAssigned(getDb(), ctx.store.id, [p.data.orderId]); // إشعار للمندوب
    return r;
  });
}

export async function updateOrderAction(orderId: string, patch: unknown) {
  if (typeof orderId !== "string" || !orderId) return bad();
  return run("orders", { staffOnly: true, orderIds: [orderId] }, (ctx, restrict) => updateOrderDetails(ctx.scope, orderId, patch, ctx.user.id, restrict));
}

export async function bulkAssignAction(orderIds: unknown, courierId: unknown) {
  const p = z.object({ ids: z.array(z.string().min(1)).min(1).max(200), courierId: z.string().min(1).nullable() }).safeParse({ ids: orderIds, courierId });
  if (!p.success) return bad();
  return run("orders", { staffOnly: true, orderIds: p.data.ids }, async (ctx) => {
    if (!ctx.store.useCouriers) return { ok: false, error: "المندوبين مقفلين في متجرك. شغّلهم من الإعدادات ← التوصيل." };
    const r = await bulkAssignCourier(ctx.scope, p.data.ids, p.data.courierId, ctx.user.id);
    if (r.ok && p.data.courierId) void notifyCourierAssigned(getDb(), ctx.store.id, p.data.ids);
    return r;
  });
}

export async function paymentStatusAction(orderId: string, status: unknown) {
  const p = z.object({ orderId: z.string().min(1), status: z.enum(["pending", "paid", "refunded"]) }).safeParse({ orderId, status });
  if (!p.success) return bad();
  return run("orders", { staffOnly: true, orderIds: [p.data.orderId] }, (ctx) => setPaymentStatus(ctx.scope, p.data.orderId, p.data.status, ctx.user.id));
}

export async function reviewReceiptAction(receiptId: string, decision: unknown) {
  const p = z.object({ receiptId: z.string().min(1), decision: z.enum(["approved", "rejected"]) }).safeParse({ receiptId, decision });
  if (!p.success) return bad();
  return run("orders", { staffOnly: true }, async (ctx) => {
    const [rc] = await ctx.scope.from(t.paymentReceipts, eq(t.paymentReceipts.id, p.data.receiptId)).limit(1);
    if (rc && (await lockedOrderIds(ctx.scope, ctx.limits, [rc.orderId])).length) return { ok: false, error: ORDER_LOCKED_ERROR };
    return reviewReceipt(ctx.scope, p.data.receiptId, p.data.decision, ctx.user.id);
  });
}

export async function registerReturnAction(input: unknown) {
  const orderId = (input as { orderId?: unknown } | null)?.orderId;
  return run("returns", { staffOnly: true, orderIds: typeof orderId === "string" ? [orderId] : [] }, (ctx, restrict) => registerReturn(ctx.scope, input, ctx.user.id, restrict));
}
