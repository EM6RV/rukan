"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Building2, Phone, Plus, SlidersHorizontal, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm";
import { Input, PhoneInput, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { enterDelay, enterItem } from "@/components/ui/motion";
import { Toggle } from "@/components/ui/toggle";
import { formatDateTimeYear } from "@/lib/datetime";
import { formatMoney, inputToDirham } from "@/lib/money";
import { adjustAction, deleteCourierAction, saveCourierAction, settleAction } from "./actions";

export type CourierItem = {
  id: string; name: string; phone: string | null; kind: "person" | "company"; notes: string | null; isActive: boolean;
  balance: number; pendingOrders: number; pendingCash: number; deliveredCount: number; returnedCount: number; lastSettlementAt: number | null;
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
      let r: Res;
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

/** تسوية («استلمت الفلوس») وتعديل الرصيد لمندوب */
export function CashActions({ courier, writable }: { courier: Pick<CourierItem, "id" | "name" | "balance">; writable: boolean }) {
  const [mode, setMode] = useState<null | "settle" | "adjust">(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sign, setSign] = useState<"+" | "-">("-");
  const [localError, setLocalError] = useState<string | null>(null);
  const { act, pending, error, setError } = useAct();
  const close = () => { setMode(null); setAmount(""); setNote(""); setLocalError(null); setError(null); };

  function submit() {
    const value = inputToDirham(amount);
    if (value === undefined || value === null || value <= 0) return setLocalError("اكتب مبلغ صحيح أكبر من صفر");
    setLocalError(null);
    if (mode === "settle") act(() => settleAction({ courierId: courier.id, amount: value, note }), "تم تسجيل استلام الفلوس", close);
    else act(() => adjustAction({ courierId: courier.id, amount: sign === "-" ? -value : value, note }), "تم تعديل الرصيد", close);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!writable || courier.balance <= 0} onClick={() => { setMode("settle"); setAmount(String(courier.balance / 1000)); }}><Banknote className="size-4" aria-hidden /> استلمت الفلوس</Button>
        <Button size="sm" variant="outline" disabled={!writable} onClick={() => setMode("adjust")}><SlidersHorizontal className="size-4" aria-hidden /> تعديل الرصيد</Button>
      </div>
      <Modal
        open={mode !== null} onClose={close} title={mode === "settle" ? `استلام فلوس من ${courier.name}` : `تعديل رصيد ${courier.name}`}
        footer={<><Button variant="ghost" onClick={close} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={submit}>{mode === "settle" ? "سجّل الاستلام" : "احفظ التعديل"}</Button></>}
      >
        <div className="space-y-4">
          <p className="rounded-md bg-surface-2 px-3 py-2 text-sm">الكاش عنده الحين: <b>{formatMoney(courier.balance)}</b></p>
          {mode === "adjust" && <Select label="نوع التعديل" value={sign} onChange={(e) => setSign(e.target.value as "+" | "-")}><option value="-">خصم من رصيده (مثلاً غرامة أو فرق)</option><option value="+">إضافة لرصيده</option></Select>}
          <Input label="المبلغ (د.ل)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} hint={mode === "settle" ? "لو سلّمك جزء، اكتب الجزء بس" : undefined} />
          {mode === "settle" && (() => {
            const v = inputToDirham(amount);
            if (!v || v <= 0) return null;
            const left = courier.balance - v;
            return left < 0
              ? <p role="status" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">المبلغ أكبر من الكاش اللي عنده ({formatMoney(courier.balance)}). راجع الرقم.</p>
              : <p role="status" className="rounded-md bg-success/10 px-3 py-2 text-sm text-success-fg">الباقي عنده بعد التسوية: <b>{formatMoney(left)}</b></p>;
          })()}
          <Textarea label={mode === "settle" ? "ملاحظة (اختياري)" : "السبب"} rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          <ErrorLine error={localError ?? error} />
        </div>
      </Modal>
    </>
  );
}

function CourierForm({ initial, onClose }: { initial?: CourierItem; onClose: () => void }) {
  const [v, setV] = useState({ name: initial?.name ?? "", phone: initial?.phone ?? "", kind: initial?.kind ?? "person", notes: initial?.notes ?? "", isActive: initial?.isActive ?? true });
  const { act, pending, error } = useAct();
  return (
    <Modal open onClose={onClose} title={initial ? "تعديل المندوب" : "مندوب جديد"} footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} disabled={v.name.trim().length < 2} onClick={() => act(() => saveCourierAction({ id: initial?.id, ...v }), "تم الحفظ", onClose)}>حفظ</Button></>}>
      <div className="space-y-4">
        <Input label="الاسم" value={v.name} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Select label="النوع" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as "person" | "company" })}><option value="person">مندوب (شخص)</option><option value="company">شركة توصيل</option></Select>
        <PhoneInput hint="اختياري" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        <Textarea label="ملاحظات (اختياري)" rows={2} maxLength={300} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        {initial && <Toggle checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} label="نشط" hint="الموقوف ما يظهرش عند تعيين الطلبيات" />}
        <ErrorLine error={error} />
      </div>
    </Modal>
  );
}

export function DeleteCourier({ id, name, redirectTo }: { id: string; name: string; redirectTo?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { act, pending, error, setError } = useAct();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>حذف</Button>
      <ConfirmModal open={open} onClose={() => { setOpen(false); setError(null); }} danger loading={pending} title="حذف المندوب" message={error ?? `حذف «${name}»؟ ما ينفع لو عنده طلبيات أو كاش، وقتها أوقفه بدل الحذف.`} confirmLabel="حذف" onConfirm={() => act(() => deleteCourierAction(id), "تم المسح", () => { setOpen(false); if (redirectTo) router.push(redirectTo); })} />
    </>
  );
}

export function CourierList({ couriers, writable }: { couriers: CourierItem[]; writable: boolean }) {
  const [editing, setEditing] = useState<CourierItem | "new" | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button disabled={!writable} onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> مندوب جديد</Button></div>
      <ul className="grid gap-4 md:grid-cols-2">
        {couriers.map((c, i) => (
          <li key={c.id} style={enterDelay(i)} className={enterItem}>
            <Card className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/dashboard/couriers/${c.id}`} className="flex min-h-10 items-center gap-2 font-semibold hover:underline">{c.kind === "company" ? <Building2 className="size-4 shrink-0 text-muted" aria-hidden /> : <User className="size-4 shrink-0 text-muted" aria-hidden />}<span className="truncate">{c.name}</span></Link>
                  {c.phone && <a dir="ltr" href={`tel:${c.phone}`} className="inline-flex min-h-10 items-center gap-1 text-sm text-link"><Phone className="size-3.5" aria-hidden />{c.phone}</a>}
                </div>
                <div className="flex items-center gap-1">{!c.isActive && <Badge>موقوف</Badge>}<Button size="sm" variant="ghost" disabled={!writable} onClick={() => setEditing(c)}>تعديل</Button></div>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-3 text-sm">
                <div><p className="text-muted">الكاش عنده</p><p className={`text-lg font-bold ${c.balance > 0 ? "text-fg" : "text-muted"}`}>{formatMoney(c.balance)}</p></div>
                <div><p className="text-muted">مع المندوب الحين</p><p className="text-lg font-bold">{c.pendingOrders} <span className="text-sm font-normal text-muted">({formatMoney(c.pendingCash)})</span></p></div>
              </div>
              <p className="text-xs text-muted">وصّل {c.deliveredCount} · رجّع {c.returnedCount}{c.lastSettlementAt ? ` · آخر تسوية ${formatDateTimeYear(c.lastSettlementAt)}` : ""}</p>
              <CashActions courier={c} writable={writable} />
            </Card>
          </li>
        ))}
      </ul>
      {editing && <CourierForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
