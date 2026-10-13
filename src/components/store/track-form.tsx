"use client";

import { useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TrackedOrder } from "@/server/orders/create";
import { trackOrderAction } from "@/app/s/[key]/actions";
import { OrderSummary } from "./order-summary";
import { useStore } from "./store-context";
import { getKit } from "./templates";

export function TrackForm({ initialNumber }: { initialNumber?: string }) {
  const store = useStore();
  const kit = getKit(store.template);
  const [number, setNumber] = useState(initialNumber ?? "");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOrder(null);
    start(async () => {
      const r = await trackOrderAction(store.key, number, phone);
      if (r.ok) setOrder(r.order);
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className={cn(kit.cls.panel, "space-y-4")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><label htmlFor="tr-number" className="block text-sm font-semibold">رقم الطلبية</label><input id="tr-number" required inputMode="numeric" dir="ltr" placeholder="1001" value={number} onChange={(e) => setNumber(e.target.value)} className={cn(kit.cls.input, "text-right")} /></div>
          <div className="space-y-1.5"><label htmlFor="tr-phone" className="block text-sm font-semibold">رقم الهاتف</label><input id="tr-phone" required type="tel" inputMode="tel" dir="ltr" placeholder="09X XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} className={cn(kit.cls.input, "text-right")} /></div>
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
        <button type="submit" disabled={pending} className={kit.cls.btn}>{pending ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />} تتبع الطلبية</button>
      </form>
      {order && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">طلبية رقم #{order.number}</h2>
          <OrderSummary order={order} panelClass={kit.cls.panel} />
        </div>
      )}
    </div>
  );
}
