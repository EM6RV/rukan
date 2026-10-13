"use client";

import { useState } from "react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, PhoneInput, Select } from "@/components/ui/field";
import { savePlatformConfigAction } from "../actions";

export function SettingsForm({ config, plans }: { config: { trialDays: number; trialPlanSlug: string; supportWhatsapp: string | null }; plans: { slug: string; name: string }[] }) {
  const [v, setV] = useState({ trialDays: String(config.trialDays), trialPlanSlug: config.trialPlanSlug, supportWhatsapp: config.supportWhatsapp ?? "" });
  const { act, pending, error } = useAct();
  return (
    <Card><CardBody>
      <form className="max-w-xl space-y-5" onSubmit={(e) => { e.preventDefault(); act(() => savePlatformConfigAction({ trialDays: Number(v.trialDays), trialPlanSlug: v.trialPlanSlug, supportWhatsapp: v.supportWhatsapp }), "تم الحفظ"); }}>
        <Input label="أيام التجربة المجانية" inputMode="numeric" value={v.trialDays} onChange={(e) => setV({ ...v, trialDays: e.target.value })} hint="تنطبق على المتاجر الجديدة فقط" />
        <Select label="باقة التجربة" value={v.trialPlanSlug} onChange={(e) => setV({ ...v, trialPlanSlug: e.target.value })} hint="المتجر الجديد يجرب مزايا هذي الباقة">{plans.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</Select>
        <PhoneInput label="واتساب الدعم" hint="يظهر في صفحة اشتراك البياع (للتجديد والترقية) وفي الموقع التسويقي" value={v.supportWhatsapp} onChange={(e) => setV({ ...v, supportWhatsapp: e.target.value })} />
        {error && <p role="alert" className={errorClass}>{error}</p>}
        <Button type="submit" loading={pending}>حفظ</Button>
      </form>
    </CardBody></Card>
  );
}
