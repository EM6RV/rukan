"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import { formatDate } from "@/lib/datetime";
import { dirhamToInput, formatMoney, inputToDirham } from "@/lib/money";
import { dateInputToMs, msToDateInput } from "@/lib/date-input";
import type { CouponRow, CouponState } from "@/server/marketing/coupons";
import { deleteCouponAction, saveCouponAction, toggleCouponAction } from "./actions";

const STATE: Record<CouponState, [string, "success" | "neutral" | "gold" | "danger"]> = {
  active: ["فعّال", "success"], disabled: ["معطّل", "neutral"], scheduled: ["لسا ما بدا", "gold"], expired: ["منتهي", "danger"], exhausted: ["خلص عدده", "danger"],
};

type Res = { ok: boolean; error?: string };
function useAct() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<Res>, success: string, onDone?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "صار خطأ");
      toast(success);
      onDone?.();
      router.refresh();
    });
  };
  return { act, pending, error, setError };
}

function CouponForm({ initial, onClose }: { initial?: CouponRow; onClose: () => void }) {
  const [v, setV] = useState({
    code: initial?.code ?? "", type: initial?.type ?? "percent",
    value: initial ? (initial.type === "fixed" ? dirhamToInput(initial.value) : String(initial.value)) : "",
    minOrder: dirhamToInput(initial?.minOrder), maxUses: initial?.maxUses ? String(initial.maxUses) : "",
    startsAt: msToDateInput(initial?.startsAt ?? null), expiresAt: msToDateInput(initial?.expiresAt ?? null), isActive: initial?.isActive ?? true,
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const { act, pending, error } = useAct();

  function submit() {
    setLocalError(null);
    const value = v.type === "fixed" ? inputToDirham(v.value) : v.value.trim() === "" ? null : Number(v.value);
    if (value === null || value === undefined || !Number.isFinite(value)) return setLocalError("اكتب قيمة الخصم");
    const minOrder = inputToDirham(v.minOrder);
    if (minOrder === undefined) return setLocalError("الحد الأدنى للطلبية مش رقم صحيح");
    const maxUses = v.maxUses.trim() === "" ? null : Number(v.maxUses);
    if (maxUses !== null && !Number.isFinite(maxUses)) return setLocalError("عدد الاستخدامات مش رقم صحيح");
    act(() => saveCouponAction({ id: initial?.id, code: v.code, type: v.type, value, minOrder, maxUses, startsAt: dateInputToMs(v.startsAt, "start"), expiresAt: dateInputToMs(v.expiresAt, "end"), isActive: v.isActive }), "تم الحفظ", onClose);
  }

  return (
    <Modal open onClose={onClose} title={initial ? "تعديل الكوبون" : "كوبون جديد"} footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>رجوع</Button><Button loading={pending} onClick={submit}>حفظ</Button></>}>
      <div className="space-y-4">
        <Input label="الكود" dir="ltr" className="text-right uppercase" value={v.code} maxLength={20} disabled={!!initial && initial.usedCount > 0} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} hint="يكتبه الزبون عند الدفع، مثال: RAMADAN10" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="نوع الخصم" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as "percent" | "fixed", value: "" })}><option value="percent">نسبة %</option><option value="fixed">مبلغ ثابت</option></Select>
          <Input label={v.type === "percent" ? "النسبة (%)" : "المبلغ (د.ل)"} inputMode="decimal" value={v.value} onChange={(e) => setV({ ...v, value: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="حد أدنى للطلبية (د.ل)" inputMode="decimal" value={v.minOrder} onChange={(e) => setV({ ...v, minOrder: e.target.value })} hint="اختياري" />
          <Input label="عدد الاستخدامات" inputMode="numeric" value={v.maxUses} onChange={(e) => setV({ ...v, maxUses: e.target.value })} hint="فاضي = بدون حد" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="يبدأ من" type="date" value={v.startsAt} onChange={(e) => setV({ ...v, startsAt: e.target.value })} />
          <Input label="ينتهي في" type="date" value={v.expiresAt} onChange={(e) => setV({ ...v, expiresAt: e.target.value })} hint="آخر يوم يشتغل فيه" />
        </div>
        <Toggle checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} label="فعّال" />
        {(localError ?? error) && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{localError ?? error}</p>}
      </div>
    </Modal>
  );
}

export function CouponManager({ coupons, canEdit }: { coupons: CouponRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<CouponRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<CouponRow | null>(null);
  const toggle = useAct();
  const del = useAct();

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button disabled={!canEdit} onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> كوبون جديد</Button></div>
      {coupons.length === 0 ? (
        <EmptyState icon={<Ticket className="size-6" />} title="ما عندكش كوبونات" description="أنشئ كود خصم وشاركه مع زباينك في إنستغرام وتيك توك." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {coupons.map((c) => (
            <li key={c.id}>
              <Card className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><p dir="ltr" className="text-start text-lg font-bold tracking-wide">{c.code}</p><p className="text-sm text-muted">خصم {c.type === "percent" ? `${c.value}%` : formatMoney(c.value)}{c.minOrder ? ` · لطلبيات فوق ${formatMoney(c.minOrder)}` : ""}</p></div>
                  <Badge tone={STATE[c.state][1]}>{STATE[c.state][0]}</Badge>
                </div>
                <p className="text-sm text-muted">استُخدم {c.usedCount}{c.maxUses ? ` من ${c.maxUses}` : " مرة"}{c.startsAt ? ` · من ${formatDate(c.startsAt)}` : ""}{c.expiresAt ? ` · لين ${formatDate(c.expiresAt)}` : ""}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setEditing(c)}>تعديل</Button>
                  <Button size="sm" variant="ghost" disabled={!canEdit || toggle.pending} onClick={() => toggle.act(() => toggleCouponAction(c.id, !c.isActive), c.isActive ? "تم التعطيل" : "تم التفعيل")}>{c.isActive ? "تعطيل" : "تفعيل"}</Button>
                  <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => { del.setError(null); setDeleting(c); }}>مسح</Button>
                </div>
                {toggle.error && <p role="alert" className="text-sm text-danger-fg">{toggle.error}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing && <CouponForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} danger loading={del.pending} title="مسح الكوبون" message={del.error ?? `تمسح الكوبون «${deleting?.code}»؟`} confirmLabel="مسح" onConfirm={() => deleting && del.act(() => deleteCouponAction(deleting.id), "تم المسح", () => setDeleting(null))} />
    </div>
  );
}
