"use client";

import { useState } from "react";
import { Ban, CalendarPlus, CheckCircle2 } from "lucide-react";
import { ImageUploader } from "@/components/dashboard/image-uploader";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cycleMonths, DURATIONS, offeredCycles, planPrice, savingsPercent, type BillingPeriod } from "@/lib/billing";
import type { AddonKind, PlanPrices } from "@/db/schema/platform";
import { dirhamToInput, formatMoney, inputToDirham } from "@/lib/money";
import { addonFitsLine, LINE_INFO, PRODUCT_LINES, type ProductLine } from "@/lib/product-lines";
import { changePlanAction, extendTrialAction, recordPaymentAction, setSuspendedAction } from "../../actions";

type PlanOpt = { id: string; name: string; prices: PlanPrices; isFree: boolean; line: ProductLine };
type AddonOpt = { id: string; name: string; monthlyPrice: number; kind: AddonKind };
export type LineSubOpt = { line: ProductLine; subscribed: boolean; state: "trial" | "active" | "expired" | "suspended" | "none"; planId: string | null; cycle: BillingPeriod };
type BundleOpt = { nameAr: string; lines: ProductLine[]; discountPercent: number };
type Props = {
  storeId: string; suspended: boolean;
  plans: PlanOpt[]; addons: AddonOpt[];
  /** الإضافات الحالية لكل منظومة */
  currentAddons: Partial<Record<ProductLine, Record<string, number>>>;
  lines: LineSubOpt[]; bundles: BundleOpt[];
};

/** المبلغ المقترح: سعر الباقة للمدة + الإضافات (شهري × عدد الشهور)، ناقص خصم حزمة الدمج */
function suggest(plan: PlanOpt | undefined, cycle: BillingPeriod, addons: AddonOpt[], qty: Record<string, number>, discount = 0) {
  const base = plan ? planPrice(plan, cycle) : null;
  if (base == null) return "";
  const total = base + addons.reduce((s, a) => s + a.monthlyPrice * (qty[a.id] ?? 0), 0) * cycleMonths(cycle);
  return dirhamToInput(Math.round((total * (100 - discount)) / 100)) || "0";
}

export function StoreActions({ storeId, suspended, plans, addons: allAddons, currentAddons, lines, bundles }: Props) {
  const firstSub = lines.find((l) => l.line === "store" && l.subscribed) ?? lines.find((l) => l.subscribed);
  const [line, setLine] = useState<ProductLine>(firstSub?.line ?? "store");
  const sub = lines.find((l) => l.line === line)!;
  const currentPlanId = sub.planId, state = sub.state;
  const subscribedLines = lines.filter((l) => l.subscribed).map((l) => l.line);
  // حزمة الدمج: كل منظوماتها عند النشاط (بعد الدفعة) والمنظومة المدفوعة منها
  const after = subscribedLines.includes(line) ? subscribedLines : [...subscribedLines, line];
  const bundle = bundles.filter((b) => b.lines.includes(line) && b.lines.every((l) => after.includes(l))).sort((a, b) => b.discountPercent - a.discountPercent)[0];
  const discount = bundle?.discountPercent ?? 0;
  const addons = allAddons.filter((a) => addonFitsLine(a.kind, line));
  const paidPlans = plans.filter((p) => !p.isFree && p.line === line);
  const linePlans = plans.filter((p) => p.line === line);
  const pick = (l: ProductLine) => {
    const ls = lines.find((x) => x.line === l)!;
    const pp = plans.filter((p) => !p.isFree && p.line === l);
    const plan = pp.find((p) => p.id === ls.planId) ?? pp[0];
    const cycle = plan && offeredCycles(plan).includes(ls.cycle) ? ls.cycle : (plan ? offeredCycles(plan)[0] : "monthly") ?? "monthly";
    return { plan, cycle };
  };
  const init = pick(line);
  const [qty, setQty] = useState<Record<string, number>>(currentAddons[line] ?? {});
  const [pay, setPay] = useState({ planId: init.plan?.id ?? "", cycle: init.cycle as BillingPeriod, amount: suggest(init.plan, init.cycle, addons, currentAddons[line] ?? {}, discount), method: "cash", note: "" });
  const [receipt, setReceipt] = useState<{ id: string; url: string } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [days, setDays] = useState("7");
  const [planId, setPlanId] = useState(currentPlanId ?? "");
  function switchLine(l: ProductLine) {
    const { plan, cycle } = pick(l);
    const q = currentAddons[l] ?? {};
    setLine(l); setQty(q); setPlanId(lines.find((x) => x.line === l)?.planId ?? "");
    const lineAddons = allAddons.filter((a) => addonFitsLine(a.kind, l));
    const subs = subscribedLines.includes(l) ? subscribedLines : [...subscribedLines, l];
    const b = bundles.filter((x) => x.lines.includes(l) && x.lines.every((y) => subs.includes(y))).sort((a, c) => c.discountPercent - a.discountPercent)[0];
    setPay((p) => ({ ...p, planId: plan?.id ?? "", cycle, amount: suggest(plan, cycle, lineAddons, q, b?.discountPercent ?? 0) }));
  }
  const [modal, setModal] = useState<null | "suspend">(null);
  const [reason, setReason] = useState("");
  const payAct = useAct();
  const trialAct = useAct();
  const planAct = useAct();
  const susAct = useAct();

  const selected = paidPlans.find((x) => x.id === pay.planId);
  const cycles = selected ? offeredCycles(selected) : [];
  // تغيير الباقة/المدة/الإضافات يحسب المبلغ المقترح من جديد (والأدمن يقدر يعدّله)
  const update = (patch: Partial<typeof pay>, nextQty = qty) => {
    const next = { ...pay, ...patch };
    const plan = paidPlans.find((x) => x.id === next.planId);
    if (plan && !offeredCycles(plan).includes(next.cycle)) next.cycle = offeredCycles(plan)[0] ?? "monthly";
    setPay({ ...next, amount: suggest(plan, next.cycle, addons, nextQty, discount) });
  };

  function submitPay() {
    setLocalError(null);
    const amount = inputToDirham(pay.amount);
    if (amount === undefined || amount === null || amount <= 0) return setLocalError("اكتب مبلغ صحيح أكبر من صفر");
    payAct.act(() => recordPaymentAction({ storeId, line, planId: pay.planId, cycle: pay.cycle, addons: addons.map((a) => ({ addonId: a.id, quantity: qty[a.id] ?? 0 })), amount, method: pay.method, receiptMediaId: receipt?.id ?? null, note: pay.note }), "تم تسجيل الدفعة وتفعيل الاشتراك", () => { setReceipt(null); setPay((p) => ({ ...p, note: "" })); });
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="المنظومة" className="flex flex-wrap gap-2">
        {PRODUCT_LINES.map((l) => {
          const x = lines.find((y) => y.line === l)!;
          return (
            <button key={l} type="button" role="tab" aria-selected={line === l} onClick={() => switchLine(l)}
              className={`min-h-10 rounded-full border px-4 text-sm font-medium ${line === l ? "border-fg bg-fg text-bg" : "border-line bg-surface hover:bg-surface-2"} ${x.subscribed ? "" : "opacity-70"}`}>
              {LINE_INFO[l].brand}{x.subscribed ? "" : " (مش مشترك)"}
            </button>
          );
        })}
      </div>
      <Card id="payment">
        <CardHeader title={`تسجيل دفعة · ${LINE_INFO[line].brand}`} description={sub.subscribed ? "يفعّل اشتراك المنظومة ويمدد فترتها بالمدة المختارة، من نهاية الاشتراك الحالي لو لسا ساري. الإضافات تمشي مع نفس الفترة." : "النشاط مش مشترك في المنظومة هذي: الدفعة تفتحها له."} />
        <CardBody className="space-y-4">
          {bundle && <p className="rounded-md bg-gold/15 px-3 py-2 text-sm">حزمة «{bundle.nameAr}»: خصم {bundle.discountPercent}% محسوب في المبلغ المقترح.</p>}
          <div className="grid grid-cols-2 gap-3">
            <Select label="الباقة" value={pay.planId} onChange={(e) => update({ planId: e.target.value })}>{paidPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select label="المدة" value={pay.cycle} onChange={(e) => update({ cycle: e.target.value as BillingPeriod })}>
              {DURATIONS.filter((d) => cycles.includes(d.cycle)).map((d) => { const save = selected ? savingsPercent(selected, d.cycle) : 0; return <option key={d.key} value={d.cycle}>{d.unit} · {formatMoney(planPrice(selected!, d.cycle)!)}{save ? ` (وفّر ${save}%)` : ""}</option>; })}
            </Select>
          </div>
          {addons.length > 0 && (
            <fieldset className="space-y-2 rounded-lg border border-line p-3">
              <legend className="px-1 text-sm font-medium">الإضافات</legend>
              {addons.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{a.name} <span className="text-muted">({formatMoney(a.monthlyPrice)} / شهر)</span></span>
                  <input type="number" min={0} max={100} aria-label={`عدد ${a.name}`} value={qty[a.id] ?? 0} onChange={(e) => { const q = { ...qty, [a.id]: Math.max(0, Number(e.target.value) || 0) }; setQty(q); update({}, q); }} className="h-10 w-20 rounded-md border border-line bg-surface px-2 text-center" />
                </div>
              ))}
            </fieldset>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="المبلغ (د.ل)" inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} hint="محسوب من السعر، وتقدر تعدّله" />
            <Select label="طريقة الدفع" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="cash">كاش</option><option value="bank_transfer">تحويل مصرفي</option><option value="other">أخرى</option></Select>
          </div>
          <ImageUploader label="صورة الإيصال (اختياري)" kind="receipt" storeId={storeId} shape="wide" value={receipt} onChange={setReceipt} />
          <Textarea label="ملاحظة (اختياري)" rows={2} maxLength={300} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
          {(localError ?? payAct.error) && <p role="alert" className={errorClass}>{localError ?? payAct.error}</p>}
          <Button loading={payAct.pending} onClick={submitPay}>سجّل الدفعة</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="إجراءات" />
        <CardBody className="space-y-5">
          {sub.subscribed && state !== "active" && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-32"><Input label="تمديد التجربة (أيام)" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></div>
              <Button variant="outline" loading={trialAct.pending} onClick={() => trialAct.act(() => extendTrialAction(storeId, Number(days), line), "تم تمديد التجربة")}><CalendarPlus className="size-4" aria-hidden /> تمديد</Button>
              {trialAct.error && <p role="alert" className={`${errorClass} w-full`}>{trialAct.error}</p>}
            </div>
          )}
          {sub.subscribed && <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1"><Select label="تغيير الباقة بدون دفعة" value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">اختار الباقة</option>{linePlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
            <Button variant="outline" disabled={!planId || planId === currentPlanId} loading={planAct.pending} onClick={() => planAct.act(() => changePlanAction(storeId, planId), "تم تغيير الباقة")}>تغيير</Button>
            {planAct.error && <p role="alert" className={`${errorClass} w-full`}>{planAct.error}</p>}
          </div>}
          <div className="border-t border-line pt-4">
            {suspended ? (
              <Button variant="outline" loading={susAct.pending} onClick={() => susAct.act(() => setSuspendedAction(storeId, false, null), "تم تفعيل النشاط")}><CheckCircle2 className="size-4" aria-hidden /> تفعيل النشاط</Button>
            ) : (
              <Button variant="danger" onClick={() => { susAct.setError(null); setModal("suspend"); }}><Ban className="size-4" aria-hidden /> إيقاف النشاط (كل المنظومات)</Button>
            )}
            {susAct.error && !modal && <p role="alert" className={`${errorClass} mt-2`}>{susAct.error}</p>}
          </div>
        </CardBody>
      </Card>

      {modal === "suspend" && (
        <Modal open onClose={() => setModal(null)} title="إيقاف النشاط"
          footer={<><Button variant="ghost" onClick={() => setModal(null)} disabled={susAct.pending}>إلغاء</Button><Button variant="danger" loading={susAct.pending} onClick={() => susAct.act(() => setSuspendedAction(storeId, true, reason), "تم إيقاف النشاط", () => setModal(null))}>إيقاف</Button></>}>
          <div className="space-y-3"><p className="text-sm">كل منظومات النشاط تتوقف: المتجر يتقفل للزباين واللوحة تبقى للقراءة فقط. تقدر تفعّله بعدين.</p><Input label="السبب (للسجل)" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />{susAct.error && <p role="alert" className={errorClass}>{susAct.error}</p>}</div>
        </Modal>
      )}
    </div>
  );
}
