"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { formatMoney, inputToDirham } from "@/lib/money";
import { saveTrainerAction } from "../actions";

type T = { id: string; name: string; phone: string | null; specialty: string | null; bio: string | null; hours: string | null; commissionKind: "percent" | "fixed"; commissionValue: number; isActive: boolean };
const blank = { id: "", name: "", phone: "", specialty: "", bio: "", hours: "", kind: "percent" as "percent" | "fixed", value: "" };

export function TrainersManager({ trainers, report, writable }: { trainers: T[]; report: { trainerId: string; sessions: number; commission: number; members: string[] }[]; writable: boolean }) {
  const router = useRouter();
  const act = useAct();
  const [f, setF] = useState(blank);
  return (
    <div className="space-y-5">
      {act.error && <p role="alert" className={errorClass}>{act.error}</p>}
      <Card>
        <ul className="divide-y divide-line text-sm">{trainers.map((x) => {
          const r = report.find((y) => y.trainerId === x.id);
          return (
            <li key={x.id} className="flex flex-wrap items-center gap-2 px-5 py-3"><span className="min-w-0 flex-1"><b>{x.name}</b> <span className="text-muted">{x.specialty ?? ""} · عمولة {x.commissionKind === "percent" ? `${x.commissionValue}%` : formatMoney(x.commissionValue)} للحصة</span>{r && r.sessions > 0 && <span className="block text-xs text-muted">{r.sessions} حصة · {r.members.join("، ")}</span>}</span>
              <b className="tabular-nums">{formatMoney(r?.commission ?? 0)}</b>{!x.isActive && <Badge tone="neutral">متوقف</Badge>}
              {writable && <Button size="sm" variant="outline" onClick={() => setF({ id: x.id, name: x.name, phone: x.phone ?? "", specialty: x.specialty ?? "", bio: x.bio ?? "", hours: x.hours ?? "", kind: x.commissionKind, value: x.commissionKind === "percent" ? String(x.commissionValue) : String(x.commissionValue / 1000) })}>عدّل</Button>}</li>);
        })}{trainers.length === 0 && <li className="px-5 py-4 text-muted">ما فيش مدربين.</li>}</ul>
      </Card>
      {writable && (
        <Card><CardHeader title={f.id ? "تعديل مدرب" : "مدرب جديد"} /><CardBody>
          <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); act.act(() => saveTrainerAction({ id: f.id || undefined, name: f.name, phone: f.phone, specialty: f.specialty, bio: f.bio, hours: f.hours, commissionKind: f.kind, commissionValue: f.kind === "percent" ? Number(f.value) || 0 : inputToDirham(f.value) ?? 0 }), "تم الحفظ", () => { setF(blank); router.refresh(); }); }}>
            <Input label="الاسم" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /><Input label="الهاتف" value={f.phone} dir="ltr" onChange={(e) => setF({ ...f, phone: e.target.value })} /><Input label="التخصص" value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} />
            <Input label="أوقات الدوام" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /><Select label="نوع العمولة" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "percent" | "fixed" })}><option value="percent">نسبة %</option><option value="fixed">مبلغ ثابت للحصة</option></Select>
            <Input label={f.kind === "percent" ? "النسبة %" : "المبلغ (د.ل)"} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
            <div className="sm:col-span-3"><Input label="نبذة (تظهر في الصفحة العامة)" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></div>
            <div className="flex gap-2"><Button type="submit" loading={act.pending}>{f.id ? "احفظ" : "أضف"}</Button>{f.id && <Button type="button" variant="ghost" onClick={() => setF(blank)}>إلغاء</Button>}</div>
          </form></CardBody></Card>
      )}
    </div>
  );
}
