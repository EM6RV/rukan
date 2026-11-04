"use client";

import { useState } from "react";
import Link from "next/link";
import { Banknote, Landmark, Plus, Smartphone, Truck, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney, inputToDirham } from "@/lib/money";
import { closeCashAction, depositAction, refundCustomerAction, reverseAction, saveAccountAction, transferAction } from "./actions";

type Account = { id: string; name: string; kind: "cash" | "bank" | "wallet" | "courier"; balance: number; isActive: boolean; isDefault: boolean; readOnly: boolean };
type Ledger = { total: number; page: number; pageCount: number; rows: { id: string; at: number; account: string; amount: number; kind: string; label: string; memo: string | null; reversed: boolean; canReverse: boolean }[] };
const ICON = { cash: Banknote, bank: Landmark, wallet: Smartphone, courier: Truck } as const;
type Mode = null | "deposit" | "withdraw" | "transfer" | "account" | "close" | "refund";

function MoneyForm({ mode, accounts, onClose }: { mode: Exclude<Mode, null | "account" | "close">; accounts: Account[]; onClose: () => void }) {
  const real = accounts.filter((a) => !a.readOnly && a.isActive);
  const [accountId, setAccountId] = useState(real[0]?.id ?? ""), [toId, setToId] = useState(real[1]?.id ?? ""), [amount, setAmount] = useState(""), [memo, setMemo] = useState("");
  const { act, pending, error, setError } = useAct();
  const titles = { deposit: "إيداع", withdraw: "سحب", transfer: "تحويل بين حسابين", refund: "إرجاع فلوس لزبون" } as const;
  function submit() {
    const a = inputToDirham(amount);
    if (!a) return setError("اكتب مبلغ صحيح.");
    if (mode === "transfer") return act(() => transferAction({ fromAccountId: accountId, toAccountId: toId, amount: a, memo }), "تم التحويل", onClose);
    if (mode === "refund") return act(() => refundCustomerAction({ accountId, amount: a, memo }), "تم تسجيل الإرجاع", onClose);
    act(() => depositAction({ accountId, amount: a, memo, withdraw: mode === "withdraw" }), mode === "withdraw" ? "تم السحب" : "تم الإيداع", onClose);
  }
  return (
    <Modal open onClose={onClose} title={titles[mode]} footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={submit}>تسجيل</Button></>}>
      <div className="space-y-4">
        <Select label={mode === "transfer" ? "من حساب" : "الحساب"} value={accountId} onChange={(e) => setAccountId(e.target.value)}>{real.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        {mode === "transfer" && <Select label="إلى حساب" value={toId} onChange={(e) => setToId(e.target.value)}>{real.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}
        <Input label="المبلغ (د.ل)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="السبب / ملاحظة" value={memo} maxLength={200} onChange={(e) => setMemo(e.target.value)} />
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

function AccountForm({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState({ name: "", kind: "wallet" as "cash" | "bank" | "wallet", opening: "" });
  const { act, pending, error, setError } = useAct();
  return (
    <Modal open onClose={onClose} title="حساب جديد" footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={() => { const o = v.opening.trim() ? inputToDirham(v.opening) : 0; if (o === undefined || o === null) return setError("الرصيد الافتتاحي غير صحيح."); act(() => saveAccountAction({ name: v.name, kind: v.kind, opening: o }), "تمت الإضافة", onClose); }}>إضافة</Button></>}>
      <div className="space-y-4">
        <Input label="اسم الحساب" value={v.name} maxLength={40} placeholder="مثال: LyPay، خزنة الفرع" onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Select label="النوع" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as typeof v.kind })}><option value="cash">خزنة (نقد)</option><option value="bank">بنك</option><option value="wallet">محفظة</option></Select>
        <Input label="رصيد افتتاحي (د.ل)" inputMode="decimal" value={v.opening} onChange={(e) => setV({ ...v, opening: e.target.value })} />
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

function CloseForm({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const real = accounts.filter((a) => !a.readOnly && a.isActive);
  const [accountId, setAccountId] = useState(real[0]?.id ?? ""), [actual, setActual] = useState(""), [adjust, setAdjust] = useState(true), [note, setNote] = useState("");
  const { act, pending, error, setError } = useAct();
  const expected = real.find((a) => a.id === accountId)?.balance ?? 0;
  const a = actual.trim() ? inputToDirham(actual) : null;
  const diff = a === null || a === undefined ? null : a - expected;
  return (
    <Modal open onClose={onClose} title="إقفال الخزنة" footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={() => { if (a === null || a === undefined) return setError("اكتب الرصيد الفعلي."); act(() => closeCashAction({ accountId, actual: a, adjust, note }), "تم الإقفال", onClose); }}>إقفال</Button></>}>
      <div className="space-y-4">
        <Select label="الحساب" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{real.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
        <p className="text-sm">الرصيد المتوقع حسب الدفتر: <b>{formatMoney(expected)}</b></p>
        <Input label="الرصيد الفعلي (عدّيته بيدك) د.ل" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} />
        {diff !== null && <p className={`text-sm font-bold ${diff === 0 ? "text-success-fg" : "text-danger-fg"}`}>{diff === 0 ? "مطابق ✓" : `الفرق: ${diff > 0 ? "+" : ""}${formatMoney(diff)}`}</p>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} className="size-4" /> سجّل الفرق كحركة تسوية في الدفتر</label>
        <Input label="ملاحظة" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

export function AccountsManager({ accounts, ledger, filter, writable }: { accounts: Account[]; ledger: Ledger; filter: { account: string; from: string; to: string }; writable: boolean }) {
  const [mode, setMode] = useState<Mode>(null);
  const { act, pending, error } = useAct();
  const total = accounts.filter((a) => !a.readOnly).reduce((s, a) => s + a.balance, 0);
  const atCouriers = accounts.filter((a) => a.readOnly).reduce((s, a) => s + a.balance, 0);
  const qs = (p: number) => `?${new URLSearchParams({ ...(filter.account ? { account: filter.account } : {}), ...(filter.from ? { from: filter.from } : {}), ...(filter.to ? { to: filter.to } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  const input = "h-10 rounded-md border border-line bg-surface px-3 text-sm";
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4"><p className="text-sm text-muted">إجمالي فلوسك في حساباتك</p><p className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(total)}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">فلوسك عند المندوبين (لسه ما اتسلمتش)</p><p className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(atCouriers)}</p></Card>
      </div>
      {writable && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setMode("deposit")}>إيداع</Button><Button size="sm" variant="outline" onClick={() => setMode("withdraw")}>سحب</Button>
          <Button size="sm" variant="outline" onClick={() => setMode("transfer")}>تحويل بين حسابين</Button><Button size="sm" variant="outline" onClick={() => setMode("refund")}>إرجاع فلوس لزبون</Button>
          <Button size="sm" variant="outline" onClick={() => setMode("close")}>إقفال الخزنة</Button><Button size="sm" variant="ghost" onClick={() => setMode("account")}><Plus className="size-4" /> حساب جديد</Button>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => {
          const Icon = ICON[a.kind];
          return (
            <li key={a.id}>
              <Card className={`flex items-center gap-3 p-4 ${a.isActive ? "" : "opacity-60"}`}>
                <span className="flex size-10 items-center justify-center rounded-full bg-surface-2"><Icon className="size-5" aria-hidden /></span>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{a.name}</p><p className={`text-lg font-bold tabular-nums ${a.balance < 0 ? "text-danger-fg" : ""}`}>{formatMoney(a.balance)}</p></div>
                {a.readOnly ? <Badge>من نظام المندوبين</Badge> : <Link href={`?account=${a.id}`} className="text-xs text-link hover:underline">الحركات</Link>}
              </Card>
            </li>
          );
        })}
      </ul>

      <Card>
        <CardHeader title="دفتر الحركات" description={`${ledger.total} حركة`} />
        <CardBody className="space-y-3">
          <form className="flex flex-wrap items-end gap-2">
            <select name="account" defaultValue={filter.account} aria-label="الحساب" className={input}><option value="">كل الحسابات</option>{accounts.filter((a) => !a.readOnly).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <input type="date" name="from" defaultValue={filter.from} aria-label="من" dir="ltr" className={input} /><input type="date" name="to" defaultValue={filter.to} aria-label="إلى" dir="ltr" className={input} />
            <button className="h-10 rounded-md bg-fg px-4 text-sm font-semibold text-bg">تطبيق</button>
          </form>
          {error && <p role="alert" className={errorClass}>{error}</p>}
          <ul className="divide-y divide-line">
            {ledger.rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="text-xs text-muted">{formatDateTime(r.at)}</span><b>{r.label}</b><span className="text-muted">{r.account}</span>{r.memo && <span className="text-muted">— {r.memo}</span>}
                <span className="flex-1" />{r.reversed && <Badge>اتعكست</Badge>}
                <span className={`font-bold tabular-nums ${r.amount < 0 ? "text-danger-fg" : "text-success-fg"}`}><bdi dir="ltr">{r.amount > 0 ? "+" : ""}{formatMoney(r.amount)}</bdi></span>
                {writable && r.canReverse && <button type="button" aria-label="عكس الحركة" title="تصحيح بحركة عكسية" disabled={pending} onClick={() => act(() => reverseAction(r.id), "تم عكس الحركة")} className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2"><Undo2 className="size-4" /></button>}
              </li>
            ))}
            {ledger.rows.length === 0 && <li className="py-6 text-center text-muted">ما فيه حركات.</li>}
          </ul>
          {ledger.pageCount > 1 && <nav className="flex justify-center gap-3 text-sm">{ledger.page > 1 && <Link href={qs(ledger.page - 1)} className="rounded-md border border-line px-3 py-1.5">السابق</Link>}<span className="text-muted">صفحة {ledger.page} من {ledger.pageCount}</span>{ledger.page < ledger.pageCount && <Link href={qs(ledger.page + 1)} className="rounded-md border border-line px-3 py-1.5">التالي</Link>}</nav>}
        </CardBody>
      </Card>

      {(mode === "deposit" || mode === "withdraw" || mode === "transfer" || mode === "refund") && <MoneyForm mode={mode} accounts={accounts} onClose={() => setMode(null)} />}
      {mode === "account" && <AccountForm onClose={() => setMode(null)} />}
      {mode === "close" && <CloseForm accounts={accounts} onClose={() => setMode(null)} />}
    </div>
  );
}
