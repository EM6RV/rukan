"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import { OrderStatusBadge, PaymentBadge } from "@/components/dashboard/order-status";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm";
import { enterDelay, enterItem } from "@/components/ui/motion";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/money";
import { toWhatsappNumber } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import type { OrderListItem } from "@/server/orders/manage";
import { changeStatusAction } from "../actions";

export type CourierSummary = { pendingOrders: number; pendingCash: number; balance: number };

const btn = "inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 text-[15px] font-semibold transition-colors hover:bg-surface-2 active:scale-[0.98]";

/** واجهة المندوب (جوال أولاً): ملخص الكاش، وكل طلبية بأزرار كبيرة: اتصال، خريطة، واتساب، تم التوصيل */
export function CourierOrders({ rows, summary, writable }: { rows: OrderListItem[]; summary: CourierSummary; writable: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<OrderListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  function deliver(o: OrderListItem) {
    setError(null);
    start(async () => {
      let r: Awaited<ReturnType<typeof changeStatusAction>>;
      try { r = await changeStatusAction({ orderId: o.id, to: "delivered" }); } catch { return setError("ما قدرنا نوصل للسيرفر. تأكد من الإنترنت وجرّب مرة ثانية."); }
      if (!r.ok) return setError(r.error);
      setConfirming(null);
      toast(`تم تسجيل توصيل الطلبية #${o.number}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {([["معاك الحين", String(summary.pendingOrders), "طلبية"], ["كاش متوقع", formatMoney(summary.pendingCash), "من طلبياتك"], ["كاش عندك", formatMoney(summary.balance), "لازم تسلّمه"]] as const).map(([label, value, hint]) => (
          <Card key={label} className="p-3 text-center">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-base font-bold tabular-nums tracking-tight sm:text-xl">{value}</p>
            <p className="text-[11px] text-muted">{hint}</p>
          </Card>
        ))}
      </div>

      <ul className="space-y-3">
        {rows.map((o, i) => {
          const wa = toWhatsappNumber(o.customerPhone);
          const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address}، ${o.cityName}، ليبيا`)}`;
          const cod = o.paymentMethod === "cod" && o.paymentStatus !== "paid";
          return (
            <li key={o.id} style={enterDelay(i)} className={enterItem}>
              <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link href={`/dashboard/orders/${o.id}`} className="inline-flex min-h-11 items-center font-bold hover:underline" dir="ltr">#{o.number}</Link>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <div className="text-end">
                    <p className="text-lg font-bold tabular-nums">{formatMoney(o.total)}</p>
                    {cod ? <p className="text-xs font-medium text-danger-fg">حصّل من الزبون</p> : <PaymentBadge method={o.paymentMethod} status={o.paymentStatus} />}
                  </div>
                </div>
                <div>
                  <p className="font-semibold">{o.customerName}</p>
                  <p className="text-sm text-muted">{o.cityName}، {o.address}</p>
                </div>
                <div className="flex gap-2">
                  <a href={`tel:${o.customerPhone}`} className={btn}><Phone className="size-4" aria-hidden /> اتصال</a>
                  <a href={map} target="_blank" rel="noopener noreferrer" className={btn}><MapPin className="size-4" aria-hidden /> الخريطة</a>
                  {wa && <a href={waLink(wa, `السلام عليكم، أنا مندوب التوصيل بخصوص طلبيتك رقم #${o.number}.`)} target="_blank" rel="noopener noreferrer" className={btn}><MessageCircle className="size-4" aria-hidden /> واتساب</a>}
                </div>
                {o.status === "with_courier" && (
                  <button type="button" disabled={!writable} onClick={() => { setError(null); setConfirming(o); }}
                    className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-gold px-5 text-base font-bold text-navy shadow-soft transition-all hover:brightness-95 active:scale-[0.98] disabled:opacity-50">
                    تم التوصيل
                  </button>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      <ConfirmModal
        open={!!confirming} onClose={() => setConfirming(null)} loading={pending} confirmLabel="تم التوصيل"
        title={confirming ? `توصيل الطلبية #${confirming.number}` : ""}
        message={error ?? (confirming ? (confirming.paymentMethod === "cod" && confirming.paymentStatus !== "paid" ? `استلمت ${formatMoney(confirming.total)} من ${confirming.customerName}؟ المبلغ يتسجل كاش عندك لين تسلّمه.` : `سلّمت الطلبية لـ ${confirming.customerName}؟`) : "")}
        onConfirm={() => confirming && deliver(confirming)}
      />
    </div>
  );
}
