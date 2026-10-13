"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, TriangleAlert, Truck } from "lucide-react";
import { OrderStatusBadge, PaymentBadge } from "@/components/dashboard/order-status";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { OrderStatus } from "@/lib/constants";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { enterDelay, enterItem } from "@/components/ui/motion";
import { bulkAssignAction } from "./actions";

export type Row = {
  id: string; number: number; customerName: string; customerPhone: string; cityName: string; total: number; status: OrderStatus;
  paymentMethod: string; paymentStatus: string; courierName: string | null; createdAt: number; flagged: boolean; itemCount: number;
};

export function OrderTable({ rows, couriers, canBulk }: { rows: Row[]; couriers: { id: string; name: string }[]; canBulk: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [courierId, setCourierId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function assign() {
    setError(null);
    start(async () => {
      let r: Awaited<ReturnType<typeof bulkAssignAction>>;
      try { r = await bulkAssignAction([...selected], courierId || null); } catch { return setError("ما قدرنا نوصل للسيرفر. تأكد من الإنترنت وجرّب مرة ثانية."); }
      if (!r.ok) return setError(r.error);
      toast(`تم تعيين المندوب لـ ${r.data.count} طلبية`);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {canBulk && selected.size > 0 && (
        <div className="sticky top-14 z-20 animate-[fade-up_0.2s_ease-out_both] space-y-2 rounded-xl border border-gold/50 bg-surface p-3 shadow-lift lg:top-2">
          <div className="flex flex-wrap items-end gap-2">
            <span className="pb-2.5 text-sm font-medium">{selected.size} محددة</span>
            <div className="min-w-40 flex-1">
              <Select aria-label="المندوب" value={courierId} onChange={(e) => setCourierId(e.target.value)}>
                <option value="">بدون مندوب</option>
                {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <Button onClick={assign} loading={pending}>تعيين</Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>إلغاء</Button>
          </div>
          {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
        </div>
      )}
      <ul className="space-y-2">
        {rows.map((o, i) => (
          <li key={o.id} style={enterDelay(i)} className={`${enterItem} flex items-stretch gap-2 rounded-2xl border bg-surface shadow-soft transition-colors hover:border-gold/60 ${selected.has(o.id) ? "border-gold bg-gold/5" : "border-line"}`}>
            {canBulk && (
              <label className="flex min-w-12 cursor-pointer items-center justify-center ps-1" aria-label={`تحديد الطلبية ${o.number}`}>
                <input type="checkbox" className="size-5 accent-[var(--color-gold)]" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
              </label>
            )}
            <Link href={`/dashboard/orders/${o.id}`} className="grid min-w-0 flex-1 gap-1.5 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold" dir="ltr">#{o.number}</span>
                  <OrderStatusBadge status={o.status} />
                  {o.flagged && <span className="inline-flex items-center gap-1 text-xs font-medium text-danger-fg"><TriangleAlert className="size-3.5" aria-hidden /> زبون مزعج</span>}
                </div>
                <p className="truncate">{o.customerName} <span dir="ltr" className="ms-2 text-sm text-muted">{o.customerPhone}</span></p>
                <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
                  <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{o.cityName}</span>
                  {o.courierName && <span className="inline-flex items-center gap-1"><Truck className="size-3.5" aria-hidden />{o.courierName}</span>}
                  <span>{formatDateTime(o.createdAt)}</span>
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                <span className="text-lg font-bold">{formatMoney(o.total)}</span>
                <PaymentBadge method={o.paymentMethod} status={o.paymentStatus} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
