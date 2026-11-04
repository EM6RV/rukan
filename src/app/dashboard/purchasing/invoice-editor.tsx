"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { dateInputToMs, msToDateInput } from "@/lib/date-input";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { dirhamToInput, formatMoney, inputToDirham } from "@/lib/money";
import { cancelInvoiceAction, receiveInvoiceAction, saveInvoiceAction } from "./actions";

type Initial = {
  id: string; number: number; status: "draft" | "partial" | "received" | "cancelled"; supplierId: string; warehouseId: string | null; note: string | null; dueAt?: number | null;
  items: { id: string; variantId: string; name: string; quantity: number; received: number; unitCost: number; unitFactor?: number; batchNo?: string | null; expiresAt?: number | null }[];
};
/** factor: الشراء بالكرتونة (الكمية والتكلفة بالكرتونة)، والدفعة والصلاحية تتسجل عند الاستلام */
type Line = { variantId: string; quantity: string; cost: string; factor: string; batch: string; expires: string };

export function InvoiceEditor({ initial, suppliers, warehouses, items, writable }: { initial: Initial | null; suppliers: { id: string; name: string }[]; warehouses: { id: string; name: string }[]; items: { variantId: string; label: string }[]; writable: boolean }) {
  const router = useRouter();
  const { act, pending, error, setError } = useAct();
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(initial?.warehouseId ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [dueAt, setDueAt] = useState(msToDateInput(initial?.dueAt ?? null));
  const [lines, setLines] = useState<Line[]>(initial?.items.map((i) => ({ variantId: i.variantId, quantity: String(i.quantity), cost: dirhamToInput(i.unitCost), factor: String(i.unitFactor ?? 1), batch: i.batchNo ?? "", expires: msToDateInput(i.expiresAt ?? null) })) ?? []);
  const set = (i: number, patch: Partial<Line>) => setLines((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const [recv, setRecv] = useState<Record<string, string>>({});
  const editable = writable && (!initial || initial.status === "draft");
  const label = (id: string) => items.find((x) => x.variantId === id)?.label ?? initial?.items.find((i) => i.variantId === id)?.name ?? "؟";
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (inputToDirham(l.cost) || 0), 0);
  const [more, setMore] = useState(() => lines.some((l) => l.factor !== "1" || l.batch || l.expires));

  function save() {
    setError(null);
    const parsed: { variantId: string; quantity: number; unitCost: number; unitFactor: number; batchNo: string | null; expiresAt: number | null }[] = [];
    for (const l of lines) {
      const cost = inputToDirham(l.cost), q = Number(l.quantity), f = Number(l.factor) || 1;
      if (cost === null || cost === undefined) return setError(`اكتب سعر تكلفة «${label(l.variantId)}».`);
      if (!Number.isInteger(q) || q < 1) return setError(`كمية «${label(l.variantId)}» لازم تكون رقم صحيح.`);
      if (!Number.isInteger(f) || f < 1) return setError(`عدد الحبات في وحدة «${label(l.variantId)}» غير صحيح.`);
      parsed.push({ variantId: l.variantId, quantity: q, unitCost: cost, unitFactor: f, batchNo: l.batch.trim() || null, expiresAt: dateInputToMs(l.expires, "end") });
    }
    act(async () => {
      const r = await saveInvoiceAction({ id: initial?.id, supplierId, warehouseId: warehouseId || null, note, dueAt: dateInputToMs(dueAt, "end"), items: parsed });
      if (r.ok && !initial) router.replace(`/dashboard/purchasing/${r.data.id}`);
      return r;
    }, "تم حفظ الفاتورة");
  }
  function receive(all: boolean) {
    if (!initial) return;
    const receipts = all ? null : initial.items.map((i) => ({ itemId: i.id, quantity: Number(recv[i.id] ?? 0) || 0 }));
    act(() => receiveInvoiceAction(initial.id, receipts), all ? "تم استلام الكل" : "تم الاستلام");
  }

  return (
    <div className="space-y-5 pb-20">
      {initial && <div className="flex items-center gap-2"><Badge tone={initial.status === "received" ? "success" : initial.status === "cancelled" ? "danger" : initial.status === "partial" ? "gold" : "neutral"}>{{ draft: "مسودة", partial: "مستلمة جزئياً", received: "مستلمة", cancelled: "ملغية" }[initial.status]}</Badge></div>}
      {error && <p role="alert" className={errorClass}>{error}</p>}
      <Card>
        <CardHeader title="البيانات" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Select label="المورد" value={supplierId} disabled={!editable} onChange={(e) => setSupplierId(e.target.value)}>{suppliers.length === 0 && <option value="">أضف مورد أول</option>}{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          {warehouses.length > 0 && <Select label="المخزن اللي تدخله البضاعة" value={warehouseId} disabled={!editable} onChange={(e) => setWarehouseId(e.target.value)}><option value="">الرئيسي</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>}
          <Input label="تاريخ استحقاق الدفع للمورد (اختياري)" type="date" disabled={!editable} value={dueAt} onChange={(e) => setDueAt(e.target.value)} hint="يطلع في مستحقات الموردين والمتأخر" />
          <div className="sm:col-span-2"><Textarea label="ملاحظة" rows={2} maxLength={300} disabled={!editable} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="الأصناف" description={`الإجمالي ${formatMoney(total)}`} action={editable ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={more} onChange={(e) => setMore(e.target.checked)} /> كرتونة ودفعة وصلاحية</label> : undefined} />
        <CardBody className="space-y-3">
          {lines.map((l, i) => {
            const got = initial?.items.find((x) => x.variantId === l.variantId);
            return (
              <div key={l.variantId} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 basis-48 truncate rounded-md border border-line px-3 py-2 text-sm">{label(l.variantId)}{got && initial?.status !== "draft" && <span className="text-muted"> · استُلم {got.received}/{got.quantity}</span>}</span>
                <input aria-label="الكمية" inputMode="numeric" disabled={!editable} value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} className="h-10 w-20 rounded-md border border-line bg-surface px-3 text-sm" />
                <input aria-label="سعر التكلفة (د.ل)" inputMode="decimal" disabled={!editable} placeholder="التكلفة" value={l.cost} onChange={(e) => set(i, { cost: e.target.value })} className="h-10 w-24 rounded-md border border-line bg-surface px-3 text-sm" />
                {(more || l.factor !== "1" || l.batch || l.expires) && <>
                  <input aria-label="حبات في الوحدة (1 = حبة، 24 = كرتونة)" title="حبات في الوحدة" inputMode="numeric" disabled={!editable} value={l.factor} onChange={(e) => set(i, { factor: e.target.value.replace(/\D/g, "") })} className="h-10 w-16 rounded-md border border-line bg-surface px-2 text-center text-sm" />
                  <input aria-label="رقم الدفعة" placeholder="الدفعة" disabled={!editable} value={l.batch} maxLength={40} onChange={(e) => set(i, { batch: e.target.value })} className="h-10 w-24 rounded-md border border-line bg-surface px-2 text-sm" />
                  <input aria-label="تاريخ الصلاحية" type="date" disabled={!editable} value={l.expires} onChange={(e) => set(i, { expires: e.target.value })} className="h-10 rounded-md border border-line bg-surface px-2 text-sm" />
                </>}
                {editable && <button type="button" aria-label="حذف" onClick={() => setLines((c) => c.filter((_, j) => j !== i))} className="flex size-10 items-center justify-center rounded-md text-danger-fg hover:bg-surface-2"><Trash2 className="size-5" /></button>}
                {writable && got && (initial?.status === "partial") && got.received < got.quantity && <input aria-label="كمية الاستلام" inputMode="numeric" placeholder="استلم" value={recv[got.id] ?? ""} onChange={(e) => setRecv({ ...recv, [got.id]: e.target.value })} className="h-10 w-20 rounded-md border border-gold bg-surface px-3 text-sm" />}
              </div>
            );
          })}
          {editable && (
            <select aria-label="أضف صنف" value="" onChange={(e) => e.target.value && setLines((c) => [...c, { variantId: e.target.value, quantity: "1", cost: "", factor: "1", batch: "", expires: "" }])} className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm">
              <option value="">+ أضف صنف…</option>
              {items.filter((i) => !lines.some((l) => l.variantId === i.variantId)).map((i) => <option key={i.variantId} value={i.variantId}>{i.label}</option>)}
            </select>
          )}
        </CardBody>
      </Card>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:start-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-3 lg:px-5">
          {initial && writable && (initial.status === "draft" || initial.status === "partial") && (
            <>
              {initial.status === "draft" && <Button variant="ghost" loading={pending} onClick={() => act(() => cancelInvoiceAction(initial.id), "اتلغت الفاتورة")}>إلغاء الفاتورة</Button>}
              {initial.status === "partial" && <Button variant="outline" loading={pending} onClick={() => receive(false)}>استلم الكميات المكتوبة</Button>}
              <Button loading={pending} onClick={() => receive(true)}>استلم كل المتبقي</Button>
            </>
          )}
          {editable && <Button loading={pending} variant={initial ? "outline" : "primary"} disabled={lines.length === 0 || !supplierId} onClick={save}>{initial ? "حفظ التعديلات" : "حفظ الفاتورة"}</Button>}
        </div>
      </div>
    </div>
  );
}
