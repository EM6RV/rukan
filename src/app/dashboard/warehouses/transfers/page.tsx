import type { Metadata } from "next";
import { moduleGate } from "@/components/dashboard/module-gate";
import { loadEditorLookups } from "@/server/catalog/editor-data";
import { listTransfers, listWarehouses } from "@/server/inventory/warehouses";
import { requireStoreContext } from "@/server/store-context";
import { TransferManager } from "./transfer-manager";

export const metadata: Metadata = { title: "التحويلات بين المخازن" };

export default async function TransfersPage() {
  const ctx = await requireStoreContext("products");
  const gate = moduleGate(ctx, "warehouses");
  if (gate) return gate;
  const [transfers, warehouses, lookups] = await Promise.all([listTransfers(ctx.scope), listWarehouses(ctx.scope), loadEditorLookups(ctx.scope, ctx.limits)]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">التحويلات بين المخازن</h1><p className="text-muted">مسودة ← في الطريق ← مستلم. البضاعة تطلع من المصدر لما ترسل، وتدخل الوجهة لما تستلم.</p></div>
      <TransferManager transfers={transfers} warehouses={warehouses.filter((w) => w.isActive).map((w) => ({ id: w.id, name: w.name }))} items={lookups.components} writable={ctx.access.writable} />
    </div>
  );
}
