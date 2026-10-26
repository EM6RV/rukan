"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { formatDateTime } from "@/lib/datetime";
import { openStocktakeAction } from "../actions";

export function StocktakeList({ list, warehouses, writable }: { list: { id: string; warehouse: string; status: "open" | "closed"; at: number; locked: boolean }[]; warehouses: { id: string; name: string }[]; writable: boolean }) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [lock, setLock] = useState(false);
  const { pending, error, setError } = useAct();
  const [busy, setBusy] = useState(false);
  async function open() {
    setError(null); setBusy(true);
    try {
      const r = await openStocktakeAction({ warehouseId, lock });
      if (!r.ok) return setError(r.error);
      router.push(`/dashboard/warehouses/stocktake/${r.data.id}`);
    } finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      {writable && (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-56"><Select label="المخزن" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></div>
          <Toggle checked={lock} onChange={setLock} label="اقفل المخزن أثناء الجرد" />
          <Button loading={busy || pending} onClick={open}><ClipboardCheck className="size-4" /> ابدأ جرد</Button>
        </Card>
      )}
      {error && <p role="alert" className={errorClass}>{error}</p>}
      {list.length === 0 ? <EmptyState title="ما فيه جرد لسه" description="ابدأ جرد لمخزن، دخّل الكميات الفعلية، واقفله." /> : (
        <ul className="grid gap-2">
          {list.map((s) => (
            <li key={s.id}><Link href={`/dashboard/warehouses/stocktake/${s.id}`}><Card className="flex flex-wrap items-center gap-3 p-4 hover:bg-surface-2/60"><b>{s.warehouse}</b><span className="text-sm text-muted">{formatDateTime(s.at)}</span><span className="flex-1" />{s.locked && s.status === "open" && <Badge tone="danger">مقفول</Badge>}<Badge tone={s.status === "open" ? "gold" : "success"}>{s.status === "open" ? "مفتوح" : "مقفول (منتهي)"}</Badge></Card></Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
