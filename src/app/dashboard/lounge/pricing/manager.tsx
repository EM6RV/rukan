"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { STATION_KIND_LABELS, STATION_KINDS, type StationKind } from "@/lib/line-setup";
import { formatMoney, inputToDirham } from "@/lib/money";
import { deleteRateAction, savePackAction, saveRateAction, saveRulesAction } from "../actions";

type Rate = { id: string; name: string; mode: "hour" | "match"; stationKind: StationKind | null; room: "normal" | "vip" | null; controllers: number | null; price: number; days: number[]; fromMinute: number; toMinute: number; priority: number; isActive: boolean };
type Pack = { id: string; name: string; minutes: number; price: number; isActive: boolean };
type Rules = { roundTo: 0 | 5 | 10 | 15; minMinutes: number; startFee: number; bookingGrace: number };
const DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (v: string) => { const [a, b] = v.split(":").map(Number); return (a ?? 0) * 60 + (b ?? 0); };

export function PricingManager({ rates, packs, rules, hourPacks, writable }: { rates: Rate[]; packs: Pack[]; rules: Rules; hourPacks: boolean; writable: boolean }) {
  const [edit, setEdit] = useState<Rate | "new" | null>(null);
  const act = useAct();
  const describe = (r: Rate) => [r.stationKind ? STATION_KIND_LABELS[r.stationKind] : "كل الأجهزة", r.room === "vip" ? "VIP" : r.room === "normal" ? "عادية" : null, r.controllers ? `${r.controllers} يد` : null,
    r.days.length ? r.days.map((d) => DAYS[d]).join("، ") : null, r.fromMinute !== 0 || r.toMinute !== 1440 ? `${hhmm(r.fromMinute)}–${hhmm(r.toMinute)}` : null].filter(Boolean).join(" · ");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="الأسعار" description="مثال: ساعة زوجي، ساعة 4 يدات، الماتش، الليل أغلى، Happy Hour." action={writable && !edit ? <Button size="sm" onClick={() => setEdit("new")}><Plus className="size-4" /> سعر</Button> : undefined} />
        {edit && <CardBody><RateForm initial={edit === "new" ? null : edit} onDone={() => setEdit(null)} /></CardBody>}
        {rates.length === 0 ? <p className="px-5 pb-5 text-sm text-danger-fg">ما فيش أسعار: الجلسات تتحسب صفر. ضيف سعر الساعة أول.</p> : (
          <ul className="divide-y divide-line text-sm">{rates.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="min-w-0 flex-1"><b>{r.name}</b> {!r.isActive && <Badge>موقوف</Badge>}<br /><span className="text-muted">{describe(r)}</span></span>
              <b className="tabular-nums">{formatMoney(r.price)} {r.mode === "hour" ? "/ساعة" : "/ماتش"}</b>
              {writable && <><Button size="sm" variant="ghost" aria-label={`تعديل ${r.name}`} onClick={() => setEdit(r)}><Pencil className="size-4" /></Button><Button size="sm" variant="ghost" aria-label={`حذف ${r.name}`} onClick={() => { if (confirm(`نحذفوا «${r.name}»؟`)) act.act(() => deleteRateAction(r.id), "تم الحذف"); }}><Trash2 className="size-4" /></Button></>}
            </li>
          ))}</ul>
        )}
      </Card>
      <RulesForm rules={rules} writable={writable} />
      <PacksCard packs={packs} enabled={hourPacks} writable={writable} />
      {act.error && <p role="alert" className={errorClass}>{act.error}</p>}
    </div>
  );
}

function RateForm({ initial, onDone }: { initial: Rate | null; onDone: () => void }) {
  const [v, setV] = useState({ name: initial?.name ?? "", mode: initial?.mode ?? "hour", kind: initial?.stationKind ?? "", room: initial?.room ?? "", controllers: initial?.controllers ? String(initial.controllers) : "", price: initial ? String(initial.price / 1000) : "", days: initial?.days ?? [], from: hhmm(initial?.fromMinute ?? 0), to: hhmm(initial?.toMinute ?? 1440), active: initial?.isActive ?? true });
  const { act, pending, error } = useAct();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(() => saveRateAction({ id: initial?.id, name: v.name, mode: v.mode, stationKind: v.kind || null, room: v.room || null, controllers: v.controllers ? Number(v.controllers) : null, price: inputToDirham(v.price) ?? -1, days: v.days, fromMinute: toMin(v.from), toMinute: v.to === "00:00" ? 1440 : toMin(v.to), isActive: v.active }), "تم حفظ السعر", onDone); }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="الاسم" value={v.name} maxLength={40} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="ساعة زوجي" />
        <Select label="الحساب" value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value as "hour" | "match" })}><option value="hour">بالساعة</option><option value="match">بالماتش</option></Select>
        <Input label={v.mode === "hour" ? "سعر الساعة (د.ل)" : "سعر الماتش (د.ل)"} inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
        <Select label="نوع الجهاز" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as StationKind | "" })}><option value="">الكل</option>{STATION_KINDS.map((k) => <option key={k} value={k}>{STATION_KIND_LABELS[k]}</option>)}</Select>
        <Select label="الغرفة" value={v.room} onChange={(e) => setV({ ...v, room: e.target.value as "" | "normal" | "vip" })}><option value="">الكل</option><option value="normal">عادية</option><option value="vip">VIP</option></Select>
        <Select label="عدد اليدات" value={v.controllers} onChange={(e) => setV({ ...v, controllers: e.target.value })}><option value="">أي عدد</option><option value="1">فردي</option><option value="2">زوجي</option><option value="4">4 يدات</option></Select>
        <Input label="من الساعة" type="time" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} />
        <Input label="للساعة" type="time" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} />
      </div>
      <fieldset><legend className="mb-1.5 text-sm font-medium">الأيام (فاضي = كل يوم)</legend>
        <div className="flex flex-wrap gap-2">{DAYS.map((d, i) => <label key={d} className={`flex h-10 cursor-pointer items-center rounded-md border px-3 text-sm ${v.days.includes(i) ? "border-gold bg-gold/15" : "border-line"}`}><input type="checkbox" className="sr-only" checked={v.days.includes(i)} onChange={() => setV({ ...v, days: v.days.includes(i) ? v.days.filter((x) => x !== i) : [...v.days, i] })} />{d}</label>)}</div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> شغّال</label>
      {error && <p role="alert" className={errorClass}>{error}</p>}
      <div className="flex gap-2"><Button type="submit" loading={pending}>حفظ</Button><Button type="button" variant="ghost" onClick={onDone}>رجوع</Button></div>
    </form>
  );
}

function RulesForm({ rules, writable }: { rules: Rules; writable: boolean }) {
  const [v, setV] = useState({ roundTo: String(rules.roundTo), minMinutes: String(rules.minMinutes), startFee: String(rules.startFee / 1000), grace: String(rules.bookingGrace) });
  const { act, pending, error } = useAct();
  return (
    <Card>
      <CardHeader title="قواعد الحساب" />
      <CardBody>
        <form className="grid gap-3 sm:grid-cols-4 sm:items-end" onSubmit={(e) => { e.preventDefault(); act(() => saveRulesAction({ roundTo: Number(v.roundTo), minMinutes: Number(v.minMinutes) || 0, startFee: inputToDirham(v.startFee) ?? 0, bookingGrace: Number(v.grace) || 0 }), "تم الحفظ"); }}>
          <Select label="التقريب لأعلى كل" value={v.roundTo} onChange={(e) => setV({ ...v, roundTo: e.target.value })}><option value="0">بالدقيقة</option><option value="5">5 دقايق</option><option value="10">10 دقايق</option><option value="15">15 دقيقة</option></Select>
          <Input label="أقل مدة (دقيقة)" inputMode="numeric" value={v.minMinutes} onChange={(e) => setV({ ...v, minMinutes: e.target.value })} />
          <Input label="رسوم بداية الجلسة (د.ل)" inputMode="decimal" value={v.startFee} onChange={(e) => setV({ ...v, startFee: e.target.value })} />
          <Input label="مهلة تأخير الحجز (دقيقة)" inputMode="numeric" value={v.grace} onChange={(e) => setV({ ...v, grace: e.target.value })} />
          {error && <p role="alert" className={`${errorClass} sm:col-span-4`}>{error}</p>}
          <Button type="submit" loading={pending} disabled={!writable}>حفظ القواعد</Button>
        </form>
      </CardBody>
    </Card>
  );
}

function PacksCard({ packs, enabled, writable }: { packs: Pack[]; enabled: boolean; writable: boolean }) {
  const [v, setV] = useState({ name: "", hours: "10", price: "" });
  const { act, pending, error } = useAct();
  return (
    <Card>
      <CardHeader title="باقات الساعات" description={enabled ? "تتباع من شاشة الصالة وتتشحن في رصيد دقايق الزبون، والجلسة تتدفع منها." : "باقات الساعات متاحة في باقة «نمو» وأعلى لرُكن بلاي."} />
      <CardBody className="space-y-3">
        {packs.length > 0 && <ul className="divide-y divide-line rounded-lg border border-line text-sm">{packs.map((p) => <li key={p.id} className="flex justify-between px-3 py-2"><span>{p.name} · {Math.round(p.minutes / 60)} ساعة</span><b className="tabular-nums">{formatMoney(p.price)}</b></li>)}</ul>}
        {enabled && writable && (
          <form className="grid gap-3 sm:grid-cols-4 sm:items-end" onSubmit={(e) => { e.preventDefault(); act(() => savePackAction({ name: v.name, minutes: Math.round((Number(v.hours) || 0) * 60), price: inputToDirham(v.price) ?? -1 }), "تمت إضافة الباقة", () => setV({ name: "", hours: "10", price: "" })); }}>
            <Input label="اسم الباقة" value={v.name} maxLength={40} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="10 ساعات" />
            <Input label="الساعات" inputMode="decimal" value={v.hours} onChange={(e) => setV({ ...v, hours: e.target.value })} />
            <Input label="السعر (د.ل)" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
            <Button type="submit" loading={pending}>زيد الباقة</Button>
          </form>
        )}
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </CardBody>
    </Card>
  );
}
