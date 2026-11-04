"use client";

import { useState } from "react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { LINE_INFO, OPS_LINES } from "@/lib/product-lines";
import type { LineConfig } from "@/server/admin/settings";
import { saveLineConfigAction } from "../actions";

/** إطلاق المنظومات ومدة تجربة كل وحدة وباقتها */
export function LinesForm({ config, plans }: { config: LineConfig; plans: { slug: string; name: string; line: string }[] }) {
  const [v, setV] = useState(Object.fromEntries(OPS_LINES.map((l) => [l, { ...config[l], trialDays: String(config[l].trialDays) }])) as Record<(typeof OPS_LINES)[number], { trialDays: string; trialPlanSlug: string; launch: "live" | "soon" }>);
  const { act, pending, error } = useAct();
  return (
    <Card>
      <CardHeader title="المنظومات (ماركت · بلاي · فِت)" description="«قريباً» = ما تطلعش في التسجيل إلا للنشاطات اللي تفتحها لهم من صفحة المتجر كتجربة." />
      <CardBody>
        <form className="space-y-5" onSubmit={(e) => {
          e.preventDefault();
          act(() => saveLineConfigAction(Object.fromEntries(OPS_LINES.map((l) => [l, { ...v[l], trialDays: Number(v[l].trialDays) }]))), "تم الحفظ");
        }}>
          {OPS_LINES.map((l) => (
            <fieldset key={l} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-3">
              <legend className="px-1 text-sm font-semibold">{LINE_INFO[l].brand}</legend>
              <Select label="الإطلاق" value={v[l].launch} onChange={(e) => setV({ ...v, [l]: { ...v[l], launch: e.target.value as "live" | "soon" } })}>
                <option value="soon">قريباً (تجربة لنشاطات معينة)</option>
                <option value="live">مطلقة للكل</option>
              </Select>
              <Input label="أيام التجربة" inputMode="numeric" value={v[l].trialDays} onChange={(e) => setV({ ...v, [l]: { ...v[l], trialDays: e.target.value.replace(/\D/g, "") } })} />
              <Select label="باقة التجربة" value={v[l].trialPlanSlug} onChange={(e) => setV({ ...v, [l]: { ...v[l], trialPlanSlug: e.target.value } })}>
                {plans.filter((p) => p.line === l).map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </Select>
            </fieldset>
          ))}
          {error && <p role="alert" className={errorClass}>{error}</p>}
          <Button type="submit" loading={pending}>حفظ</Button>
        </form>
      </CardBody>
    </Card>
  );
}
