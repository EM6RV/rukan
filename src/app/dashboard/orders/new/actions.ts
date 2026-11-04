"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { createManualOrder } from "@/server/orders/create";
import { isModuleOn } from "@/server/modules";
import { invalidateStore } from "@/server/storefront/data";
import { auditStore } from "@/server/store-audit";
import { actionContext } from "@/server/store-context";

/** تسجيل طلبية يدوية (من واتساب/إنستا/اتصال) */
export async function createManualOrderAction(input: unknown) {
  const auth = await actionContext("orders", { write: true });
  if (!auth.ok) return auth;
  if (auth.ctx.role === "courier") return { ok: false as const, error: "ما عندكش صلاحية للإجراء هذا. كلّم مدير المتجر." };
  // اختيار المخزن مسموح بس لو وحدة المخازن شغّالة (فحص السيرفر)
  const raw = input && typeof input === "object" ? { ...(input as Record<string, unknown>) } : {};
  if (!isModuleOn(auth.ctx.store, auth.ctx.limits, "warehouses")) delete raw.warehouseId;
  const r = await createManualOrder(getDb(), auth.ctx.store.id, raw);
  if (!r.ok) return r;
  void auditStore(auth.ctx, "order.manual", { entityType: "order", entityId: r.data.orderId, meta: { number: r.data.number } });
  invalidateStore(auth.ctx.store); // المخزون تغيّر
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  return { ok: true as const, data: { orderId: r.data.orderId, number: r.data.number } };
}
