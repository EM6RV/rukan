"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import type { GymConfig, Section } from "@/lib/gym";
import { SECTION_LABELS } from "@/lib/gym";
import { formatMoney, inputToDirham } from "@/lib/money";
import { saveGymConfigAction, savePlanAction } from "../actions";

type Plan = { id: string; name: string; kind: "duration" | "visits" | "day"; days: number; visits: number | null; price: number; joinFee: number; section: Section; fromMinute: number | null; toMinute: number | null; maxFreezeDays: number; familySize: number; isActive: boolean };
const hm = (m: number | null) => (m === null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
const toMin = (s: string) => (s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);
const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const blank = { id: "", name: "", kind: "duration" as Plan["kind"], days: "30", visits: "", price: "", joinFee: "", section: "mixed" as Section, from: "", to: "", freeze: "0", family: "0" };

export function PlansManager({ plans, cfg, writable }: { plans: Plan[]; cfg: GymConfig; writable: boolean }) {
  const router = useRouter();
  const act = useAct();
  const [f, setF] = useState(blank);
  const [c, setC] = useState({ ...cfg, wf: hm(cfg.womenHours[0]?.fromMinute ?? null), wt: hm(cfg.womenHours[0]?.toMinute ?? null), wd: cfg.womenHours[0]?.days ?? [] as number[] });
  const edit = (p: Plan) => setF({ id: p.id, name: p.name, kind: p.kind, days: String(p.days), visits: p.visits ? String(p.visits) : "", price: String(p.price / 1000), joinFee: p.joinFee ? String(p.joinFee / 1000) : "", section: p.section, from: hm(p.fromMinute), to: hm(p.toMinute), freeze: String(p.maxFreezeDays), family: String(p.familySize) });
  const save = (p: Partial<Plan> & { id: string }) => { const o = plans.find((x) => x.id === p.id)!; return act.act(() => savePlanAction({ ...o, ...p }), "تم الحفظ", () => router.refresh()); };
  return (
    <div className="space-y-5">
      {act.error && <p role="alert" className={errorClass}>{act.error}</p>}
      <Card>
        <CardHeader title="أنواع الاشتراك" />
        <ul className="divide-y divide-line text-sm">{plans.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 px-5 py-3"><span className="min-w-0 flex-1"><b>{p.name}</b> <span className="text-muted">· {p.kind === "visits" ? `${p.visits} حصة / ${p.days} يوم` : p.kind === "day" ? "دخول يوم" : `${p.days} يوم`} · {SECTION_LABELS[p.section]}{p.fromMinute !== null ? ` · ${hm(p.fromMinute)}–${hm(p.toMinute)}` : ""}{p.familySize ? ` · عايلة +${p.familySize}` : ""}</span></span>
            <b className="tabular-nums">{formatMoney(p.price)}</b>{!p.isActive && <Badge tone="neutral">مخفي</Badge>}
            {writable && <><Button size="sm" variant="outline" onClick={() => edit(p)}>عدّل</Button><Button size="sm" variant="ghost" onClick={() => save({ id: p.id, isActive: !p.isActive })}>{p.isActive ? "اخفِ" : "أظهر"}</Button></>}</li>))}
          {plans.length === 0 && <li className="px-5 py-4 text-muted">ما فيش أنواع. ضيف أول نوع من تحت.</li>}</ul>
      </Card>
      {writable && (
        <Card>
          <CardHeader title={f.id ? "تعديل نوع" : "نوع جديد"} />
          <CardBody>
            <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); act.act(() => savePlanAction({ id: f.id || undefined, name: f.name, kind: f.kind, days: Number(f.days) || 1, visits: f.visits ? Number(f.visits) : null, price: inputToDirham(f.price) ?? -1, joinFee: inputToDirham(f.joinFee) ?? 0, section: f.section, fromMinute: toMin(f.from), toMinute: toMin(f.to), maxFreezeDays: Number(f.freeze) || 0, familySize: Number(f.family) || 0 }), "تم الحفظ", () => { setF(blank); router.refresh(); }); }}>
              <Input label="الاسم" value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <Select label="النوع" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Plan["kind"] })}><option value="duration">مدة (شهري…)</option><option value="visits">عدد حصص</option><option value="day">دخول يوم</option></Select>
              <Select label="القسم" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value as Section })}>{(Object.keys(SECTION_LABELS) as Section[]).map((s) => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}</Select>
              <Input label="المدة (أيام)" inputMode="numeric" value={f.days} disabled={f.kind === "day"} onChange={(e) => setF({ ...f, days: e.target.value.replace(/\D/g, "") })} />
              {f.kind === "visits" && <Input label="عدد الحصص" inputMode="numeric" value={f.visits} onChange={(e) => setF({ ...f, visits: e.target.value.replace(/\D/g, "") })} />}
              <Input label="السعر (د.ل)" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
              <Input label="رسوم التسجيل (د.ل)" inputMode="decimal" value={f.joinFee} onChange={(e) => setF({ ...f, joinFee: e.target.value })} />
              <Input label="أيام التجميد المسموحة" inputMode="numeric" value={f.freeze} onChange={(e) => setF({ ...f, freeze: e.target.value.replace(/\D/g, "") })} />
              <Input label="عايلة: عدد التابعين" inputMode="numeric" value={f.family} onChange={(e) => setF({ ...f, family: e.target.value.replace(/\D/g, "") })} />
              <Input label="من وقت (اختياري)" type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
              <Input label="إلى وقت" type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
              <div className="flex items-end gap-2"><Button type="submit" loading={act.pending}>{f.id ? "احفظ" : "أضف"}</Button>{f.id && <Button type="button" variant="ghost" onClick={() => setF(blank)}>إلغاء</Button>}</div>
            </form>
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title="قواعد الدخول" description="ساعات النساء تنطبق على الأقسام المختلطة." />
        <CardBody>
          <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const wm = toMin(c.wf), wt = toMin(c.wt); act.act(() => saveGymConfigAction({ antiPassbackHours: c.antiPassbackHours, installmentGraceDays: c.installmentGraceDays, expiryNoticeDays: c.expiryNoticeDays, absentDays: c.absentDays, autoCheckout: c.autoCheckout, womenHours: wm !== null && wt !== null ? [{ days: c.wd, fromMinute: wm, toMinute: wt }] : [] }), "تم حفظ الإعدادات", () => router.refresh()); }}>
            <Input label="منع تكرار الدخول (ساعات، 0 = مطفي)" inputMode="numeric" value={String(c.antiPassbackHours)} onChange={(e) => setC({ ...c, antiPassbackHours: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            <Input label="مهلة القسط المتأخر (أيام)" inputMode="numeric" value={String(c.installmentGraceDays)} onChange={(e) => setC({ ...c, installmentGraceDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            <Input label="تنبيه الانتهاء قبل (أيام)" inputMode="numeric" value={String(c.expiryNoticeDays)} onChange={(e) => setC({ ...c, expiryNoticeDays: Number(e.target.value.replace(/\D/g, "")) || 1 })} />
            <Input label="رسالة غياب بعد (أيام)" inputMode="numeric" value={String(c.absentDays)} onChange={(e) => setC({ ...c, absentDays: Number(e.target.value.replace(/\D/g, "")) || 3 })} />
            <Input label="ساعات النساء من" type="time" value={c.wf} onChange={(e) => setC({ ...c, wf: e.target.value })} />
            <Input label="إلى" type="time" value={c.wt} onChange={(e) => setC({ ...c, wt: e.target.value })} />
            <fieldset className="sm:col-span-3"><legend className="mb-1 text-sm">أيام ساعات النساء (فاضي = كل يوم)</legend><div className="flex flex-wrap gap-3">{DAYS.map((d, i) => <label key={d} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4" checked={c.wd.includes(i)} onChange={(e) => setC({ ...c, wd: e.target.checked ? [...c.wd, i] : c.wd.filter((x) => x !== i) })} />{d}</label>)}</div></fieldset>
            {writable && <Button type="submit" loading={act.pending}>احفظ القواعد</Button>}
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
