"use client";

import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { dateInputToMs } from "@/lib/date-input";
import { formatDate } from "@/lib/datetime";
import { formatMoney, inputToDirham } from "@/lib/money";
import { uploadImage } from "@/lib/upload-client";
import { addExpenseAction } from "../actions";

type Row = { id: string; at: number; category: string; account: string; amount: number; note: string | null; receiptMediaId: string | null };

export function ExpenseManager({ expenses, categories, accounts, writable }: { expenses: Row[]; categories: string[]; accounts: { id: string; name: string }[]; writable: boolean }) {
  const [v, setV] = useState({ category: "", amount: "", accountId: accounts[0]?.id ?? "", note: "", date: "" });
  const [receipt, setReceipt] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const { act, pending, error, setError } = useAct();
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  async function pick(f: File | undefined) {
    if (!f) return;
    setUploading(true); setError(null);
    try { const up = await uploadImage(f, "product"); setReceipt({ id: up.id, name: f.name }); } catch (e) { setError((e as Error).message); } finally { setUploading(false); if (file.current) file.current.value = ""; }
  }
  function submit() {
    const a = inputToDirham(v.amount);
    if (!a) return setError("اكتب مبلغ صحيح.");
    act(() => addExpenseAction({ amount: a, accountId: v.accountId, categoryName: v.category, note: v.note, receiptMediaId: receipt?.id ?? null, spentAt: dateInputToMs(v.date, "start") ?? undefined }), "تم تسجيل المصروف", () => { setV({ ...v, amount: "", note: "" }); setReceipt(null); });
  }
  return (
    <div className="space-y-5">
      {writable && (
        <Card>
          <CardHeader title="مصروف جديد" />
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Input label="التصنيف" list="exp-cats" value={v.category} maxLength={40} placeholder="إعلانات، تغليف…" onChange={(e) => setV({ ...v, category: e.target.value })} />
              <datalist id="exp-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <Input label="المبلغ (د.ل)" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
            <Select label="من حساب" value={v.accountId} onChange={(e) => setV({ ...v, accountId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
            <Input label="التاريخ (فاضي = اليوم)" type="date" dir="ltr" className="text-right" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            <Input label="ملاحظة" value={v.note} maxLength={200} onChange={(e) => setV({ ...v, note: e.target.value })} />
            <div className="flex items-end gap-2">
              <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
              <Button variant="outline" loading={uploading} onClick={() => file.current?.click()}><Paperclip className="size-4" /> {receipt ? receipt.name.slice(0, 18) : "صورة الإيصال"}</Button>
            </div>
            <div className="sm:col-span-2 lg:col-span-3 space-y-2">{error && <p role="alert" className={errorClass}>{error}</p>}<Button loading={pending} disabled={uploading} onClick={submit}>تسجيل المصروف</Button></div>
          </CardBody>
        </Card>
      )}
      <p className="text-sm text-muted">إجمالي المعروض: <b className="tabular-nums text-fg">{formatMoney(total)}</b></p>
      {expenses.length === 0 ? <EmptyState title="ما فيه مصاريف" description="سجّل أول مصروف باش يدخل في حساب أرباحك." /> : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {expenses.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
              <b>{e.category}</b><span className="text-muted">{e.account}</span>{e.note && <span className="text-muted">— {e.note}</span>}
              {e.receiptMediaId && <a href={`/api/media/${e.receiptMediaId}`} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">الإيصال</a>}
              <span className="flex-1" /><span className="text-xs text-muted">{formatDate(e.at)}</span><span className="font-bold tabular-nums text-danger-fg">{formatMoney(e.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
