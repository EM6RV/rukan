import type { Metadata } from "next";
import { moduleGate } from "@/components/dashboard/module-gate";
import { loadEditorLookups } from "@/server/catalog/editor-data";
import { listSuppliers } from "@/server/inventory/purchasing";
import { listWarehouses } from "@/server/inventory/warehouses";
import { isModuleOn } from "@/server/modules";
import { requireStoreContext } from "@/server/store-context";
import { InvoiceEditor } from "../invoice-editor";

export const metadata: Metadata = { title: "فاتورة شراء جديدة" };

export default async function NewInvoicePage() {
  const ctx = await requireStoreContext("products");
  const gate = moduleGate(ctx, "purchasing");
  if (gate) return gate;
  const [suppliers, lookups] = await Promise.all([listSuppliers(ctx.scope), loadEditorLookups(ctx.scope, ctx.limits)]);
  const warehouses = isModuleOn(ctx.store, ctx.limits, "warehouses") ? (await listWarehouses(ctx.scope)).filter((w) => w.isActive).map((w) => ({ id: w.id, name: w.name })) : [];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl">فاتورة شراء جديدة</h1>
      <InvoiceEditor initial={null} suppliers={suppliers.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name }))} warehouses={warehouses} items={lookups.components} writable={ctx.access.writable} />
    </div>
  );
}
