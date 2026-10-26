"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, PhoneInput, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { errorClass } from "@/components/dashboard/use-act";
import { formatMoney, inputToDirham } from "@/lib/money";
import { MANUAL_SOURCE_LABELS, MANUAL_SOURCES } from "@/lib/manual-sources";
import { createManualOrderAction } from "./actions";

type City = { id: string; name: string; fee: number | null };
type Item = { variantId: string; label: string; price: number; stock: number };

export function ManualOrderForm({ cities, items, warehouses, writable }: { cities: City[]; items: Item[]; warehouses: { id: string; name: string }[]; writable: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({ name: "", phone: "", cityId: "", address: "", notes: "", source: "whatsapp" as (typeof MANUAL_SOURCES)[number], payment: "cod" as "cod" | "bank_transfer", fee: "", discount: "", warehouseId: "" });
  const [lines, setLines] = useState<{ variantId: string; quantity: string }[]>([]);

  const city = cities.find((c) => c.id === v.cityId);
  const feeInput = v.fee.trim() ? inputToDirham(v.fee) : null;
  const fee = feeInput === undefined ? 0 : feeInput ?? city?.fee ?? 0;
  const subtotal = useMemo(() => lines.reduce((s, l) => s + (items.find((i) => i.variantId === l.variantId)?.price ?? 0) * (Number(l.quantity) || 0), 0), [lines, items]);
  const discount = v.discount.trim() ? inputToDirham(v.discount) ?? 0 : 0;
  const total = Math.max(0, subtotal - Math.min(discount, subtotal)) + fee;

  function submit() {
    setError(null);
    const fe = v.fee.trim() ? inputToDirham(v.fee) : null;
    const di = v.discount.trim() ? inputToDirham(v.discount) : 0;
    if (fe === undefined || di === undefined || di === null) return setError("السعر أو الخصم غير صحيح.");
    if (!lines.length) return setError("أضف منتج واحد على الأقل.");
    start(async () => {
      const r = await createManualOrderAction({
        items: lines.map((l) => ({ variantId: l.variantId, quantity: Number(l.quantity) })), name: v.name, phone: v.phone, cityId: v.cityId, address: v.address, notes: v.notes,
        paymentMethod: v.payment, manualSource: v.source, deliveryFee: fe, discount: di, warehouseId: v.warehouseId || null,
      });
      if (!r.ok) return setError(r.error);
      toast(`تم تسجيل الطلبية #${r.data.number}`);
      router.push(`/dashboard/orders/${r.data.orderId}`);
    });
  }

  return (
    <div className="space-y-5 pb-24">
      <Card>
        <CardHeader title="الزبون" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Input label="الاسم" value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <PhoneInput value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          <Select label="المدينة" value={v.cityId} onChange={(e) => setV({ ...v, cityId: e.target.value })}>
            <option value="">اختار المدينة</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}{c.fee !== null ? ` — ${formatMoney(c.fee)}` : ""}</option>)}
          </Select>
          <Select label="مصدر الطلبية" value={v.source} onChange={(e) => setV({ ...v, source: e.target.value as typeof v.source })}>{MANUAL_SOURCES.map((s) => <option key={s} value={s}>{MANUAL_SOURCE_LABELS[s]}</option>)}</Select>
          <div className="sm:col-span-2"><Input label="العنوان" value={v.address} maxLength={200} onChange={(e) => setV({ ...v, address: e.target.value })} /></div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="المنتجات" />
        <CardBody className="space-y-3">
          {lines.map((l, i) => {
            const it = items.find((x) => x.variantId === l.variantId);
            return (
              <div key={l.variantId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate rounded-md border border-line px-3 py-2 text-sm">{it?.label} <span className="text-muted">· {formatMoney(it?.price ?? 0)} · متوفر {it?.stock}</span></span>
                <input aria-label="الكمية" inputMode="numeric" value={l.quantity} onChange={(e) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className="h-10 w-20 rounded-md border border-line bg-surface px-3 text-sm" />
                <button type="button" aria-label="حذف" onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))} className="flex size-10 items-center justify-center rounded-md text-danger-fg hover:bg-surface-2"><Trash2 className="size-5" /></button>
              </div>
            );
          })}
          <select aria-label="أضف منتج" value="" onChange={(e) => e.target.value && setLines((cur) => [...cur, { variantId: e.target.value, quantity: "1" }])} className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm">
            <option value="">+ أضف منتج…</option>
            {items.filter((i) => !lines.some((l) => l.variantId === i.variantId)).map((i) => <option key={i.variantId} value={i.variantId}>{i.label} ({formatMoney(i.price)})</option>)}
          </select>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="الدفع والتوصيل" />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Select label="طريقة الدفع" value={v.payment} onChange={(e) => setV({ ...v, payment: e.target.value as typeof v.payment })}><option value="cod">عند الاستلام</option><option value="bank_transfer">تحويل مصرفي</option></Select>
          <Input label="سعر التوصيل (د.ل)" inputMode="decimal" value={v.fee} placeholder={city?.fee != null ? String(city.fee / 1000) : "حسب المدينة"} onChange={(e) => setV({ ...v, fee: e.target.value })} hint="اتركه فاضي لسعر المدينة" />
          <Input label="خصم (د.ل)" inputMode="decimal" value={v.discount} onChange={(e) => setV({ ...v, discount: e.target.value })} />
          {warehouses.length > 0 && <Select label="تنسحب من مخزن" value={v.warehouseId} onChange={(e) => setV({ ...v, warehouseId: e.target.value })}><option value="">الرئيسي</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>}
          <div className="sm:col-span-3"><Textarea label="ملاحظات (اختياري)" rows={2} maxLength={300} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
        </CardBody>
      </Card>

      {error && <p role="alert" className={errorClass}>{error}</p>}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:start-64">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 lg:px-5">
          <p className="text-sm">الإجمالي: <b className="text-lg tabular-nums">{formatMoney(total)}</b></p>
          <Button size="lg" loading={pending} disabled={!writable} onClick={submit}><Plus className="size-4" /> تسجيل الطلبية</Button>
        </div>
      </div>
    </div>
  );
}
