import { and, desc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { auditLogs, users } from "@/db/schema/platform";
import { writeAudit } from "./audit";
import type { StoreContext } from "./store-context";

/** يسجل عملية في سجل نشاط المتجر (فشل الكتابة ما يوقفش العملية) */
export function auditStore(ctx: Pick<StoreContext, "user" | "store">, action: string, e: { entityType?: string; entityId?: string; meta?: Record<string, unknown> } = {}) {
  return writeAudit(getDb(), { actorUserId: ctx.user.id, storeId: ctx.store.id, action, ...e });
}

export const ACTION_LABELS: Record<string, string> = {
  "products.write": "تعديل المنتجات", "orders.write": "تعديل الطلبيات", "settings.write": "تعديل الإعدادات", "marketing.write": "تعديل التسويق والكوبونات",
  "categories.write": "تعديل الأقسام", "couriers.write": "تعديل المندوبين والكاش", "customers.write": "تعديل الزبائن", "staff.write": "تعديل الموظفين",
  "billing.write": "الاشتراك", "accounting.write": "الحسابات والمصاريف", "content.write": "تعديل المحتوى", "returns.write": "المرتجعات", "reports.write": "التقارير",
  "staff.add": "إضافة موظف", "staff.role": "تغيير صلاحية موظف", "staff.password": "تغيير كلمة سر موظف", "staff.remove": "حذف موظف",
  "order.status": "تغيير حالة طلبية", "order.manual": "تسجيل طلبية يدوية", "product.delete": "حذف منتجات", "product.price": "تعديل أسعار جماعي",
};

export type ActivityRow = { id: string; at: number; actor: string; action: string; label: string; entityId: string | null; meta: Record<string, unknown> | null };
const PAGE = 40;

export async function listStoreActivity(db: Db, storeId: string, page = 1): Promise<{ rows: ActivityRow[]; hasMore: boolean }> {
  const rows = await db.select({ id: auditLogs.id, at: auditLogs.createdAt, action: auditLogs.action, entityId: auditLogs.entityId, meta: auditLogs.meta, actor: users.name })
    .from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(and(eq(auditLogs.storeId, storeId))).orderBy(desc(auditLogs.createdAt)).limit(PAGE + 1).offset((Math.max(1, page) - 1) * PAGE);
  return {
    hasMore: rows.length > PAGE,
    rows: rows.slice(0, PAGE).map((r) => ({ id: r.id, at: r.at.getTime(), actor: r.actor ?? "النظام", action: r.action, label: ACTION_LABELS[r.action] ?? r.action, entityId: r.entityId, meta: r.meta })),
  };
}
