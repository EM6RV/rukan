import { listProducts } from "./catalog/products";
import { listCustomers } from "./orders/customers";
import { listOrders } from "./orders/manage";
import { courierRestriction } from "./orders/access";
import { hasPermission } from "./permissions";
import type { StoreContext } from "./store-context";

export type SearchHit = { kind: "product" | "order" | "customer"; id: string; title: string; subtitle: string; href: string };

/** بحث لوحة الأوامر (Ctrl+K): منتجات وطلبيات وزبائن، داخل المتجر بس وحسب صلاحية الموظف. المندوب يلقى طلبياته بس. */
export async function searchDashboard(ctx: Pick<StoreContext, "role" | "scope" | "user">, query: string, limit = 5): Promise<SearchHit[]> {
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return [];
  const restrict = await courierRestriction(ctx);
  const [products, orders, customers] = await Promise.all([
    hasPermission(ctx, "products") ? listProducts(ctx.scope, { q }) : null,
    hasPermission(ctx, "orders") ? listOrders(ctx.scope, { q, pageSize: limit, restrictCourierId: restrict }) : null,
    hasPermission(ctx, "customers") ? listCustomers(ctx.scope, { q, pageSize: limit }) : null,
  ]);
  return [
    ...(orders?.items ?? []).map((o): SearchHit => ({ kind: "order", id: o.id, title: `#${o.number} — ${o.customerName}`, subtitle: `${o.cityName} · ${o.customerPhone}`, href: `/dashboard/orders/${o.id}` })),
    ...(products?.items ?? []).slice(0, limit).map((p): SearchHit => ({ kind: "product", id: p.id, title: p.name, subtitle: p.isVisible ? `المخزون ${p.stock}` : "مخفي", href: `/dashboard/products/${p.id}` })),
    ...(customers?.items ?? []).map((c): SearchHit => ({ kind: "customer", id: c.id, title: c.name, subtitle: c.phone, href: `/dashboard/customers/${c.id}` })),
  ];
}
