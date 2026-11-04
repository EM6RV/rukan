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

export function PosSettingsForm({ initial, writable, market }: { initial: Required<PosConfig>; writable: boolean; market: boolean }) {
  const [v, setV] = useState({
    paperWidth: String(initial.paperWidth), maxDiscountPercent: String(initial.maxDiscountPercent), loyaltyPercent: String(initial.loyaltyPercent),
    pointValue: dirhamToInput(initial.pointValue), defaultCreditLimit: initial.defaultCreditLimit === null ? "" : dirhamToInput(initial.defaultCreditLimit),
    debtAlertDays: String(initial.debtAlertDays), showLogo: initial.showLogo,
    prefixes: initial.scale.prefixes.join(", "), itemDigits: String(initial.scale.itemDigits), scaleValue: initial.scale.value, priceMultiplier: String(initial.scale.priceMultiplier),
    reorderCoverDays: String(initial.reorderCoverDays),
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
          ...(market ? {
            scale: { prefixes: v.prefixes.split(/[,،\s]+/).filter(Boolean), itemDigits: Number(v.itemDigits), value: v.scaleValue, priceMultiplier: Number(v.priceMultiplier) },
            reorderCoverDays: Number(v.reorderCoverDays) || 14,
          } : {}),
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
        {market && (
          <fieldset className="space-y-3 rounded-xl border border-line p-4">
            <legend className="px-1 font-semibold">الميزان والماركت</legend>
            <p className="text-sm text-muted">باركود الميزان: بادئة (رقمين) + رقم الصنف + الوزن أو السعر + رقم تحقق. طابقها مع برمجة ميزانك.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="بادئات باركود الميزان" dir="ltr" value={v.prefixes} onChange={(e) => setV({ ...v, prefixes: e.target.value })} hint="مثلاً: 20, 21, 22" />
              <Input label="عدد أرقام رقم الصنف" inputMode="numeric" value={v.itemDigits} onChange={(e) => setV({ ...v, itemDigits: e.target.value })} />
              <Select label="الباركود فيه" value={v.scaleValue} onChange={(e) => setV({ ...v, scaleValue: e.target.value as "weight" | "price" })}><option value="weight">الوزن (جرام)</option><option value="price">السعر</option></Select>
              {v.scaleValue === "price" && <Select label="السعر في الباركود بـ" value={v.priceMultiplier} onChange={(e) => setV({ ...v, priceMultiplier: e.target.value })}><option value="1">الدرهم (3 أرقام عشرية)</option><option value="10">القرش (رقمين)</option><option value="100">عشر الدينار</option></Select>}
            </div>
            <Input label="اقتراح الشراء يغطي (يوم)" inputMode="numeric" value={v.reorderCoverDays} onChange={(e) => setV({ ...v, reorderCoverDays: e.target.value })} hint="الكمية المقترحة تكفي البيع لكم يوم" />
          </fieldset>
        )}
        {error && <p role="alert" className={errorClass}>{error}</p>}
        <Button type="submit" loading={pending} disabled={!writable}>حفظ</Button>
      </form>
    </CardBody></Card>
  );
}
