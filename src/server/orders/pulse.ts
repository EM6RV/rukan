import { desc, eq } from "drizzle-orm";
import { t, type StoreScope } from "../tenant";

/** نبضة خفيفة للوحة: عدد الطلبيات الجديدة وآخر طلبية (للتنبيه والشارة) */
export async function getOrdersPulse(scope: StoreScope) {
  const [newCount, [latest]] = await Promise.all([
    scope.count(t.orders, eq(t.orders.status, "new")),
    scope.from(t.orders).orderBy(desc(t.orders.createdAt), desc(t.orders.number)).limit(1),
  ]);
  return {
    newCount,
    latest: latest ? { id: latest.id, number: latest.number, customerName: latest.customerName, total: latest.total } : null,
  };
}
