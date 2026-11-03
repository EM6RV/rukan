"use client";

import { useState } from "react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { dirhamToInput, inputToDirham } from "@/lib/money";
import type { PosConfig } from "@/lib/pos-config";
import { savePosConfigAction } from "./actions";

export function PosSettingsForm({ initial, writable }: { initial: Required<PosConfig>; writable: boolean }) {
  const [v, setV] = useState({
    paperWidth: String(initial.paperWidth), maxDiscountPercent: String(initial.maxDiscountPercent), loyaltyPercent: String(initial.loyaltyPercent),
    pointValue: dirhamToInput(initial.pointValue), defaultCreditLimit: initial.defaultCreditLimit === null ? "" : dirhamToInput(initial.defaultCreditLimit),
    debtAlertDays: String(initial.debtAlertDays), showLogo: initial.showLogo,
  });
  const { act, pending, error } = useAct();
  return (
    <Card><CardBody>
      <form className="max-w-xl space-y-4" onSubmit={(e) => {
        e.preventDefault();
        act(() => savePosConfigAction({
          paperWidth: Number(v.paperWidth), maxDiscountPercent: Number(v.maxDiscountPercent) || 0, loyaltyPercent: Number(v.loyaltyPercent) || 0,
          pointValue: inputToDirham(v.pointValue) ?? 100, defaultCreditLimit: v.defaultCreditLimit.trim() === "" ? null : inputToDirham(v.defaultCreditLimit) ?? 0,
          debtAlertDays: Number(v.debtAlertDays) || 30, showLogo: v.showLogo,
        }), "تم الحفظ");
      }}>
        <Select label="عرض ورق الطابعة" value={v.paperWidth} onChange={(e) => setV({ ...v, paperWidth: e.target.value })}><option value="58">58 ملم</option><option value="80">80 ملم</option></Select>
        <Input label="أكبر خصم بدون موافقة مشرف (%)" inputMode="numeric" value={v.maxDiscountPercent} onChange={(e) => setV({ ...v, maxDiscountPercent: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="نقاط الولاء: نسبة من المشتريات (%)" inputMode="decimal" value={v.loyaltyPercent} onChange={(e) => setV({ ...v, loyaltyPercent: e.target.value })} hint="0 = مطفية" />
          <Input label="قيمة النقطة عند الصرف (د.ل)" inputMode="decimal" value={v.pointValue} onChange={(e) => setV({ ...v, pointValue: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="حد الدين الافتراضي لكل زبون (د.ل)" inputMode="decimal" value={v.defaultCreditLimit} onChange={(e) => setV({ ...v, defaultCreditLimit: e.target.value })} hint="فاضي = بدون حد" />
          <Input label="تنبيه الدين بدون سداد بعد (يوم)" inputMode="numeric" value={v.debtAlertDays} onChange={(e) => setV({ ...v, debtAlertDays: e.target.value })} />
        </div>
        <Toggle label="لوجو المحل في الفاتورة" checked={v.showLogo} onChange={(showLogo) => setV({ ...v, showLogo })} />
        {error && <p role="alert" className={errorClass}>{error}</p>}
        <Button type="submit" loading={pending} disabled={!writable}>حفظ</Button>
      </form>
    </CardBody></Card>
  );
}
