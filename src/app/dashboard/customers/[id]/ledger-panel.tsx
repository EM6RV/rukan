"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { PAY_METHOD_LABELS, type PayMethod } from "@/lib/constants";
import { formatMoney, inputToDirham } from "@/lib/money";
import { adjustCustomerAction, customerMoneyAction, customerTermsAction } from "../actions";

type Entry = { id: string; at: string; label: string; method: PayMethod | null; amount: number; balanceAfter: number; note: string | null };

/** دفتر الزبون: الدين والمحفظة والنقاط + سداد/شحن/تسوية + حد الدين ومستوى السعر + كشف حساب واتساب */
export function LedgerPanel({ customerId, balances, entries, creditLimit, priceLevel, whatsapp, writable }: {
  customerId: string; balances: { debt: number; wallet: number; points: number }; entries: Entry[];
  creditLimit: number | null; priceLevel: "retail" | "semi" | "wholesale"; whatsapp: string | null; writable: boolean;
}) {
  const [mode, setMode] = useState<"payment" | "topup" | "adjust" | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "transfer">("cash");
  const [account, setAccount] = useState<"debt" | "wallet" | "points">("debt");
  const [note, setNote] = useState("");
  const [limit, setLimit] = useState(creditLimit === null ? "" : String(creditLimit / 1000));
  const [level, setLevel] = useState(priceLevel);
  const act = useAct();
  const terms = useAct();
  return (
    <Card>
      <CardHeader title="دفتر الحساب (الكُناش)" description="كل حركة تتسجل وما تتمسحش. التصحيح بتسوية." />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[["الدين عليه", formatMoney(balances.debt)], ["المحفظة", formatMoney(balances.wallet)], ["النقاط", String(balances.points)]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-surface-2 p-3"><p className="text-sm text-muted">{l}</p><p className="text-lg font-bold tabular-nums">{v}</p></div>
          ))}
        </div>
        {writable && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={mode === "payment" ? "primary" : "outline"} onClick={() => setMode("payment")} disabled={balances.debt <= 0}>سداد دين</Button>
            <Button size="sm" variant={mode === "topup" ? "primary" : "outline"} onClick={() => setMode("topup")}>شحن المحفظة</Button>
            <Button size="sm" variant={mode === "adjust" ? "primary" : "outline"} onClick={() => setMode("adjust")}>تسوية</Button>
            {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#25D366] px-3 text-sm font-semibold text-navy"><MessageCircle className="size-4" aria-hidden /> كشف الحساب واتساب</a>}
          </div>
        )}
        {mode && (
          <form className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-4 sm:items-end" onSubmit={(e) => {
            e.preventDefault();
            const a = inputToDirham(amount.replace(/^-/, ""));
            if (!a) return act.setError("اكتب مبلغ صحيح.");
            const signed = amount.trim().startsWith("-") ? -a : a;
            if (mode === "adjust") act.act(() => adjustCustomerAction({ customerId, account, amount: account === "points" ? Math.round(signed / 1000) : signed, note }), "تم تسجيل التسوية", () => { setMode(null); setAmount(""); setNote(""); });
            else act.act(() => customerMoneyAction(mode, { customerId, amount: a, method, note }), mode === "payment" ? "تم تسجيل السداد" : "تم شحن المحفظة", () => { setMode(null); setAmount(""); });
          }}>
            <Input label={mode === "adjust" ? "المبلغ (سالب للنقص)" : "المبلغ (د.ل)"} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {mode === "adjust" ? (
              <Select label="الحساب" value={account} onChange={(e) => setAccount(e.target.value as typeof account)}><option value="debt">الدين</option><option value="wallet">المحفظة</option><option value="points">النقاط</option></Select>
            ) : (
              <Select label="الطريقة" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option value="cash">كاش</option><option value="card">بطاقة</option><option value="transfer">تحويل</option></Select>
            )}
            <Input label={mode === "adjust" ? "السبب" : "ملاحظة"} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
            <Button type="submit" loading={act.pending}>تسجيل</Button>
            {act.error && <p role="alert" className={`${errorClass} sm:col-span-4`}>{act.error}</p>}
          </form>
        )}
        {writable && (
          <form className="grid gap-3 sm:grid-cols-3 sm:items-end" onSubmit={(e) => { e.preventDefault(); terms.act(() => customerTermsAction({ customerId, creditLimit: limit.trim() === "" ? null : inputToDirham(limit) ?? 0, priceLevel: level }), "تم الحفظ"); }}>
            <Input label="حد الدين (د.ل)" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} hint="فاضي = الحد العام، 0 = ممنوع الدين" />
            <Select label="مستوى السعر" value={level} onChange={(e) => setLevel(e.target.value as typeof level)}><option value="retail">قطاعي</option><option value="semi">نص جملة</option><option value="wholesale">جملة</option></Select>
            <Button type="submit" variant="outline" loading={terms.pending}>حفظ</Button>
            {terms.error && <p role="alert" className={`${errorClass} sm:col-span-3`}>{terms.error}</p>}
          </form>
        )}
        <div>
          <h3 className="mb-2 text-sm font-semibold">كشف حساب الدين</h3>
          {entries.length === 0 ? <p className="text-sm text-muted">ما فيش حركات دين.</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>{e.at} · {e.label}{e.method ? ` (${PAY_METHOD_LABELS[e.method]})` : ""}{e.note ? ` · ${e.note}` : ""}</span>
                  <span className="tabular-nums"><b className={e.amount > 0 ? "text-danger-fg" : "text-success-fg"}>{e.amount > 0 ? "+" : ""}{formatMoney(e.amount)}</b> <span className="text-muted">← {formatMoney(e.balanceAfter)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
