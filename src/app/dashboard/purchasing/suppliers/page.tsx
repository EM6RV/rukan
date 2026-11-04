import type { Metadata } from "next";
import { moduleGate } from "@/components/dashboard/module-gate";
import { listAccounts } from "@/server/accounting/ledger";
import { loadEditorLookups } from "@/server/catalog/editor-data";
import { listSuppliers } from "@/server/inventory/purchasing";
import { listWarehouses } from "@/server/inventory/warehouses";
import { isModuleOn } from "@/server/modules";
import { requireStoreContext } from "@/server/store-context";
import { SupplierManager } from "./supplier-manager";

export const metadata: Metadata = { title: "الموردين" };

export default async function SuppliersPage() {
  const ctx = await requireStoreContext("products");
  const gate = moduleGate(ctx, "purchasing");
  if (gate) return gate;
  const accountingOn = isModuleOn(ctx.store, ctx.limits, "accounting");
  const [suppliers, accounts, lookups] = await Promise.all([listSuppliers(ctx.scope), accountingOn ? listAccounts(ctx.scope) : [], loadEditorLookups(ctx.scope, ctx.limits)]);
  const warehouses = isModuleOn(ctx.store, ctx.limits, "warehouses") ? (await listWarehouses(ctx.scope)).filter((w) => w.isActive).map((w) => ({ id: w.id, name: w.name })) : [];
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الموردين</h1><p className="text-muted">رصيد كل مورد = قيمة المستلم − الدفعات − المرتجعات (الموجب يعني عليك له).</p></div>
      <SupplierManager suppliers={suppliers} accounts={accounts.filter((a) => !a.readOnly && a.isActive).map((a) => ({ id: a.id, name: a.name }))} items={lookups.components} warehouses={warehouses} writable={ctx.access.writable} />
    </div>
  );
}
