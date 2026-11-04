import type { Metadata } from "next";
import { moduleGate } from "@/components/dashboard/module-gate";
import { listStocktakes, listWarehouses } from "@/server/inventory/warehouses";
import { requireStoreContext } from "@/server/store-context";
import { StocktakeList } from "./stocktake-list";

export const metadata: Metadata = { title: "الجرد" };

export default async function StocktakePage() {
  const ctx = await requireStoreContext("products");
  const gate = moduleGate(ctx, "warehouses");
  if (gate) return gate;
  const [list, warehouses] = await Promise.all([listStocktakes(ctx.scope), listWarehouses(ctx.scope)]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الجرد</h1><p className="text-muted">دخّل الكميات الحقيقية، والنظام يحسب الفرق ويسجله كحركة مخزون بسبب «جرد». تقدر تقفل المخزن أثناء الجرد.</p></div>
      <StocktakeList list={list} warehouses={warehouses.filter((w) => w.isActive).map((w) => ({ id: w.id, name: w.name }))} writable={ctx.access.writable} />
    </div>
  );
}
