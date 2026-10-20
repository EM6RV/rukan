"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, CheckCircle2, ChevronDown, FileText, MessageCircle, PackageCheck, Printer, RotateCcw, Truck, TriangleAlert } from "lucide-react";
import { OrderStatusBadge, PaymentBadge } from "@/components/dashboard/order-status";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants";
import { formatDateTimeYear } from "@/lib/datetime";
import { dirhamToInput, formatMoney, inputToDirham } from "@/lib/money";
import { RETURN_REASONS, RETURN_REASON_LABELS } from "@/lib/order-flow";
import { changeStatusAction, paymentStatusAction, registerReturnAction, reviewReceiptAction, updateOrderAction } from "../actions";

type Props = {
  writable: boolean; isCourier: boolean; showCourier: boolean; statuses: OrderStatus[]; canReturn: boolean;
  messages: { key: string; label: string; href: string }[];
  couriers: { id: string; name: string }[];
  order: {
    id: string; number: number; status: OrderStatus; createdAt: number; customerName: string; customerPhone: string; cityName: string; address: string; notes: string | null;
    paymentMethod: string; paymentStatus: string; subtotal: number; discount: number; deliveryFee: number; total: number; couponCode: string | null;
    courierId: string | null; shipmentNumber: string | null; internalNotes: string | null; source: string | null;
  };
  items: { id: string; name: string; variantLabel: string | null; unitPrice: number; quantity: number; imageMediaId: string | null; remaining: number }[];
  history: { id: string; from: OrderStatus | null; to: OrderStatus; note: string | null; at: number; actor: string | null }[];
  receipts: { id: string; status: "pending" | "approved" | "rejected"; url: string; at: number }[];
  returns: { id: string; reason: string; note: string | null; restocked: boolean; shippingLoss: number; at: number; items: { name: string; quantity: number }[] }[];
  courierName: string | null;
  customer: { id: string; flag: "none" | "problematic"; ordersCount: number; returnedCount: number } | null;
};

type Res = { ok: boolean; error?: string };

/** ينفذ أكشن ويعرض الخطأ/النجاح ويحدّث الصفحة */
function useAct() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<Res>, success: string, onDone?: () => void) => {
    setError(null);
    start(async () => {
      let r: Awaited<ReturnType<typeof fn>>;
      try { r = await fn(); } catch { return setError("ما قدرنا نوصل للسيرفر. تأكد من الإنترنت وجرّب مرة ثانية."); }
      if (!r.ok) return setError(r.error ?? "صار خطأ");
      toast(success);
      onDone?.();
      router.refresh();
    });
  };
  return { act, pending, error, setError };
}

const ErrorLine = ({ error }: { error: string | null }) => (error ? <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{error}</p> : null);

export function OrderDetailView(p: Props) {
  const { order } = p;
  const [modal, setModal] = useState<null | { type: "status"; to: OrderStatus } | { type: "return" } | { type: "edit" }>(null);
  const close = () => setModal(null);
  const locked = !p.writable;
  const router = useRouter();
  const { toast } = useToast();
  // تغيير الحالة يبان فوراً (والنافذة تنقفل)، ويرجع مع رسالة لو السيرفر رفض
  const [status, setOptimisticStatus] = useOptimistic(order.status);
  const [, startStatus] = useTransition();
  const quickStatus = (to: OrderStatus, note: string) => {
    close();
    startStatus(async () => {
      setOptimisticStatus(to);
      let r: Res;
      try { r = await changeStatusAction({ orderId: order.id, to, note, courierId: order.courierId ?? null, shipmentNumber: order.shipmentNumber ?? "" }); } catch { r = { ok: false, error: "ما قدرنا نوصل للسيرفر. تأكد من الإنترنت وجرّب مرة ثانية." }; }
      if (!r.ok) return toast(r.error ?? "صار خطأ", "error");
      toast(`الطلبية صارت «${ORDER_STATUS_LABELS[to]}»`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl"><span dir="ltr">#{order.number}</span><OrderStatusBadge status={status} /></h1>
          <p className="text-sm text-muted">{formatDateTimeYear(order.createdAt)}{order.source ? ` · من ${order.source}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink variant="outline" size="sm" href={`/print/orders/${order.id}?kind=invoice`} target="_blank"><Printer className="size-4" aria-hidden /> فاتورة</ButtonLink>
          {!p.isCourier && <ButtonLink variant="outline" size="sm" href={`/print/orders/${order.id}?kind=waybill`} target="_blank"><FileText className="size-4" aria-hidden /> بوليصة</ButtonLink>}
        </div>
      </header>

      {p.customer?.flag === "problematic" && (
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger-fg"><TriangleAlert className="size-5 shrink-0" aria-hidden /> هذا الزبون معلّم «مزعج». راجع ملاحظاته قبل ما تجهّز الطلبية.</div>
      )}
      {p.customer && p.customer.returnedCount >= 2 && p.customer.flag !== "problematic" && (
        <div className="flex items-center gap-2 rounded-lg bg-gold/20 px-4 py-3 text-sm font-medium"><TriangleAlert className="size-5 shrink-0" aria-hidden /> الزبون هذا رجّع {p.customer.returnedCount} طلبيات من {p.customer.ordersCount}.</div>
      )}

      {status === order.status && (p.statuses.length > 0 || p.canReturn || p.messages.length > 0) && (
        <Card><CardBody className="flex flex-wrap items-center gap-2">
          {p.statuses.map((s) => (
            <Button key={s} disabled={locked} variant={s === "cancelled" ? "outline" : s === "delivered" ? "secondary" : "primary"} onClick={() => setModal({ type: "status", to: s })}>
              {s === "confirmed" ? <Check className="size-4" aria-hidden /> : s === "with_courier" ? <Truck className="size-4" aria-hidden /> : s === "delivered" ? <PackageCheck className="size-4" aria-hidden /> : <Ban className="size-4" aria-hidden />}
              {ACTION_LABEL[s]}
            </Button>
          ))}
          {p.canReturn && <Button variant="outline" disabled={locked} onClick={() => setModal({ type: "return" })}><RotateCcw className="size-4" aria-hidden /> سجّل المرتجع</Button>}
          {p.messages.length > 0 && <WhatsappMenu messages={p.messages} />}
        </CardBody></Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="المنتجات" />
            <ul className="divide-y divide-line">
              {p.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 p-4">
                  {i.imageMediaId ? <img src={`/api/media/${i.imageMediaId}?w=160`} alt="" className="size-14 shrink-0 rounded-md bg-surface-2 object-cover" /> : <div className="size-14 shrink-0 rounded-md bg-surface-2" />}
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{i.name}</p>{i.variantLabel && <p className="text-sm text-muted">{i.variantLabel}</p>}<p className="text-sm text-muted">{formatMoney(i.unitPrice)} × {i.quantity}</p></div>
                  <span className="font-semibold">{formatMoney(i.unitPrice * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-line p-4 text-sm">
              <Row label="المجموع" value={formatMoney(order.subtotal)} />
              {order.discount > 0 && <Row label={`خصم${order.couponCode ? ` (${order.couponCode})` : ""}`} value={`− ${formatMoney(order.discount)}`} />}
              <Row label="التوصيل" value={order.deliveryFee ? formatMoney(order.deliveryFee) : "مجاني"} />
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>الإجمالي</dt><dd>{formatMoney(order.total)}</dd></div>
            </dl>
          </Card>

          {p.receipts.length > 0 && <Receipts receipts={p.receipts} canReview={!p.isCourier && !locked} />}
          {p.returns.length > 0 && (
            <Card>
              <CardHeader title="المرتجعات" />
              <ul className="divide-y divide-line">
                {p.returns.map((r) => (
                  <li key={r.id} className="space-y-1 p-4 text-sm">
                    <p className="font-medium">{RETURN_REASON_LABELS[r.reason as keyof typeof RETURN_REASON_LABELS] ?? r.reason} <span className="font-normal text-muted">· {formatDateTimeYear(r.at)}</span></p>
                    <p className="text-muted">{r.items.map((i) => `${i.name} × ${i.quantity}`).join("، ")}</p>
                    {r.note && <p>{r.note}</p>}
                    <p className="text-muted">{r.restocked ? "رجع للمخزون" : "ما رجعش للمخزون"}{r.shippingLoss > 0 ? ` · تكلفة توصيل ضايعة ${formatMoney(r.shippingLoss)}` : ""}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <History history={p.history} />
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="الزبون والتوصيل" action={!p.isCourier && !["delivered", "returned", "cancelled"].includes(order.status) ? <Button size="sm" variant="ghost" disabled={locked} onClick={() => setModal({ type: "edit" })}>تعديل</Button> : undefined} />
            <CardBody className="space-y-3 text-sm">
              <div><p className="font-semibold">{order.customerName}</p><a dir="ltr" href={`tel:${order.customerPhone}`} className="text-link">{order.customerPhone}</a></div>
              <div><p className="text-muted">{order.cityName}</p><p>{order.address}</p></div>
              {order.notes && <div className="rounded-md bg-surface-2 p-3"><p className="text-xs text-muted">ملاحظة الزبون</p><p>{order.notes}</p></div>}
              <div className="flex flex-wrap gap-1.5"><PaymentBadge method={order.paymentMethod} status={order.paymentStatus} /></div>
              {!p.isCourier && order.paymentStatus !== "paid" && order.status !== "cancelled" && order.status !== "returned" && <MarkPaid orderId={order.id} disabled={locked} />}
              {p.showCourier && <div className="border-t border-line pt-3">
                <p className="text-xs text-muted">المندوب</p>
                <p>{p.courierName ?? "ما تعيّنش"}{order.shipmentNumber ? <span className="text-muted"> · شحنة <span dir="ltr">{order.shipmentNumber}</span></span> : null}</p>
              </div>}
            </CardBody>
          </Card>
          {!p.isCourier && <InternalNotes orderId={order.id} value={order.internalNotes ?? ""} disabled={locked} />}
        </aside>
      </div>

      {modal?.type === "status" && <StatusModal key={modal.to} to={modal.to} order={order} couriers={p.couriers} onClose={close} onQuick={modal.to === "with_courier" ? undefined : (note) => quickStatus(modal.to, note)} />}
      {modal?.type === "return" && <ReturnModal order={order} items={p.items} onClose={close} />}
      {modal?.type === "edit" && <EditModal order={order} onClose={close} />}
    </div>
  );
}

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: "تأكيد الطلبية", with_courier: "تسليم لمندوب", delivered: "تم التوصيل", cancelled: "إلغاء الطلبية",
};

const Row = ({ label, value }: { label: string; value: string }) => <div className="flex justify-between"><dt className="text-muted">{label}</dt><dd>{value}</dd></div>;

function WhatsappMenu({ messages }: { messages: Props["messages"] }) {
  const [first, ...rest] = messages;
  return (
    <div className="flex">
      <a href={first!.href} target="_blank" rel="noopener noreferrer" className={`inline-flex h-11 items-center gap-2 bg-success px-4 text-[15px] font-semibold text-white hover:brightness-95 ${rest.length ? "rounded-s-md" : "rounded-md"}`}>
        <MessageCircle className="size-4" aria-hidden /> واتساب الزبون
      </a>
      {rest.length > 0 && (
        <details className="relative">
          <summary aria-label="رسائل أخرى" className="flex h-11 w-10 cursor-pointer list-none items-center justify-center rounded-e-md border-s border-white/30 bg-success text-white [&::-webkit-details-marker]:hidden"><ChevronDown className="size-4" /></summary>
          <ul className="absolute end-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-surface shadow-lift">
            {messages.map((m) => <li key={m.key}><a href={m.href} target="_blank" rel="noopener noreferrer" className="block px-3 py-2.5 text-sm hover:bg-surface-2">{m.label}</a></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function MarkPaid({ orderId, disabled }: { orderId: string; disabled: boolean }) {
  const { act, pending, error } = useAct();
  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" disabled={disabled} loading={pending} onClick={() => act(() => paymentStatusAction(orderId, "paid"), "تم تسجيل الدفع")}><CheckCircle2 className="size-4" aria-hidden /> سجّل إنها مدفوعة</Button>
      <ErrorLine error={error} />
    </div>
  );
}

function Receipts({ receipts, canReview }: { receipts: Props["receipts"]; canReview: boolean }) {
  const { act, pending, error } = useAct();
  const label = { pending: ["بانتظار المراجعة", "gold"], approved: ["مقبول", "success"], rejected: ["مرفوض", "danger"] } as const;
  return (
    <Card>
      <CardHeader title="إيصال التحويل" description="راجع الإيصال مع كشف حسابك قبل القبول." />
      <CardBody className="space-y-4">
        <ErrorLine error={error} />
        {receipts.map((r) => (
          <div key={r.id} className="flex flex-wrap items-start gap-4">
            <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label="فتح الإيصال بحجم كامل">
              <img src={r.url} alt="إيصال التحويل" className="h-40 w-32 rounded-md border border-line bg-surface-2 object-cover" />
            </a>
            <div className="space-y-2">
              <Badge tone={label[r.status][1]}>{label[r.status][0]}</Badge>
              <p className="text-sm text-muted">{formatDateTimeYear(r.at)}</p>
              {canReview && r.status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" loading={pending} onClick={() => act(() => reviewReceiptAction(r.id, "approved"), "تم قبول الإيصال")}>قبول</Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => reviewReceiptAction(r.id, "rejected"), "تم رفض الإيصال")}>رفض</Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function History({ history }: { history: Props["history"] }) {
  return (
    <Card>
      <CardHeader title="سجل الطلبية" />
      <ol className="space-y-0 p-5">
        {[...history].reverse().map((h, i, arr) => (
          <li key={h.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < arr.length - 1 && <span aria-hidden className="absolute start-[0.4375rem] top-4 h-full w-px bg-line" />}
            <span aria-hidden className="relative mt-1 size-3.5 shrink-0 rounded-full border-2 border-teal bg-surface" />
            <div className="min-w-0 text-sm">
              <p className="font-medium">{h.from === null ? "تم إنشاء الطلبية" : h.from === h.to ? (h.note ?? ORDER_STATUS_LABELS[h.to]) : `${ORDER_STATUS_LABELS[h.from]} ← ${ORDER_STATUS_LABELS[h.to]}`}</p>
              {h.from !== null && h.from !== h.to && h.note && <p className="text-muted">{h.note}</p>}
              <p className="text-xs text-muted">{formatDateTimeYear(h.at)}{h.actor ? ` · ${h.actor}` : ""}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function InternalNotes({ orderId, value, disabled }: { orderId: string; value: string; disabled: boolean }) {
  const [text, setText] = useState(value);
  const { act, pending, error } = useAct();
  return (
    <Card><CardBody className="space-y-3">
      <Textarea label="ملاحظات داخلية" hint="ما يشوفهاش الزبون" rows={3} maxLength={1000} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} />
      <ErrorLine error={error} />
      <Button size="sm" disabled={disabled || text === value} loading={pending} onClick={() => act(() => updateOrderAction(orderId, { internalNotes: text }), "تم الحفظ")}>حفظ الملاحظة</Button>
    </CardBody></Card>
  );
}

/** onQuick: الحالات اللي ما فيهاش خانات لازمة تتنفذ بشكل متفائل من الأب (النافذة تنقفل فوراً) */
function StatusModal({ to, order, couriers, onClose, onQuick }: { to: OrderStatus; order: Props["order"]; couriers: Props["couriers"]; onClose: () => void; onQuick?: (note: string) => void }) {
  const [courierId, setCourierId] = useState(order.courierId ?? "");
  const [shipment, setShipment] = useState(order.shipmentNumber ?? "");
  const [note, setNote] = useState("");
  const { act, pending, error } = useAct();
  const cash = order.paymentMethod === "cod" && order.paymentStatus !== "paid";
  const title = to === "cancelled" ? `إلغاء الطلبية #${order.number}` : to === "delivered" ? "تأكيد التوصيل" : to === "with_courier" ? "تسليم الطلبية لمندوب" : "تأكيد الطلبية";
  return (
    <Modal
      open onClose={onClose} title={title}
      footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button variant={to === "cancelled" ? "danger" : "primary"} loading={pending} onClick={() => (onQuick ? onQuick(note) : act(() => changeStatusAction({ orderId: order.id, to, note, courierId: courierId || null, shipmentNumber: shipment }), `الطلبية صارت «${ORDER_STATUS_LABELS[to]}»`, onClose))}>{to === "cancelled" ? "إلغاء الطلبية" : "تأكيد"}</Button></>}
    >
      <div className="space-y-4">
        {to === "with_courier" && (
          <>
            {couriers.length === 0 ? <p className="rounded-md bg-gold/20 px-3 py-2 text-sm">ما عندكش مندوبين. ضيف مندوب من صفحة «المندوبين» أول.</p> : (
              <Select label="المندوب" value={courierId} onChange={(e) => setCourierId(e.target.value)}><option value="">اختار المندوب</option>{couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            )}
            <Input label="رقم الشحنة (اختياري)" dir="ltr" className="text-right" value={shipment} maxLength={60} onChange={(e) => setShipment(e.target.value)} />
          </>
        )}
        {to === "delivered" && <p>{cash ? `المندوب استلم ${formatMoney(order.total)} من الزبون، وتنضاف لكاشه.` : "الطلبية تنقفل كـ «تم التوصيل»."}</p>}
        {to === "confirmed" && <p>الطلبية تتأكد وتجهّزها للتسليم.</p>}
        {to === "cancelled" && <p>المنتجات ترجع للمخزون والكوبون يتحرر. ما ينفعش ترجع الطلبية بعد الإلغاء.</p>}
        {(to === "cancelled" || to === "confirmed") && <Textarea label={to === "cancelled" ? "سبب الإلغاء (اختياري)" : "ملاحظة (اختياري)"} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}
        <ErrorLine error={error} />
      </div>
    </Modal>
  );
}

function ReturnModal({ order, items, onClose }: { order: Props["order"]; items: Props["items"]; onClose: () => void }) {
  const partialAllowed = order.status === "delivered";
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [restock, setRestock] = useState(true);
  const [loss, setLoss] = useState(dirhamToInput(order.status === "with_courier" ? order.deliveryFee : 0) || "0");
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.id, i.remaining])));
  const [localError, setLocalError] = useState<string | null>(null);
  const { act, pending, error } = useAct();

  function submit() {
    setLocalError(null);
    if (!reason) return setLocalError("اختار سبب المرتجع");
    const shippingLoss = inputToDirham(loss);
    if (shippingLoss === undefined || shippingLoss === null || shippingLoss < 0) return setLocalError("تكلفة التوصيل الضايعة مش رقم صحيح");
    const picked = items.map((i) => ({ orderItemId: i.id, quantity: qty[i.id] ?? 0 }));
    if (partialAllowed && picked.every((x) => x.quantity === 0)) return setLocalError("حدد كمية مرتجعة لمنتج واحد على الأقل");
    act(() => registerReturnAction({ orderId: order.id, reason, reasonNote: note, restock, shippingLoss, ...(partialAllowed ? { items: picked } : {}) }), "تم تسجيل المرتجع", onClose);
  }

  return (
    <Modal open onClose={onClose} title={`تسجيل مرتجع للطلبية #${order.number}`} footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={submit}>سجّل المرتجع</Button></>}>
      <div className="space-y-4">
        <Select label="سبب المرتجع" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">اختار السبب</option>{RETURN_REASONS.map((r) => <option key={r} value={r}>{RETURN_REASON_LABELS[r]}</option>)}</Select>
        {partialAllowed ? (
          <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium">الكميات المرتجعة</legend>
            {items.filter((i) => i.remaining > 0).map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 rounded-md bg-surface-2 p-2.5 text-sm">
                <span className="min-w-0 truncate">{i.name}{i.variantLabel ? ` (${i.variantLabel})` : ""}</span>
                <input aria-label={`كمية ${i.name}`} type="number" min={0} max={i.remaining} value={qty[i.id] ?? 0} onChange={(e) => setQty((q) => ({ ...q, [i.id]: Math.max(0, Math.min(i.remaining, Math.floor(Number(e.target.value)) || 0)) }))} className="h-9 w-20 rounded-md border border-line bg-surface px-2 text-center" />
              </div>
            ))}
          </fieldset>
        ) : <p className="rounded-md bg-surface-2 px-3 py-2 text-sm">الطلبية كلها ترجع (رفض الاستلام) وتتحول «مرتجعة».</p>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--color-teal)]" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> رجّع المنتجات للمخزون (خليها مقفولة لو المنتج تالف)</label>
        <Input label="تكلفة التوصيل الضايعة (د.ل)" inputMode="decimal" value={loss} onChange={(e) => setLoss(e.target.value)} hint="اللي دفعتها لشركة التوصيل وما رجعتش" />
        <Textarea label="ملاحظة (اختياري)" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        <ErrorLine error={localError ?? error} />
      </div>
    </Modal>
  );
}

function EditModal({ order, onClose }: { order: Props["order"]; onClose: () => void }) {
  const [v, setV] = useState({ customerName: order.customerName, customerPhone: order.customerPhone, address: order.address, notes: order.notes ?? "", fee: dirhamToInput(order.deliveryFee) || "0" });
  const [localError, setLocalError] = useState<string | null>(null);
  const { act, pending, error } = useAct();
  function submit() {
    const fee = inputToDirham(v.fee);
    if (fee === undefined || fee === null || fee < 0) return setLocalError("سعر التوصيل مش رقم صحيح");
    setLocalError(null);
    act(() => updateOrderAction(order.id, { customerName: v.customerName, customerPhone: v.customerPhone, address: v.address, notes: v.notes, deliveryFee: fee }), "تم الحفظ", onClose);
  }
  return (
    <Modal open onClose={onClose} title="تعديل بيانات الطلبية" footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={submit}>حفظ</Button></>}>
      <div className="space-y-4">
        <Input label="اسم الزبون" value={v.customerName} maxLength={80} onChange={(e) => setV({ ...v, customerName: e.target.value })} />
        <Input label="رقم الهاتف" dir="ltr" className="text-right" inputMode="tel" value={v.customerPhone} onChange={(e) => setV({ ...v, customerPhone: e.target.value })} />
        <Textarea label="العنوان" rows={2} maxLength={200} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
        <Input label="سعر التوصيل (د.ل)" inputMode="decimal" value={v.fee} onChange={(e) => setV({ ...v, fee: e.target.value })} hint="الإجمالي يتحسب من جديد" />
        <Textarea label="ملاحظة الزبون" rows={2} maxLength={300} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        <ErrorLine error={localError ?? error} />
      </div>
    </Modal>
  );
}
