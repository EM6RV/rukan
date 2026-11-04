"use client";

import { useState } from "react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { LINE_INFO, OPS_LINES, PRODUCT_LINES, type ProductLine } from "@/lib/product-lines";
import { STATE_LABEL, STATE_TONE } from "@/lib/store-state";
import { adminStartTrialAction, setLineBetaAction, setSuspendedAction } from "../../actions";

type Row = { line: ProductLine; subscribed: boolean; state: "trial" | "active" | "expired" | "suspended" | "none"; planName: string | null; daysLeft: number | null; launched: boolean };

/** منظومات النشاط: الحالة لكل وحدة، فتح تجربة، إيقاف منظومة، والتجربة قبل الإطلاق */
export function LinesAdmin({ storeId, rows, beta }: { storeId: string; rows: Row[]; beta: ProductLine[] }) {
  const [b, setB] = useState(beta);
  const act = useAct();
  return (
    <Card>
      <CardHeader title="المنظومات" description="كل منظومة باشتراك لحالها. «تجربة قبل الإطلاق» تفتح منظومة «قريباً» للنشاط هذا بس." />
      <CardBody className="space-y-3">
        <ul className="divide-y divide-line rounded-lg border border-line">
          {PRODUCT_LINES.map((l) => {
            const r = rows.find((x) => x.line === l)!;
            return (
              <li key={l} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{LINE_INFO[l].brand}
                    {r.subscribed && r.state !== "none" ? <Badge tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Badge> : <Badge>مش مشترك</Badge>}
                    {!r.launched && <Badge tone="gold">قريباً</Badge>}
                  </p>
                  {r.subscribed && <p className="text-muted">{r.planName ?? "بدون باقة"}{r.daysLeft !== null && r.state !== "suspended" ? ` · ${r.daysLeft > 0 ? `باقي ${r.daysLeft} يوم` : "منتهي"}` : ""}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!r.subscribed && <Button size="sm" variant="outline" loading={act.pending} onClick={() => act.act(() => adminStartTrialAction(storeId, l), `بدت تجربة ${LINE_INFO[l].brand}`)}>ابدا تجربة</Button>}
                  {r.subscribed && r.state !== "suspended" && <Button size="sm" variant="ghost" loading={act.pending} onClick={() => act.act(() => setSuspendedAction(storeId, true, null, l), `تم إيقاف ${LINE_INFO[l].brand}`)}>إيقاف المنظومة</Button>}
                  {r.subscribed && r.state === "suspended" && <Button size="sm" variant="outline" loading={act.pending} onClick={() => act.act(() => setSuspendedAction(storeId, false, null, l), `تم تفعيل ${LINE_INFO[l].brand}`)}>تفعيل المنظومة</Button>}
                </div>
              </li>
            );
          })}
        </ul>
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-medium">تجربة قبل الإطلاق</legend>
          {OPS_LINES.map((l) => (
            <Toggle key={l} label={LINE_INFO[l].brand} checked={b.includes(l)} disabled={act.pending}
              onChange={(c) => { const next = c ? [...b, l] : b.filter((x) => x !== l); setB(next); act.act(() => setLineBetaAction(storeId, next), "تم الحفظ"); }} />
          ))}
        </fieldset>
        {act.error && <p role="alert" className={errorClass}>{act.error}</p>}
      </CardBody>
    </Card>
  );
}
