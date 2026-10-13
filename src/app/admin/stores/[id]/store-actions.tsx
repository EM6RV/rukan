"use client";

import { useState } from "react";
import { Ban, CalendarPlus, CheckCircle2 } from "lucide-react";
import { ImageUploader } from "@/components/dashboard/image-uploader";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { dirhamToInput, inputToDirham } from "@/lib/money";
import { changePlanAction, extendTrialAction, recordPaymentAction, setSuspendedAction } from "../../actions";

type PlanOpt = { id: string; name: string; priceMonthly: number; priceYearly: number };
type Props = { storeId: string; suspended: boolean; currentPlanId: string | null; currentCycle: "monthly" | "yearly"; state: "trial" | "active" | "expired" | "suspended"; plans: PlanOpt[] };

export function StoreActions({ storeId, suspended, currentPlanId, currentCycle, state, plans }: Props) {
  const defaultPlan = plans.find((p) => p.id === currentPlanId) ?? plans[0];
  const [pay, setPay] = useState({ planId: defaultPlan?.id ?? "", cycle: currentCycle, amount: dirhamToInput(currentCycle === "yearly" ? defaultPlan?.priceYearly : defaultPlan?.priceMonthly), method: "cash", note: "" });
  const [receipt, setReceipt] = useState<{ id: string; url: string } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [days, setDays] = useState("7");
  const [planId, setPlanId] = useState(currentPlanId ?? "");
  const [modal, setModal] = useState<null | "suspend">(null);
  const [reason, setReason] = useState("");
  const payAct = useAct();
  const trialAct = useAct();
  const planAct = useAct();
  const susAct = useAct();

  const price = (planIdx: string, cycle: string) => { const p = plans.find((x) => x.id === planIdx); return dirhamToInput(cycle === "yearly" ? p?.priceYearly : p?.priceMonthly); };

  function submitPay() {
    setLocalError(null);
    const amount = inputToDirham(pay.amount);
    if (amount === undefined || amount === null || amount <= 0) return setLocalError("اكتب مبلغ صحيح أكبر من صفر");
    payAct.act(() => recordPaymentAction({ storeId, planId: pay.planId, billingCycle: pay.cycle, amount, method: pay.method, receiptMediaId: receipt?.id ?? null, note: pay.note }), "تم تسجيل الدفعة وتفعيل الاشتراك", () => { setReceipt(null); setPay((p) => ({ ...p, note: "" })); });
  }

  return (
    <div className="space-y-4">
      <Card id="payment">
        <CardHeader title="تسجيل دفعة" description="يفعّل الاشتراك ويمدد الفترة تلقائياً (من نهاية الاشتراك الحالي لو لسا ساري)." />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="الباقة" value={pay.planId} onChange={(e) => setPay({ ...pay, planId: e.target.value, amount: price(e.target.value, pay.cycle) })}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select label="الدورة" value={pay.cycle} onChange={(e) => setPay({ ...pay, cycle: e.target.value as "monthly" | "yearly", amount: price(pay.planId, e.target.value) })}><option value="monthly">شهري</option><option value="yearly">سنوي</option></Select>
            <Input label="المبلغ (د.ل)" inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            <Select label="طريقة الدفع" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="cash">كاش</option><option value="bank_transfer">تحويل مصرفي</option><option value="other">أخرى</option></Select>
          </div>
          <ImageUploader label="صورة الإيصال (اختياري)" kind="receipt" storeId={storeId} shape="wide" value={receipt} onChange={setReceipt} />
          <Textarea label="ملاحظة (اختياري)" rows={2} maxLength={300} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
          {(localError ?? payAct.error) && <p role="alert" className={errorClass}>{localError ?? payAct.error}</p>}
          <Button loading={payAct.pending} onClick={submitPay}>تسجيل الدفعة</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="إجراءات" />
        <CardBody className="space-y-5">
          {state !== "active" && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-32"><Input label="تمديد التجربة (أيام)" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></div>
              <Button variant="outline" loading={trialAct.pending} onClick={() => trialAct.act(() => extendTrialAction(storeId, Number(days)), "تم تمديد التجربة")}><CalendarPlus className="size-4" aria-hidden /> تمديد</Button>
              {trialAct.error && <p role="alert" className={`${errorClass} w-full`}>{trialAct.error}</p>}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1"><Select label="تغيير الباقة بدون دفعة" value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">اختار الباقة</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
            <Button variant="outline" disabled={!planId || planId === currentPlanId} loading={planAct.pending} onClick={() => planAct.act(() => changePlanAction(storeId, planId), "تم تغيير الباقة")}>تغيير</Button>
            {planAct.error && <p role="alert" className={`${errorClass} w-full`}>{planAct.error}</p>}
          </div>
          <div className="border-t border-line pt-4">
            {suspended ? (
              <Button variant="outline" loading={susAct.pending} onClick={() => susAct.act(() => setSuspendedAction(storeId, false, null), "تم تفعيل المتجر")}><CheckCircle2 className="size-4" aria-hidden /> تفعيل المتجر</Button>
            ) : (
              <Button variant="danger" onClick={() => { susAct.setError(null); setModal("suspend"); }}><Ban className="size-4" aria-hidden /> إيقاف المتجر</Button>
            )}
            {susAct.error && !modal && <p role="alert" className={`${errorClass} mt-2`}>{susAct.error}</p>}
          </div>
        </CardBody>
      </Card>

      {modal === "suspend" && (
        <Modal open onClose={() => setModal(null)} title="إيقاف المتجر"
          footer={<><Button variant="ghost" onClick={() => setModal(null)} disabled={susAct.pending}>رجوع</Button><Button variant="danger" loading={susAct.pending} onClick={() => susAct.act(() => setSuspendedAction(storeId, true, reason), "تم إيقاف المتجر", () => setModal(null))}>إيقاف</Button></>}>
          <div className="space-y-3"><p className="text-sm">المتجر يتقفل للزباين واللوحة تبقى للقراءة فقط. تقدر تفعّله بعدين.</p><Input label="السبب (للسجل)" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />{susAct.error && <p role="alert" className={errorClass}>{susAct.error}</p>}</div>
        </Modal>
      )}
    </div>
  );
}
