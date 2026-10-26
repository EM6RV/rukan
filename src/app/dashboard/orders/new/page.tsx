import type { Metadata } from "next";
import { getDb } from "@/db";
import { loadEditorLookups } from "@/server/catalog/editor-data";
import { getDeliveryConfig } from "@/server/delivery-service";
import { listWarehouses } from "@/server/inventory/warehouses";
import { isModuleOn } from "@/server/modules";
import { requireStoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { eq } from "drizzle-orm";
import { variantPrice } from "@/lib/pricing";
import { ManualOrderForm } from "./manual-order-form";

export const metadata: Metadata = { title: "طلبية يدوية" };

export default async function NewOrderPage() {
  const ctx = await requireStoreContext("orders");
  const [delivery, lookups, variants, products] = await Promise.all([
    getDeliveryConfig(getDb(), ctx.scope), loadEditorLookups(ctx.scope, ctx.limits),
    ctx.scope.from(t.productVariants, eq(t.productVariants.isActive, true)), ctx.scope.from(t.products),
  ]);
  const warehouses = isModuleOn(ctx.store, ctx.limits, "warehouses") ? (await listWarehouses(ctx.scope)).filter((w) => w.isActive).map((w) => ({ id: w.id, name: w.name })) : [];
  const pById = new Map(products.map((p) => [p.id, p]));
  const items = lookups.components.map((c) => {
    const v = variants.find((x) => x.id === c.variantId)!;
    return { variantId: c.variantId, label: c.label, price: variantPrice(pById.get(v.productId)!, v), stock: v.stock };
  });
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">طلبية يدوية</h1><p className="text-muted">سجّل طلبية جات من واتساب أو إنستا أو اتصال في ثواني. المخزون ينقص تلقائياً.</p></div>
      <ManualOrderForm warehouses={warehouses} cities={delivery.rows.map((r) => ({ id: r.cityId, name: r.cityName, fee: r.isActive ? r.fee : null }))} items={items} writable={ctx.access.writable} />
    </div>
  );
}
