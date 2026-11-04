import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import type { TrackedOrder } from "@/server/orders/create";
import { MediaImage } from "./ui";

const FLOW: OrderStatus[] = ["new", "confirmed", "with_courier", "delivered"];
const PAYMENT_LABEL: Record<string, string> = { cod: "الدفع عند الاستلام", bank_transfer: "تحويل مصرفي", gateway: "دفع إلكتروني" };
const PAYMENT_STATUS: Record<string, string> = { pending: "بانتظار الدفع", paid: "مدفوع", refunded: "مسترجع" };

/** مراحل الطلبية: جديدة ← مؤكدة ← مع المندوب ← تم التوصيل (أو مرتجعة/ملغية) */
export function OrderTimeline({ status, history }: { status: string; history: { status: string; at: number }[] }) {
  if (status === "cancelled" || status === "returned") {
    return <p className={cn("border-s-4 px-4 py-3 font-semibold", status === "cancelled" ? "border-red-600 bg-red-50 text-red-800" : "border-amber-600 bg-amber-50 text-amber-900")}>{ORDER_STATUS_LABELS[status]}</p>;
  }
  const current = Math.max(0, FLOW.indexOf(status as OrderStatus));
  const at = new Map(history.map((h) => [h.status, h.at]));
  return (
    <ol className="space-y-0" aria-label="حالة الطلبية">
      {FLOW.map((s, i) => {
        const done = i <= current;
        const when = at.get(s);
        return (
          <li key={s} className="relative flex gap-3 pb-5 last:pb-0" aria-current={i === current ? "step" : undefined}>
            {i < FLOW.length - 1 && <span aria-hidden className={cn("absolute start-[0.95rem] top-8 h-[calc(100%-1.5rem)] w-0.5", i < current ? "bg-(--sa)" : "bg-(--sp-line)")} />}
            <span className={cn("z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2", done ? "border-(--sa) bg-(--sa) text-(--sa-fg)" : "border-(--sp-line) bg-white text-transparent")}><Check className="size-4" /></span>
            <span className="pt-0.5">
              <span className={cn("block font-semibold", !done && "text-(--sp-muted)")}>{ORDER_STATUS_LABELS[s]}</span>
              {when && <span className="block text-xs text-(--sp-muted)">{new Date(when).toLocaleString("ar-LY-u-nu-latn", { dateStyle: "medium", timeStyle: "short" })}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderSummary({ order, panelClass }: { order: TrackedOrder; panelClass: string }) {
  return (
    <div className="space-y-6">
      <section className={cn(panelClass, "space-y-4")}>
        <h2 className="text-lg font-bold">حالة الطلبية</h2>
        <OrderTimeline status={order.status} history={order.history} />
        {order.shipmentNumber && (
          <p className="text-sm">{order.shippingCompany ? `شركة الشحن: ${order.shippingCompany} · ` : ""}رقم الشحنة: <b dir="ltr">{order.shipmentNumber}</b>{order.trackingUrl && <> · <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">تتبع الشحنة</a></>}</p>
        )}
      </section>

      <section className={cn(panelClass, "space-y-4")}>
        <h2 className="text-lg font-bold">تفاصيل الطلبية</h2>
        <ul className="divide-y divide-(--sp-line)">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex items-center gap-3 py-3 text-sm first:pt-0">
              <span className="size-14 shrink-0 overflow-hidden bg-(--sp-soft)">{i.imageMediaId && <MediaImage id={i.imageMediaId} alt="" sizes="56px" widths={[160]} />}</span>
              <span className="min-w-0 flex-1"><span className="line-clamp-2 font-medium">{i.name}</span>{i.variantLabel && <span className="block text-xs text-(--sp-muted)">{i.variantLabel}</span>}{i.personalization && <span className="block text-xs text-(--sp-muted)">✎ {i.personalization}</span>}<span className="text-xs text-(--sp-muted)">الكمية: {i.quantity}</span></span>
              <span className="font-semibold">{formatMoney(i.unitPrice * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1.5 border-t border-(--sp-line) pt-4 text-sm">
          <div className="flex justify-between"><dt>المجموع</dt><dd>{formatMoney(order.subtotal)}</dd></div>
          {order.discount > 0 && <div className="flex justify-between text-green-700"><dt>الخصم{order.couponCode ? ` (${order.couponCode})` : ""}</dt><dd>−{formatMoney(order.discount)}</dd></div>}
          <div className="flex justify-between"><dt>التوصيل</dt><dd>{order.deliveryFee === 0 ? "مجاني" : formatMoney(order.deliveryFee)}</dd></div>
          <div className="flex justify-between border-t border-(--sp-line) pt-2 text-base font-bold"><dt>الإجمالي</dt><dd>{formatMoney(order.total)}</dd></div>
        </dl>
      </section>

      <section className={cn(panelClass, "space-y-1.5 text-sm")}>
        <h2 className="mb-2 text-lg font-bold">التوصيل والدفع</h2>
        <p><span className="text-(--sp-muted)">الاسم: </span>{order.customerName}</p>
        <p><span className="text-(--sp-muted)">المدينة: </span>{order.cityName}</p>
        <p><span className="text-(--sp-muted)">العنوان: </span>{order.address}</p>
        <p><span className="text-(--sp-muted)">الدفع: </span>{PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod} · {PAYMENT_STATUS[order.paymentStatus] ?? order.paymentStatus}</p>
      </section>
    </div>
  );
}
