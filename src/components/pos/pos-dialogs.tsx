"use client";

import { useMemo, useState } from "react";
import { Delete, Plus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { PAY_METHOD_LABELS, type PayMethod } from "@/lib/constants";
import { formatMoney, inputToDirham } from "@/lib/money";
import { normalizeLibyanPhone } from "@/lib/phone";
import { DENOMINATIONS, countCash, settle, type PaymentInput } from "@/lib/pos-engine";
import type { Customer, LocalSale, PosApi, Staff } from "./use-pos";

const m = (n: number) => formatMoney(n);

// ===== لوحة الـ PIN =====
export function PinPad({ title, onSubmit, error }: { title: string; onSubmit: (pin: string) => void; error?: string | null }) {
  const [pin, setPin] = useState("");
  const push = (d: string) => { const next = (pin + d).slice(0, 4); setPin(next); if (next.length === 4) { onSubmit(next); setPin(""); } };
  return (
    <div className="mx-auto w-full max-w-xs space-y-4 text-center">
      <p className="font-semibold">{title}</p>
      <div className="flex justify-center gap-3" aria-label={`أدخلت ${pin.length} من 4 أرقام`}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={cn("size-4 rounded-full border-2 border-fg", i < pin.length && "bg-fg")} />)}
      </div>
      {error && <p role="alert" className="text-sm font-medium text-danger-fg">{error}</p>}
      <div className="grid grid-cols-3 gap-2" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" onClick={() => push(d)} className="h-16 rounded-xl border border-line bg-surface text-2xl font-semibold hover:bg-surface-2 active:scale-95">{d}</button>)}
        <span />
        <button type="button" onClick={() => push("0")} className="h-16 rounded-xl border border-line bg-surface text-2xl font-semibold hover:bg-surface-2 active:scale-95">0</button>
        <button type="button" aria-label="مسح" onClick={() => setPin(pin.slice(0, -1))} className="flex h-16 items-center justify-center rounded-xl border border-line bg-surface hover:bg-surface-2"><Delete className="size-6" /></button>
      </div>
      {/* إدخال بالكيبورد */}
      <input aria-label="الـ PIN" inputMode="numeric" autoFocus value="" onChange={() => {}} onKeyDown={(e) => { if (/^\d$/.test(e.key)) push(e.key); if (e.key === "Backspace") setPin(pin.slice(0, -1)); }} className="sr-only" />
    </div>
  );
}

/** موافقة المشرف: يختار المشرف ويدخل الـ PIN */
export function ApproveDialog({ pos, reason, onApproved, onClose }: { pos: PosApi; reason: string; onApproved: (by: string) => void; onClose: () => void }) {
  const supervisors = (pos.boot?.staff ?? []).filter((s) => s.canApprove && s.pinHash);
  const [who, setWho] = useState<Staff | null>(supervisors.length === 1 ? supervisors[0]! : null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="موافقة المشرف">
      <div className="space-y-4">
        <p className="rounded-md bg-gold/15 px-3 py-2 text-sm">{reason}</p>
        {!who ? (
          supervisors.length ? <div className="grid grid-cols-2 gap-2">{supervisors.map((s) => <Button key={s.userId} variant="outline" onClick={() => setWho(s)}>{s.name}</Button>)}</div>
            : <p className="text-sm text-muted">ما فيش مشرف عنده PIN. حدد PIN لمشرف من لوحة التحكم ← الموظفين.</p>
        ) : (
          <PinPad title={`PIN ${who.name}`} error={error} onSubmit={async (pin) => { const by = await pos.approve(who.userId, pin); if (by) onApproved(by); else setError("الـ PIN غلط."); }} />
        )}
      </div>
    </Modal>
  );
}

// ===== الدفع =====
export function PayDialog({ pos, onPaid, onClose }: { pos: PosApi; onPaid: (sale: LocalSale) => void; onClose: () => void }) {
  const { customer, boot } = pos;
  const [redeem, setRedeem] = useState(0);
  const redeemValue = Math.min(pos.totals.total, redeem * (boot?.config.pointValue ?? 100));
  const total = pos.totals.total - redeemValue;
  const [rows, setRows] = useState<{ method: PayMethod; amount: string }[]>([{ method: "cash", amount: String(total / 1000) }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const payments: PaymentInput[] = rows.map((r) => ({ method: r.method, amount: inputToDirham(r.amount) ?? 0 }));
  const s = settle(total, payments);
  const methods: PayMethod[] = customer ? ["cash", "card", "transfer", "credit", "wallet"] : ["cash", "card", "transfer"];
  const setCash = (amount: number) => setRows((r) => { const rest = r.filter((x) => x.method !== "cash"); return [...rest, { method: "cash", amount: String(amount / 1000) }]; });
  const remainingNonCash = total - payments.filter((p) => p.method !== "cash").reduce((a, p) => a + p.amount, 0);
  const quick = [...new Set([remainingNonCash, ...[5_000, 10_000, 20_000, 50_000, 100_000].map((b) => Math.ceil(remainingNonCash / b) * b)])].filter((x) => x >= remainingNonCash && x > 0).slice(0, 5);

  async function confirm() {
    setError(null); setBusy(true);
    const r = await pos.pay(payments, redeem);
    setBusy(false);
    if (typeof r === "string") return setError(r);
    onPaid(r);
  }

  return (
    <Modal open onClose={onClose} title="الدفع" className="max-w-xl"
      footer={<><Button variant="ghost" onClick={onClose}>رجوع</Button><Button size="lg" loading={busy} disabled={!s.ok} onClick={confirm}>تأكيد الدفع (Enter)</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (s.ok) void confirm(); }}>
        <div className="rounded-xl bg-surface-2 p-4 text-center">
          <p className="text-sm text-muted">الإجمالي</p>
          <p className="font-heading text-4xl font-bold tabular-nums">{m(total)}</p>
          {redeemValue > 0 && <p className="text-sm text-muted">بعد صرف {redeem} نقطة (−{m(redeemValue)})</p>}
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[9rem_1fr_auto] items-end gap-2">
            <Select label={i === 0 ? "الطريقة" : undefined} aria-label="طريقة الدفع" value={r.method} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, method: e.target.value as PayMethod } : x)))}>
              {methods.map((mm) => <option key={mm} value={mm}>{PAY_METHOD_LABELS[mm]}</option>)}
            </Select>
            <Input label={i === 0 ? "المبلغ (د.ل)" : undefined} aria-label="المبلغ" inputMode="decimal" autoFocus={i === 0} value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className="text-lg tabular-nums" />
            <button type="button" aria-label="شيل الطريقة" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 disabled:opacity-30"><Trash2 className="size-4" /></button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { method: rows.some((r) => r.method === "card") ? "transfer" : "card", amount: s.remaining ? String(s.remaining / 1000) : "" }])}><Plus className="size-4" /> طريقة ثانية</Button>
          {quick.map((q) => <Button key={q} type="button" variant="outline" size="sm" onClick={() => setCash(q)}>كاش {m(q)}</Button>)}
        </div>
        {customer && (customer.points > 0) && (
          <Input label={`صرف نقاط (عنده ${customer.points})`} inputMode="numeric" value={redeem ? String(redeem) : ""} onChange={(e) => setRedeem(Math.min(customer.points, Number(e.target.value.replace(/\D/g, "")) || 0))} />
        )}
        {customer && <p className="text-sm text-muted">الزبون: {customer.name} · الدين {m(customer.debt)} · المحفظة {m(customer.wallet)}</p>}
        <div className={cn("rounded-xl p-4 text-center text-lg font-semibold", s.ok ? "bg-success/15 text-success-fg" : "bg-gold/15")}>
          {s.ok ? (s.change ? <>الباقي للزبون: <span className="tabular-nums">{m(s.change)}</span></> : "المبلغ مضبوط") : s.remaining ? <>باقي: <span className="tabular-nums">{m(s.remaining)}</span></> : s.error}
        </div>
        {error && <p role="alert" className="text-sm font-medium text-danger-fg">{error}</p>}
        <button type="submit" className="sr-only">تأكيد</button>
      </form>
    </Modal>
  );
}

// ===== الزبون =====
export function CustomerDialog({ pos, onClose }: { pos: PosApi; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [money, setMoney] = useState<{ kind: "debt.pay" | "wallet.topup"; c: Customer } | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "transfer">("cash");
  const [error, setError] = useState<string | null>(null);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = pos.boot?.customers ?? [];
    return (needle ? all.filter((c) => c.name.toLowerCase().includes(needle) || c.phone.includes(needle.replace(/\D/g, "") || needle)) : all).slice(0, 30);
  }, [q, pos.boot]);

  if (money) {
    return (
      <Modal open onClose={() => setMoney(null)} title={money.kind === "debt.pay" ? `سداد دين ${money.c.name}` : `شحن محفظة ${money.c.name}`}
        footer={<><Button variant="ghost" onClick={() => setMoney(null)}>رجوع</Button><Button onClick={async () => {
          const a = inputToDirham(amount);
          if (!a || a <= 0) return setError("اكتب مبلغ صحيح.");
          const r = await pos.customerMoney(money.kind, money.c.id, a, method);
          if (r) return setError(r);
          setMoney(null); setAmount("");
        }}>تأكيد</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-muted">{money.kind === "debt.pay" ? `الدين الحالي: ${m(money.c.debt)}` : `الرصيد الحالي: ${m(money.c.wallet)}`}</p>
          <Input label="المبلغ (د.ل)" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select label="الطريقة" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option value="cash">كاش</option><option value="card">بطاقة</option><option value="transfer">تحويل</option></Select>
          {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="الزبون" className="max-w-xl">
      <div className="space-y-3">
        {!creating ? (
          <>
            <div className="flex gap-2">
              <Input aria-label="بحث بالاسم أو الرقم" placeholder="بحث بالاسم أو الرقم" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
              <Button variant="outline" onClick={() => { setCreating(true); setPhone(/^\d+$/.test(q) ? q : ""); setName(/^\d+$/.test(q) ? "" : q); }}><UserPlus className="size-4" /> جديد</Button>
            </div>
            <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {pos.customer && <li><button type="button" onClick={() => { pos.setCustomer(null); onClose(); }} className="w-full p-3 text-start text-sm text-danger-fg hover:bg-surface-2">شيل الزبون من الفاتورة</button></li>}
              {list.length === 0 && <li className="p-4 text-center text-sm text-muted">ما لقينا زبون.</li>}
              {list.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 p-3">
                  <button type="button" onClick={() => { pos.setCustomer(c.id); onClose(); }} className="min-w-0 flex-1 text-start">
                    <span className="block font-semibold">{c.name}</span>
                    <span className="block text-xs text-muted" dir="ltr">{c.phone}</span>
                  </button>
                  <span className="text-xs text-muted">دين {m(c.debt)} · محفظة {m(c.wallet)}{c.points ? ` · ${c.points} نقطة` : ""}</span>
                  <Button size="sm" variant="ghost" onClick={() => setMoney({ kind: "debt.pay", c })} disabled={c.debt <= 0}>سداد</Button>
                  <Button size="sm" variant="ghost" onClick={() => setMoney({ kind: "wallet.topup", c })}>شحن</Button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            if (!normalizeLibyanPhone(phone)) return setError("رقم الهاتف لازم يكون ليبي (09X أو +218).");
            if (name.trim().length < 2) return setError("اكتب اسم الزبون.");
            const c = await pos.createCustomer(name.trim(), phone);
            if (c) { pos.setCustomer(c.id); onClose(); }
          }}>
            <Input label="الاسم" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <Input label="رقم الهاتف" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912345678" />
            {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setCreating(false)}>رجوع</Button><Button type="submit">حفظ واختيار</Button></div>
          </form>
        )}
      </div>
    </Modal>
  );
}

// ===== الخصم =====
export function DiscountDialog({ pos, lineKey, onClose, onNeedApproval }: { pos: PosApi; lineKey: string | null; onClose: () => void; onNeedApproval: () => void }) {
  const line = lineKey ? pos.cart.lines.find((l) => l.key === lineKey) : null;
  const [kind, setKind] = useState<"amount" | "percent">(line ? "amount" : pos.cart.invoiceDiscount?.kind ?? "percent");
  const [value, setValue] = useState(line ? String(line.discount / 1000 || "") : pos.cart.invoiceDiscount ? String(pos.cart.invoiceDiscount.kind === "amount" ? pos.cart.invoiceDiscount.value / 1000 : pos.cart.invoiceDiscount.value) : "");
  return (
    <Modal open onClose={onClose} title={line ? `خصم على «${line.name}»` : "خصم على الفاتورة"}
      footer={<><Button variant="ghost" onClick={onClose}>رجوع</Button><Button onClick={() => {
        const n = kind === "percent" ? Math.min(100, Number(value) || 0) : inputToDirham(value) ?? 0;
        if (line) {
          const gross = line.unitPrice * line.quantity;
          pos.updateLine(line.key, { discount: Math.min(gross, kind === "percent" ? Math.round((gross * n) / 100) : n) });
        } else pos.setInvoiceDiscount(n > 0 ? { kind, value: n } : null);
        onClose();
        setTimeout(onNeedApproval, 0);
      }}>تطبيق</Button></>}>
      <div className="space-y-3">
        <div className="flex gap-2">
          {(["percent", "amount"] as const).map((k) => <Button key={k} variant={kind === k ? "primary" : "outline"} size="sm" onClick={() => setKind(k)}>{k === "percent" ? "نسبة %" : "مبلغ (د.ل)"}</Button>)}
        </div>
        <Input label={kind === "percent" ? "النسبة" : "المبلغ"} inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        <p className="text-xs text-muted">الخصم فوق {pos.boot?.config.maxDiscountPercent ?? 10}% يحتاج موافقة مشرف.</p>
      </div>
    </Modal>
  );
}

// ===== الدرج =====
export function CashDialog({ pos, onClose, onNeedApproval }: { pos: PosApi; onClose: () => void; onNeedApproval: (fn: (by: string) => void) => void }) {
  const [kind, setKind] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="الدرج"
      footer={<>
        <Button variant="ghost" className="me-auto" onClick={() => onNeedApproval(async (by) => { await pos.cashMove("drawer", 0, "فتح الدرج بدون بيع", by); onClose(); })}>فتح الدرج بدون بيع</Button>
        <Button variant="ghost" onClick={onClose}>رجوع</Button>
        <Button onClick={async () => {
          const a = inputToDirham(amount);
          if (!a || a <= 0) return setError("اكتب مبلغ صحيح.");
          if (reason.trim().length < 2) return setError("اكتب السبب.");
          const r = await pos.cashMove(kind, a, reason.trim());
          if (r) return setError(r);
          onClose();
        }}>تسجيل</Button>
      </>}>
      <div className="space-y-3">
        <div className="flex gap-2">{(["in", "out"] as const).map((k) => <Button key={k} variant={kind === k ? "primary" : "outline"} onClick={() => setKind(k)}>{k === "in" ? "إدخال فلوس" : "سحب فلوس"}</Button>)}</div>
        <Input label="المبلغ (د.ل)" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="السبب" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={kind === "in" ? "فكة من الخزنة" : "مشتريات للمحل"} />
        {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
      </div>
    </Modal>
  );
}

// ===== تقفيل الوردية =====
export function CloseShiftDialog({ pos, onClosed, onClose }: { pos: PosApi; onClosed: (z: NonNullable<Awaited<ReturnType<PosApi["closeShift"]>>>) => void; onClose: () => void }) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [coins, setCoins] = useState("");
  const [note, setNote] = useState("");
  const den = { ...Object.fromEntries(DENOMINATIONS.map((d) => [String(d), Number(counts[String(d)] || 0)])), coins: inputToDirham(coins) ?? 0 };
  const counted = countCash(den);
  const diff = counted - pos.shiftSummary.expected;
  return (
    <Modal open onClose={onClose} title="تقفيل الوردية" className="max-w-xl"
      footer={<><Button variant="ghost" onClick={onClose}>رجوع</Button><Button onClick={async () => { const z = await pos.closeShift(den, note); if (z) onClosed(z); }}>تقفيل وطباعة Z</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DENOMINATIONS.map((d) => <Input key={d} label={`${d / 1000} دينار`} inputMode="numeric" value={counts[String(d)] ?? ""} onChange={(e) => setCounts({ ...counts, [String(d)]: e.target.value.replace(/\D/g, "") })} placeholder="العدد" />)}
          <Input label="الفكة (د.ل)" inputMode="decimal" value={coins} onChange={(e) => setCoins(e.target.value)} />
        </div>
        <dl className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-4 text-sm">
          <dt className="text-muted">المتوقع في الدرج</dt><dd className="text-end font-semibold tabular-nums">{m(pos.shiftSummary.expected)}</dd>
          <dt className="text-muted">المعدود</dt><dd className="text-end font-semibold tabular-nums">{m(counted)}</dd>
          <dt className="text-muted">{diff < 0 ? "عجز" : diff > 0 ? "زيادة" : "الفرق"}</dt><dd className={cn("text-end font-bold tabular-nums", diff < 0 ? "text-danger-fg" : diff > 0 ? "text-success-fg" : "")}>{m(diff)}</dd>
        </dl>
        <Input label="ملاحظة (اختياري)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

// ===== المرتجع =====
type FoundSale = Awaited<ReturnType<PosApi["findSale"]>>;
export function ReturnDialog({ pos, onClose, onNeedApproval, onDone }: { pos: PosApi; onClose: () => void; onNeedApproval: (fn: (by: string) => void) => void; onDone: (amount: number) => void }) {
  const [no, setNo] = useState("");
  const [found, setFound] = useState<FoundSale>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [method, setMethod] = useState<PayMethod>("cash");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sale = found ? ("remote" in found ? found.remote : found) : null;
  const lines = sale ? ("remote" in found! ? found.remote.lines.map((l) => ({ name: l.name, quantity: l.quantity, total: l.total, returned: l.returned })) : (sale as LocalSale).lines.map((l, i) => ({ name: l.name, quantity: l.quantity, total: l.total, returned: (sale as LocalSale).returned[i] ?? 0 }))) : [];
  const discountShare = sale && "subtotal" in sale && sale.subtotal ? sale.discount / sale.subtotal : 0;
  const amount = lines.reduce((a, l, i) => a + Math.round(((l.total * (qty[i] ?? 0)) / l.quantity) * (1 - discountShare)), 0);
  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([i, q]) => ({ index: Number(i), quantity: q }));
  return (
    <Modal open onClose={onClose} title="مرتجع" className="max-w-xl"
      footer={sale ? <><Button variant="ghost" onClick={onClose}>رجوع</Button><Button disabled={!items.length} onClick={() => {
        if (reason.trim().length < 2) return setError("اكتب سبب المرتجع.");
        const go = async (by: string | null) => { const r = await pos.returnSale(sale.id, items, method, reason.trim(), by, amount); if (r) setError(r); else onDone(amount); };
        if (pos.cashier?.canApprove) void go(pos.cashier.userId); else onNeedApproval((by) => void go(by));
      }}>إرجاع {m(amount)}</Button></> : undefined}>
      {!sale ? (
        <form className="flex items-end gap-2" onSubmit={async (e) => { e.preventDefault(); setError(null); const f = await pos.findSale(no); if (!f) setError("ما لقينا الفاتورة."); setFound(f); if (f) { const pays = "remote" in f ? f.remote.payments : f.payments; setMethod([...pays].sort((a, b) => b.amount - a.amount)[0]?.method ?? "cash"); } }}>
          <Input label="رقم الفاتورة" autoFocus dir="ltr" value={no} onChange={(e) => setNo(e.target.value)} placeholder="مثلاً K1A2-37" />
          <Button type="submit">بحث</Button>
          {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
        </form>
      ) : (
        <div className="space-y-3">
          <ul className="divide-y divide-line rounded-lg border border-line">
            {lines.map((l, i) => {
              const max = l.quantity - l.returned;
              return (
                <li key={i} className="flex items-center gap-3 p-3 text-sm">
                  <span className="min-w-0 flex-1">{l.name} <span className="text-muted">({l.quantity}{l.returned ? `، رجع ${l.returned}` : ""})</span></span>
                  <input type="number" min={0} max={max} disabled={max <= 0} aria-label={`كمية مرتجع ${l.name}`} value={qty[i] ?? 0} onChange={(e) => setQty({ ...qty, [i]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })} className="h-10 w-20 rounded-md border border-line bg-surface px-2 text-center" />
                </li>
              );
            })}
          </ul>
          <Select label="ترجع الفلوس" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
            {(["cash", "card", "transfer", "credit", "wallet"] as PayMethod[]).filter((x) => sale.customerId || (x !== "credit" && x !== "wallet")).map((x) => <option key={x} value={x}>{x === "credit" ? "تنقص من الدين" : PAY_METHOD_LABELS[x]}</option>)}
          </Select>
          <Input label="السبب" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
