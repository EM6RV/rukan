"use client";

import { useState } from "react";
import { MessageCircle, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Input, PhoneInput, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { dateInputToMs } from "@/lib/date-input";
import { formatDate } from "@/lib/datetime";
import { formatMoney, inputToDirham } from "@/lib/money";
import { addReceivableAction, payReceivableAction, remindReceivableAction } from "../actions";

type Row = { id: string; name: string; phone: string | null; amount: number; paid: number; remaining: number; dueDate: number | null; overdue: boolean; note: string | null; remindedAt: number | null; whatsappUrl: string | null };

function AddForm({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState({ name: "", phone: "", amount: "", due: "", note: "" });
  const { act, pending, error, setError } = useAct();
  return (
    <Modal open onClose={onClose} title="دين جديد" footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={() => { const a = inputToDirham(v.amount); if (!a) return setError("اكتب مبلغ صحيح."); act(() => addReceivableAction({ customerName: v.name, customerPhone: v.phone || null, amount: a, dueDate: v.due ? dateInputToMs(v.due, "end") : null, note: v.note }), "تمت الإضافة", onClose); }}>إضافة</Button></>}>
      <div className="space-y-4">
        <Input label="اسم الزبون" value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <PhoneInput value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        <Input label="المبلغ (د.ل)" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
        <Input label="تاريخ الاستحقاق (اختياري)" type="date" dir="ltr" className="text-right" value={v.due} onChange={(e) => setV({ ...v, due: e.target.value })} />
        <Input label="ملاحظة" value={v.note} maxLength={200} onChange={(e) => setV({ ...v, note: e.target.value })} />
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

function PayForm({ row, accounts, onClose }: { row: Row; accounts: { id: string; name: string }[]; onClose: () => void }) {
  const [amount, setAmount] = useState(String(row.remaining / 1000)), [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const { act, pending, error, setError } = useAct();
  return (
    <Modal open onClose={onClose} title={`سداد من ${row.name}`} footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={() => { const a = inputToDirham(amount); if (!a) return setError("اكتب مبلغ صحيح."); act(() => payReceivableAction({ id: row.id, amount: a, accountId }), "تم تسجيل السداد", onClose); }}>تسجيل</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">المتبقي: <b>{formatMoney(row.remaining)}</b></p>
        <Input label="المبلغ المدفوع (د.ل)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Select label="يدخل في حساب" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

export function ReceivableManager({ rows, accounts, writable }: { rows: Row[]; accounts: { id: string; name: string }[]; writable: boolean }) {
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Row | null>(null);
  const { act } = useAct();
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button disabled={!writable} onClick={() => setAdding(true)}><Plus className="size-4" /> دين جديد</Button></div>
      {rows.length === 0 ? <EmptyState title="ما فيه ديون" description="سجّل أي زبون عليه فلوس باش ما تنساهاش." /> : (
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className={`flex flex-wrap items-center gap-3 p-4 ${r.remaining === 0 ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1"><p className="font-semibold">{r.name}</p><p className="text-sm text-muted">{r.note ?? ""}{r.dueDate ? ` · استحقاق ${formatDate(r.dueDate)}` : ""}</p></div>
                {r.overdue && <Badge tone="danger">متأخر</Badge>}{r.remaining === 0 && <Badge tone="success">مسدّد</Badge>}
                <div className="text-end"><p className="font-bold tabular-nums">{formatMoney(r.remaining)}</p><p className="text-xs text-muted">من {formatMoney(r.amount)}</p></div>
                {r.whatsappUrl && <a href={r.whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => writable && act(() => remindReceivableAction(r.id), "تم تسجيل التذكير")} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:bg-surface-2"><MessageCircle className="size-4" aria-hidden /> ذكّره</a>}
                {writable && r.remaining > 0 && <Button size="sm" onClick={() => setPaying(r)}>سداد</Button>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {adding && <AddForm onClose={() => setAdding(false)} />}
      {paying && <PayForm key={paying.id} row={paying} accounts={accounts} onClose={() => setPaying(null)} />}
    </div>
  );
}
