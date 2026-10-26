import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { moduleGate } from "@/components/dashboard/module-gate";
import { loadEditorLookups } from "@/server/catalog/editor-data";
import { getInvoice, listSuppliers } from "@/server/inventory/purchasing";
import { listWarehouses } from "@/server/inventory/warehouses";
import { isModuleOn } from "@/server/modules";
import { requireStoreContext } from "@/server/store-context";
import { InvoiceEditor } from "../invoice-editor";

export const metadata: Metadata = { title: "فاتورة شراء" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext("products");
  const gate = moduleGate(ctx, "purchasing");
  if (gate) return gate;
  const inv = await getInvoice(ctx.scope, (await params).id);
  if (!inv) notFound();
  const [suppliers, lookups] = await Promise.all([listSuppliers(ctx.scope), loadEditorLookups(ctx.scope, ctx.limits)]);
  const warehouses = isModuleOn(ctx.store, ctx.limits, "warehouses") ? (await listWarehouses(ctx.scope)).filter((w) => w.isActive).map((w) => ({ id: w.id, name: w.name })) : [];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl">فاتورة شراء #{inv.number}</h1>
      <InvoiceEditor
        initial={{ id: inv.id, number: inv.number, status: inv.status, supplierId: inv.supplierId, warehouseId: inv.warehouseId, note: inv.note, items: inv.items }}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} warehouses={warehouses} items={lookups.components} writable={ctx.access.writable}
      />
    </div>
  );
}
