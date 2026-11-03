import type { Metadata } from "next";
import { formatDateTimeYear } from "@/lib/datetime";
import { LINE_INFO, OPS_LINES } from "@/lib/product-lines";
import { listWarehouses } from "@/server/inventory/warehouses";
import { isModuleOn } from "@/server/modules";
import { listBranches } from "@/server/pos/branches";
import { requireStoreContext } from "@/server/store-context";
import { BranchesManager } from "./branches-manager";

export const metadata: Metadata = { title: "الفروع والأجهزة" };

export default async function BranchesPage() {
  const ctx = await requireStoreContext("settings");
  const branches = await listBranches(ctx.scope);
  const warehouses = isModuleOn(ctx.store, ctx.limits, "warehouses") ? await listWarehouses(ctx.scope) : [];
  const lines = OPS_LINES.filter((l) => ctx.lines[l].subscribed).map((l) => ({ line: l, name: LINE_INFO[l].brand }));
  const maxBranches = ctx.limits.maxBranches === undefined ? 1 : ctx.limits.maxBranches;
  const maxRegisters = ctx.lines.market.subscribed ? ctx.lines.market.limits?.maxRegisters ?? null : null;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">الفروع والأجهزة</h1>
        <p className="text-muted">لكل فرع كاشيراته وأجهزته وترقيم فواتيره ورأس وذيل الفاتورة. الجهاز يتفعّل مرة وحدة ويشتغل بعدها حتى بدون نت.</p>
      </div>
      <BranchesManager
        writable={ctx.access.writable}
        lines={lines}
        maxBranches={maxBranches}
        maxRegisters={maxRegisters}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        branches={branches.map((b) => ({
          id: b.id, name: b.name, address: b.address, phone: b.phone, warehouseId: b.warehouseId, isDefault: b.isDefault, isActive: b.isActive,
          receiptHeader: b.receiptHeader, receiptFooter: b.receiptFooter,
          registers: b.registers.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive })),
          devices: b.devices.map((d) => ({ id: d.id, name: d.name, line: d.line, kind: d.kind, registerId: d.registerId, lastSeen: d.lastSeenAt ? formatDateTimeYear(d.lastSeenAt) : null })),
        }))}
      />
    </div>
  );
}
