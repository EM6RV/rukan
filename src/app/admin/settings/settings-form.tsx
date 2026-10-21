"use client";

import { useState } from "react";
import { Megaphone, Rocket } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, PhoneInput, Select } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { dateInputToMs, msToDateInput } from "@/lib/date-input";
import type { PlatformConfig } from "@/server/admin/settings";
import { savePlatformConfigAction, savePromoAction, setFreePlanAction } from "../actions";

export function SettingsForm({ config, plans, freePlan }: { config: PlatformConfig; plans: { slug: string; name: string }[]; freePlan: { name: string; isActive: boolean } | null }) {
  const [v, setV] = useState({ trialDays: String(config.trialDays), trialPlanSlug: config.trialPlanSlug, supportWhatsapp: config.supportWhatsapp ?? "", startMode: config.startMode });
  const [promo, setPromo] = useState({ enabled: config.promo.enabled, text: config.promo.text, linkLabel: config.promo.linkLabel, endsAt: msToDateInput(config.promo.endsAt) });
  const { act, pending, error } = useAct();
  const freeAct = useAct();
  const promoAct = useAct();

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="بداية المتاجر الجديدة" description="تجربة مجانية بعدد أيام (الحالي)، أو الباقة المجانية للأبد لما تطلقها." />
        <CardBody>
          <form className="max-w-xl space-y-5" onSubmit={(e) => { e.preventDefault(); act(() => savePlatformConfigAction({ trialDays: Number(v.trialDays), trialPlanSlug: v.trialPlanSlug, supportWhatsapp: v.supportWhatsapp, startMode: v.startMode }), "تم الحفظ"); }}>
            <Select label="المتجر الجديد يبدا بـ" value={v.startMode} onChange={(e) => setV({ ...v, startMode: e.target.value as "trial" | "free" })} hint={config.freePlanEnabled ? undefined : "الباقة المجانية مطفية: أطلقها من تحت أول"}>
              <option value="trial">تجربة مجانية بعدد أيام</option>
              <option value="free" disabled={!config.freePlanEnabled}>الباقة المجانية للأبد</option>
            </Select>
            <Input label="أيام التجربة المجانية" inputMode="numeric" value={v.trialDays} onChange={(e) => setV({ ...v, trialDays: e.target.value })} hint="تنطبق على المتاجر الجديدة فقط" />
            <Select label="باقة التجربة" value={v.trialPlanSlug} onChange={(e) => setV({ ...v, trialPlanSlug: e.target.value })} hint="المتجر الجديد يجرب مزايا هذي الباقة">{plans.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</Select>
            <PhoneInput label="واتساب الدعم" hint="يظهر في صفحة اشتراك البياع (للتجديد والترقية) وفي الموقع التسويقي" value={v.supportWhatsapp} onChange={(e) => setV({ ...v, supportWhatsapp: e.target.value })} />
            {error && <p role="alert" className={errorClass}>{error}</p>}
            <Button type="submit" loading={pending}>حفظ</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="الباقة المجانية" description="جاهزة بحدودها، لكن مخفية: ما تطلعش في الأسعار ولا المقارنة ولا التسجيل لين تطلقها." action={config.freePlanEnabled ? <Badge tone="success">مطلقة</Badge> : <Badge>مطفية</Badge>} />
        <CardBody className="space-y-3">
          {!freePlan ? <p className="text-sm text-muted">ما فيش باقة مجانية. جهّزها من «الباقات» (علّم «باقة مجانية للأبد»).</p> : (
            <>
              <p className="text-sm">الباقة: <strong>{freePlan.name}</strong>{!freePlan.isActive && " (موقوفة)"}. حدودها تتعدل من «الباقات».</p>
              {config.freePlanEnabled ? (
                <Button variant="outline" loading={freeAct.pending} onClick={() => freeAct.act(() => setFreePlanAction(false), "اتطفت الباقة المجانية، والمتاجر الجديدة ترجع تبدا بتجربة")}>إطفاء الباقة المجانية</Button>
              ) : (
                <Button loading={freeAct.pending} onClick={() => freeAct.act(() => setFreePlanAction(true), "تم إطلاق الباقة المجانية: طلعت في الأسعار والمقارنة")}><Rocket className="size-4" aria-hidden /> أطلق الباقة المجانية</Button>
              )}
            </>
          )}
          {freeAct.error && <p role="alert" className={errorClass}>{freeAct.error}</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="عرض ترويجي" description="شريط فوق الموقع التسويقي (مثلاً «أول شهر مجاني في أي باقة»). التطبيق الفعلي للعرض يكون يدوي عند تسجيل الدفعة." />
        <CardBody>
          <form className="max-w-xl space-y-4" onSubmit={(e) => { e.preventDefault(); promoAct.act(() => savePromoAction({ enabled: promo.enabled, text: promo.text, linkLabel: promo.linkLabel, endsAt: dateInputToMs(promo.endsAt, "end") }), "تم حفظ العرض"); }}>
            <Toggle label="العرض مفعّل" checked={promo.enabled} onChange={(enabled) => setPromo({ ...promo, enabled })} />
            <Input label="نص العرض" maxLength={140} value={promo.text} onChange={(e) => setPromo({ ...promo, text: e.target.value })} placeholder="أول شهر مجاني في أي باقة مدفوعة" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="نص الزر (اختياري)" maxLength={30} value={promo.linkLabel} onChange={(e) => setPromo({ ...promo, linkLabel: e.target.value })} placeholder="افتح متجرك" />
              <Input label="ينتهي يوم (اختياري)" type="date" value={promo.endsAt} onChange={(e) => setPromo({ ...promo, endsAt: e.target.value })} />
            </div>
            {promoAct.error && <p role="alert" className={errorClass}>{promoAct.error}</p>}
            <Button type="submit" variant="outline" loading={promoAct.pending}><Megaphone className="size-4" aria-hidden /> حفظ العرض</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
