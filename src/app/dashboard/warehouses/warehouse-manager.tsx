"use client";

import { useState } from "react";
import { Lock, Plus, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Toggle } from "@/components/ui/toggle";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { formatMoney } from "@/lib/money";
import { saveWarehouseAction, setDefaultWarehouseAction } from "./actions";

type Row = { id: string; name: string; address: string | null; isDefault: boolean; isActive: boolean; isLocked: boolean; units: number; cost: number; retail: number };

function Form({ initial, onClose }: { initial?: Row; onClose: () => void }) {
  const [v, setV] = useState({ name: initial?.name ?? "", address: initial?.address ?? "", isActive: initial?.isActive ?? true });
  const { act, pending, error } = useAct();
  return (
    <Modal open onClose={onClose} title={initial ? "تعديل المخزن" : "مخزن جديد"} footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={() => act(() => saveWarehouseAction({ id: initial?.id, ...v }), "تم الحفظ", onClose)}>حفظ</Button></>}>
      <div className="space-y-4">
        <Input label="اسم المخزن" value={v.name} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Input label="العنوان (اختياري)" value={v.address} maxLength={200} onChange={(e) => setV({ ...v, address: e.target.value })} />
        {initial && !initial.isDefault && <Toggle checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} label="فعّال" />}
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

export function WarehouseManager({ rows, quota, writable }: { rows: Row[]; quota: { max: number | null; used: number }; writable: boolean }) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const { act, pending, error } = useAct();
  const full = quota.max !== null && quota.used >= quota.max;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{quota.used} {quota.max === null ? "مخزن (بدون حد في باقتك)" : `من ${quota.max} مخازن`}</p>
        <Button disabled={!writable || full} onClick={() => setEditing("new")}><Plus className="size-4" /> مخزن جديد</Button>
      </div>
      {full && <p className="text-sm text-muted">وصلت لحد المخازن في باقتك. رقّي الباقة أو اشترِ مخزن إضافي من صفحة الاشتراك.</p>}
      {error && <p role="alert" className={errorClass}>{error}</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((w) => (
          <li key={w.id}>
            <Card className={`space-y-3 p-4 ${w.isActive ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{w.name}</h2>
                {w.isDefault && <Badge tone="gold"><Star className="size-3" aria-hidden /> الرئيسي</Badge>}
                {w.isLocked && <Badge tone="danger"><Lock className="size-3" aria-hidden /> مقفول للجرد</Badge>}
                {!w.isActive && <Badge>موقوف</Badge>}
              </div>
              {w.address && <p className="text-sm text-muted">{w.address}</p>}
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-muted">القطع</dt><dd className="font-bold tabular-nums">{w.units}</dd></div>
                <div><dt className="text-muted">بالتكلفة</dt><dd className="font-bold tabular-nums">{formatMoney(w.cost)}</dd></div>
                <div><dt className="text-muted">بسعر البيع</dt><dd className="font-bold tabular-nums">{formatMoney(w.retail)}</dd></div>
              </dl>
              {writable && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(w)}>تعديل</Button>
                  {!w.isDefault && w.isActive && <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setDefaultWarehouseAction(w.id), "صار المخزن الرئيسي")}>اجعله الرئيسي</Button>}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
      {editing && <Form key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
