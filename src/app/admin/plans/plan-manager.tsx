"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Toggle } from "@/components/ui/toggle";
import { approxMonthly, periodUnit, type BillingPeriod } from "@/lib/billing";
import { dirhamToInput, formatMoney, inputToDirham } from "@/lib/money";
import type { PlanLimits } from "@/db/schema/platform";
import { savePlanAction } from "../actions";

type Plan = { id: string; slug: string; nameAr: string; descriptionAr: string | null; billingPeriod: BillingPeriod; price: number; isFeatured: boolean; sortOrder: number; isActive: boolean; limits: PlanLimits };

const FLAGS: { key: keyof Omit<PlanLimits, "maxProducts" | "maxStaff" | "freeDesigns" | "modules">; label: string }[] = [
  { key: "allTemplates", label: "كل القوالب" }, { key: "coupons", label: "الكوبونات" }, { key: "reports", label: "التقارير" },
  { key: "pixels", label: "Pixels" }, { key: "customDomain", label: "دومين خاص" }, { key: "removeBranding", label: "بدون شعار رُكن" },
];
const limitText = (n: number | null, unit: string) => (n === null ? `${unit} غير محدود` : `${n} ${unit}`);

function PlanForm({ initial, onClose }: { initial?: Plan; onClose: () => void }) {
  const [v, setV] = useState({
    slug: initial?.slug ?? "", nameAr: initial?.nameAr ?? "", descriptionAr: initial?.descriptionAr ?? "",
    billingPeriod: (initial?.billingPeriod ?? "monthly") as BillingPeriod, price: dirhamToInput(initial?.price ?? 0) || "0", isFeatured: initial?.isFeatured ?? false, sortOrder: String(initial?.sortOrder ?? 0), isActive: initial?.isActive ?? true,
    maxProducts: initial?.limits.maxProducts === null ? "" : String(initial?.limits.maxProducts ?? 50), maxStaff: initial?.limits.maxStaff === null ? "" : String(initial?.limits.maxStaff ?? 1), freeDesigns: String(initial?.limits.freeDesigns ?? 0),
    flags: { allTemplates: initial?.limits.allTemplates ?? false, coupons: initial?.limits.coupons ?? false, reports: initial?.limits.reports ?? false, pixels: initial?.limits.pixels ?? false, customDomain: initial?.limits.customDomain ?? false, removeBranding: initial?.limits.removeBranding ?? false },
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const { act, pending, error } = useAct();

  function submit() {
    setLocalError(null);
    const price = inputToDirham(v.price);
    if (price == null) return setLocalError("اكتب السعر بالدينار (أرقام)");
    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    act(() => savePlanAction({ id: initial?.id, slug: initial ? undefined : v.slug, nameAr: v.nameAr, descriptionAr: v.descriptionAr, billingPeriod: v.billingPeriod, price, isFeatured: v.isFeatured, sortOrder: Number(v.sortOrder) || 0, isActive: v.isActive, limits: { maxProducts: num(v.maxProducts), maxStaff: num(v.maxStaff), freeDesigns: Number(v.freeDesigns) || 0, ...v.flags } }), "تم حفظ الباقة", onClose);
  }

  return (
    <Modal open onClose={onClose} title={initial ? `تعديل باقة ${initial.nameAr}` : "باقة جديدة"} className="max-w-xl"
      footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={submit}>حفظ</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {!initial && <Input label="الرمز (إنجليزي)" dir="ltr" className="text-right" value={v.slug} maxLength={24} onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase() })} hint="مثال: pro" />}
          <Input label="الاسم" value={v.nameAr} maxLength={30} onChange={(e) => setV({ ...v, nameAr: e.target.value })} />
        </div>
        <Textarea label="وصف قصير" rows={2} maxLength={160} value={v.descriptionAr} onChange={(e) => setV({ ...v, descriptionAr: e.target.value })} />
        <div className="grid grid-cols-3 gap-3">
          <Select label="المدة" value={v.billingPeriod} onChange={(e) => setV({ ...v, billingPeriod: e.target.value as BillingPeriod })}><option value="monthly">شهرية</option><option value="semiannual">ست شهور</option><option value="yearly">سنوية</option></Select>
          <Input label={`السعر (د.ل / ${periodUnit(v.billingPeriod)})`} inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
          <Input label="الترتيب" inputMode="numeric" value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="حد المنتجات" inputMode="numeric" value={v.maxProducts} onChange={(e) => setV({ ...v, maxProducts: e.target.value })} hint="فاضي = غير محدود" />
          <Input label="حد الموظفين" inputMode="numeric" value={v.maxStaff} onChange={(e) => setV({ ...v, maxStaff: e.target.value })} hint="فاضي = غير محدود" />
        </div>
        <Input label="تصاميم مجانية (ريل أو لوجو) في كل فترة اشتراك" inputMode="numeric" value={v.freeDesigns} onChange={(e) => setV({ ...v, freeDesigns: e.target.value })} hint="0 = ما فيه. تتجدد مع كل تجديد للاشتراك" />
        <fieldset className="space-y-3 rounded-lg border border-line p-3"><legend className="px-1 text-sm font-medium">المزايا</legend>
          {FLAGS.map((f) => <Toggle key={f.key} label={f.label} checked={v.flags[f.key]} onChange={(c) => setV({ ...v, flags: { ...v.flags, [f.key]: c } })} />)}
        </fieldset>
        <Toggle label="فعّالة (تظهر في الأسعار)" checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} />
        <Toggle label="الباقة المميزة (شارة «الأكثر طلباً» في صفحة الأسعار)" checked={v.isFeatured} onChange={(isFeatured) => setV({ ...v, isFeatured })} />
        {(localError ?? error) && <p role="alert" className={errorClass}>{localError ?? error}</p>}
      </div>
    </Modal>
  );
}

export function PlanManager({ plans }: { plans: Plan[] }) {
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> باقة جديدة</Button></div>
      <ul className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <li key={p.id}>
            <Card className="h-full space-y-3 p-5">
              <div className="flex items-start justify-between gap-2"><div><h2 className="text-lg">{p.nameAr}</h2><p dir="ltr" className="text-start text-xs text-muted">{p.slug}</p></div><div className="flex gap-1.5">{p.isFeatured && <Badge tone="gold">مميزة</Badge>}{!p.isActive && <Badge>موقوفة</Badge>}</div></div>
              {p.descriptionAr && <p className="text-sm text-muted">{p.descriptionAr}</p>}
              <p className="text-2xl font-bold">{formatMoney(p.price)} <span className="text-sm font-normal text-muted">/ {periodUnit(p.billingPeriod)}</span></p>
              {approxMonthly(p.price, p.billingPeriod) ? <p className="text-sm text-muted">يعني تقريباً {formatMoney(approxMonthly(p.price, p.billingPeriod)!)} في الشهر</p> : null}
              <ul className="space-y-1.5 text-sm">
                <li>{limitText(p.limits.maxProducts, "منتج")}</li><li>{limitText(p.limits.maxStaff, "موظف")}</li>{(p.limits.freeDesigns ?? 0) > 0 && <li className="flex items-center gap-1.5"><Check className="size-4 text-success-fg" aria-hidden />{p.limits.freeDesigns} تصميم مجاني (ريل أو لوجو)</li>}
                {FLAGS.map((f) => <li key={f.key} className={`flex items-center gap-1.5 ${p.limits[f.key] ? "" : "text-muted"}`}>{p.limits[f.key] ? <Check className="size-4 text-success-fg" aria-hidden /> : <X className="size-4" aria-hidden />}{f.label}</li>)}
              </ul>
              <Button variant="outline" size="sm" onClick={() => setEditing(p)}>تعديل</Button>
            </Card>
          </li>
        ))}
      </ul>
      {editing && <PlanForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
