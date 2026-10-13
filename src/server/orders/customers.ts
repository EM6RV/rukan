import { and, desc, eq, or, sql } from "drizzle-orm";
import { fail, ok, type Result } from "../catalog/result";
import { t, type StoreScope } from "../tenant";

const like = (q: string) => `%${q.trim().replace(/[\\%_]/g, "\\$&")}%`;

export type CustomerFilters = { q?: string; flag?: "problematic" | "returns"; page?: number; pageSize?: number };

export async function listCustomers(scope: StoreScope, f: CustomerFilters = {}) {
  const c = [];
  if (f.q?.trim()) {
    const term = like(f.q);
    const digits = f.q.replace(/\D/g, "");
    c.push(or(sql`${t.customers.name} LIKE ${term} ESCAPE '\\'`, sql`${t.customers.phone} LIKE ${like(digits || f.q)} ESCAPE '\\'`)!);
  }
  if (f.flag === "problematic") c.push(eq(t.customers.flag, "problematic"));
  // كثير الإرجاع: عنده مرتجعين على الأقل ونسبتهم 30% فأكثر من طلبياته
  if (f.flag === "returns") c.push(sql`${t.customers.returnedCount} >= 2 AND ${t.customers.returnedCount} * 10 >= ${t.customers.ordersCount} * 3`);
  const where = c.length ? and(...c) : undefined;
  const size = Math.min(f.pageSize ?? 25, 100);
  const total = await scope.count(t.customers, where);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, f.page ?? 1), pageCount);
  const rows = await scope.from(t.customers, where).orderBy(desc(t.customers.createdAt), t.customers.id).limit(size).offset((page - 1) * size);
  return { items: rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() })), total, page, pageCount };
}

export async function getCustomerDetail(scope: StoreScope, id: string) {
  const [customer] = await scope.from(t.customers, eq(t.customers.id, id)).limit(1);
  if (!customer) return null;
  const orders = await scope.from(t.orders, eq(t.orders.customerId, id)).orderBy(desc(t.orders.createdAt)).limit(50);
  return { customer, orders };
}

export async function setCustomerFlag(scope: StoreScope, id: string, flag: "none" | "problematic", notes: string | null): Promise<Result> {
  if (flag !== "none" && flag !== "problematic") return fail("قيمة غير صحيحة.");
  const [row] = await scope.update(t.customers, { flag, notes: notes?.trim().slice(0, 300) || null }, eq(t.customers.id, id));
  return row ? ok(undefined) : fail("ما لقينا الزبون. يمكن انحذف، حدّث الصفحة.");
}
