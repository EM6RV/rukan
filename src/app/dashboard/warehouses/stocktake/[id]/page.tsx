import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { moduleGate } from "@/components/dashboard/module-gate";
import { getStocktake } from "@/server/inventory/warehouses";
import { requireStoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { eq } from "drizzle-orm";
import { StocktakeCount } from "./stocktake-count";

export const metadata: Metadata = { title: "جرد" };

export default async function StocktakeDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext("products");
  const gate = moduleGate(ctx, "warehouses");
  if (gate) return gate;
  const st = await getStocktake(ctx.scope, (await params).id);
  if (!st) notFound();
  const [w] = await ctx.scope.from(t.warehouses, eq(t.warehouses.id, st.warehouseId)).limit(1);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">جرد: {w?.name}</h1><p className="text-muted">{st.status === "open" ? "دخّل الكمية الفعلية لكل منتج (اللي تتركه فاضي ما يتعدلش)، ثم أقفل الجرد." : "الجرد مقفول."}</p></div>
      <StocktakeCount id={st.id} status={st.status} items={st.items} writable={ctx.access.writable} />
    </div>
  );
}
