"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { formatDate } from "@/lib/datetime";
import { cancelTransferAction, createTransferAction, receiveTransferAction, sendTransferAction } from "../actions";

type Tr = { id: string; number: number; status: "draft" | "in_transit" | "received" | "cancelled"; from: string; to: string; units: number; at: number; note: string | null };
const STATUS: Record<Tr["status"], [string, "neutral" | "gold" | "success" | "danger"]> = { draft: ["مسودة", "neutral"], in_transit: ["في الطريق", "gold"], received: ["مستلم", "success"], cancelled: ["ملغي", "danger"] };

function NewTransfer({ warehouses, items, onClose }: { warehouses: { id: string; name: string }[]; items: { variantId: string; label: string }[]; onClose: () => void }) {
  const [from, setFrom] = useState(warehouses[0]?.id ?? ""), [to, setTo] = useState(warehouses[1]?.id ?? "");
  const [lines, setLines] = useState<{ variantId: string; quantity: string }[]>([]);
  const { act, pending, error, setError } = useAct();
  function submit() {
    const parsed = lines.map((l) => ({ variantId: l.variantId, quantity: Number(l.quantity) }));
    if (parsed.some((l) => !Number.isInteger(l.quantity))) return setError("الكمية لازم تكون رقم صحيح.");
    act(() => createTransferAction({ fromWarehouseId: from, toWarehouseId: to, items: parsed }), "تم إنشاء التحويل (مسودة)", onClose);
  }
  return (
    <Modal open onClose={onClose} title="تحويل جديد" footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={submit}>إنشاء</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select label="من" value={from} onChange={(e) => setFrom(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
          <Select label="إلى" value={to} onChange={(e) => setTo(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
        </div>
        {lines.map((l, i) => (
          <div key={l.variantId} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded-md border border-line px-3 py-2 text-sm">{items.find((x) => x.variantId === l.variantId)?.label}</span>
            <input aria-label="الكمية" inputMode="numeric" value={l.quantity} onChange={(e) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className="h-10 w-20 rounded-md border border-line bg-surface px-3 text-sm" />
            <button type="button" aria-label="حذف" onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))} className="flex size-10 items-center justify-center rounded-md text-danger-fg hover:bg-surface-2"><Trash2 className="size-5" /></button>
          </div>
        ))}
        <select aria-label="أضف منتج" value="" onChange={(e) => e.target.value && setLines((cur) => [...cur, { variantId: e.target.value, quantity: "1" }])} className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm">
          <option value="">+ أضف منتج…</option>
          {items.filter((i) => !lines.some((l) => l.variantId === i.variantId)).map((i) => <option key={i.variantId} value={i.variantId}>{i.label}</option>)}
        </select>
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

export function TransferManager({ transfers, warehouses, items, writable }: { transfers: Tr[]; warehouses: { id: string; name: string }[]; items: { variantId: string; label: string }[]; writable: boolean }) {
  const [adding, setAdding] = useState(false);
  const { act, pending, error } = useAct();
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button disabled={!writable || warehouses.length < 2} onClick={() => setAdding(true)}><Plus className="size-4" /> تحويل جديد</Button></div>
      {warehouses.length < 2 && <p className="text-sm text-muted">تحتاج مخزنين على الأقل. أضف مخزن من صفحة «المخازن».</p>}
      {error && <p role="alert" className={errorClass}>{error}</p>}
      {transfers.length === 0 ? <EmptyState title="ما فيه تحويلات" description="حوّل بضاعة بين مخازنك وتابع حالتها." /> : (
        <ul className="grid gap-2">
          {transfers.map((x) => (
            <li key={x.id}>
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <b>#{x.number}</b><span>{x.from} ← {x.to}</span><span className="text-sm text-muted">{x.units} قطعة · {formatDate(x.at)}</span>
                <span className="flex-1" /><Badge tone={STATUS[x.status][1]}>{STATUS[x.status][0]}</Badge>
                {writable && x.status === "draft" && <Button size="sm" disabled={pending} onClick={() => act(() => sendTransferAction(x.id), "اتبعت (في الطريق)")}>إرسال</Button>}
                {writable && x.status === "in_transit" && <Button size="sm" disabled={pending} onClick={() => act(() => receiveTransferAction(x.id), "تم الاستلام")}>استلام</Button>}
                {writable && (x.status === "draft" || x.status === "in_transit") && <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => cancelTransferAction(x.id), "اتلغى التحويل")}>إلغاء</Button>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {adding && <NewTransfer warehouses={warehouses} items={items} onClose={() => setAdding(false)} />}
    </div>
  );
}
