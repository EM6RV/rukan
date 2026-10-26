import type { Metadata } from "next";
import { moduleGate } from "@/components/dashboard/module-gate";
import { findStockInconsistencies, inventoryValue, listWarehouses } from "@/server/inventory/warehouses";
import { requireStoreContext } from "@/server/store-context";
import { WarehouseManager } from "./warehouse-manager";

export const metadata: Metadata = { title: "المخازن" };

export default async function WarehousesPage() {
  const ctx = await requireStoreContext("products");
  const gate = moduleGate(ctx, "warehouses");
  if (gate) return gate;
  const [warehouses, values, problems] = await Promise.all([listWarehouses(ctx.scope), inventoryValue(ctx.scope), findStockInconsistencies(ctx.scope)]);
  const v = new Map(values.map((x) => [x.warehouseId, x]));
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">المخازن</h1><p className="text-muted">كمية كل منتج في كل مخزن، وقيمة المخزون بالتكلفة وبسعر البيع. المخزن الرئيسي هو اللي تنسحب منه الطلبيات العادية.</p></div>
      {problems.length > 0 && <p role="alert" className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger-fg">فيه {problems.length} منتج كميته في المخازن الفرعية أكبر من إجمالي مخزونه. راجع الأرصدة من «الجرد».</p>}
      <WarehouseManager
        rows={warehouses.map((w) => ({ ...w, cost: v.get(w.id)?.cost ?? 0, retail: v.get(w.id)?.retail ?? 0 }))}
        quota={{ max: ctx.limits.maxWarehouses ?? null, used: warehouses.filter((w) => w.isActive).length }} writable={ctx.access.writable}
      />
    </div>
  );
}
