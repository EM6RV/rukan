"use client";

import { useState } from "react";
import { Pencil, Plus, Wrench } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { formatDate } from "@/lib/datetime";
import { STATION_KIND_LABELS, STATION_KINDS, type StationKind } from "@/lib/line-setup";
import { formatMoney, inputToDirham } from "@/lib/money";
import { closeMaintenanceAction, openMaintenanceAction, saveStationAction } from "../actions";

type Station = { id: string; name: string; kind: StationKind; room: "normal" | "vip"; seats: number; screen: string | null; color: string | null; games: string[]; status: string; isActive: boolean; issues: { id: string; issue: string; cost: number }[] };
type Log = { id: string; station: string; issue: string; cost: number; status: string; at: number };

export function StationsManager({ stations, log, writable }: { stations: Station[]; log: Log[]; writable: boolean }) {
  const [edit, setEdit] = useState<Station | "new" | null>(null);
  const [fix, setFix] = useState<Station | null>(null);
  const act = useAct();
  return (
    <div className="space-y-4">
      {writable && !edit && <Button onClick={() => setEdit("new")}><Plus className="size-4" /> جهاز جديد</Button>}
      {edit && <StationForm initial={edit === "new" ? null : edit} onDone={() => setEdit(null)} />}
      {fix && <FixForm station={fix} onDone={() => setFix(null)} />}
      {act.error && <p role="alert" className={errorClass}>{act.error}</p>}
      <Card>
        <CardHeader title={`الأجهزة (${stations.filter((s) => s.isActive).length})`} />
        {stations.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش أجهزة.</p> : (
          <ul className="divide-y divide-line">
            {stations.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="size-3 rounded-full" style={{ backgroundColor: s.color ?? "#087C86" }} aria-hidden />
                <span className="min-w-0 flex-1"><b>{s.name}</b> {s.room === "vip" && <Badge tone="gold">VIP</Badge>} {!s.isActive && <Badge>موقوف</Badge>} {s.status === "maintenance" && <Badge tone="danger">صيانة</Badge>}<br />
                  <span className="text-muted">{STATION_KIND_LABELS[s.kind]} · {s.seats} كراسي{s.screen ? ` · ${s.screen}` : ""}{s.games.length ? ` · ${s.games.slice(0, 4).join("، ")}${s.games.length > 4 ? "…" : ""}` : ""}</span></span>
                {s.issues.map((m) => writable && <Button key={m.id} size="sm" variant="outline" onClick={() => { const c = prompt(`تكلفة إصلاح «${m.issue}» (د.ل)`, String(m.cost / 1000)); if (c === null) return; act.act(() => closeMaintenanceAction(m.id, inputToDirham(c) ?? null), "تم إصلاح الجهاز"); }}>تصلّح: {m.issue}</Button>)}
                {writable && <Button size="sm" variant="ghost" aria-label={`عطل في ${s.name}`} onClick={() => setFix(s)}><Wrench className="size-4" /></Button>}
                {writable && <Button size="sm" variant="ghost" aria-label={`تعديل ${s.name}`} onClick={() => setEdit(s)}><Pencil className="size-4" /></Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="سجل الصيانة" description={`التكلفة الكلية ${formatMoney(log.reduce((a, m) => a + m.cost, 0))}`} />
        {log.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش أعطال مسجلة.</p> : <ul className="divide-y divide-line text-sm">{log.map((m) => <li key={m.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5"><span><b>{m.station}</b> · {m.issue}</span><span className="flex gap-3 text-muted"><span>{formatDate(m.at)}</span><Badge tone={m.status === "open" ? "danger" : "success"}>{m.status === "open" ? "مفتوح" : "تصلّح"}</Badge><b className="text-fg tabular-nums">{formatMoney(m.cost)}</b></span></li>)}</ul>}
      </Card>
    </div>
  );
}

function StationForm({ initial, onDone }: { initial: Station | null; onDone: () => void }) {
  const [v, setV] = useState({ name: initial?.name ?? "", kind: initial?.kind ?? "ps5", room: initial?.room ?? "normal", seats: String(initial?.seats ?? 2), screen: initial?.screen ?? "", color: initial?.color ?? "#087C86", games: initial?.games.join("، ") ?? "", isActive: initial?.isActive ?? true });
  const { act, pending, error } = useAct();
  return (
    <Card>
      <CardHeader title={initial ? `تعديل ${initial.name}` : "جهاز جديد"} />
      <CardBody>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); act(() => saveStationAction({ id: initial?.id, name: v.name, kind: v.kind, room: v.room, seats: Number(v.seats) || 2, screen: v.screen, color: v.color, games: v.games.split(/[,،\n]+/).map((g) => g.trim()).filter(Boolean), isActive: v.isActive }), "تم الحفظ", onDone); }}>
          <Input label="الاسم" value={v.name} maxLength={40} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="PS5 1" />
          <Select label="النوع" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as StationKind })}>{STATION_KINDS.map((k) => <option key={k} value={k}>{STATION_KIND_LABELS[k]}</option>)}</Select>
          <Select label="الغرفة" value={v.room} onChange={(e) => setV({ ...v, room: e.target.value as "normal" | "vip" })}><option value="normal">عادية</option><option value="vip">VIP</option></Select>
          <Input label="الكراسي" inputMode="numeric" value={v.seats} onChange={(e) => setV({ ...v, seats: e.target.value.replace(/\D/g, "") })} />
          <Input label="الشاشة" value={v.screen} maxLength={40} onChange={(e) => setV({ ...v, screen: e.target.value })} placeholder='55" 4K' />
          <Input label="اللون" type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="h-11 p-1" />
          <div className="sm:col-span-2 lg:col-span-3"><Input label="الألعاب (افصلها بفاصلة)" value={v.games} onChange={(e) => setV({ ...v, games: e.target.value })} placeholder="FC 26، eFootball، Call of Duty" /></div>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> الجهاز شغّال في الصالة</label>
          {error && <p role="alert" className={`${errorClass} sm:col-span-2 lg:col-span-3`}>{error}</p>}
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3"><Button type="submit" loading={pending}>حفظ</Button><Button type="button" variant="ghost" onClick={onDone}>رجوع</Button></div>
        </form>
      </CardBody>
    </Card>
  );
}

function FixForm({ station, onDone }: { station: Station; onDone: () => void }) {
  const [issue, setIssue] = useState("");
  const [cost, setCost] = useState("");
  const { act, pending, error } = useAct();
  return (
    <Card>
      <CardHeader title={`عطل في ${station.name}`} description="الجهاز يتحول «صيانة» لين يتصلّح." />
      <CardBody>
        <form className="grid gap-3 sm:grid-cols-3 sm:items-end" onSubmit={(e) => { e.preventDefault(); act(() => openMaintenanceAction({ stationId: station.id, issue, cost: inputToDirham(cost) ?? 0 }), "تم تسجيل العطل", onDone); }}>
          <Input label="العطل" value={issue} maxLength={200} onChange={(e) => setIssue(e.target.value)} placeholder="يد بايظة، شاشة، كابلات…" />
          <Input label="التكلفة (د.ل)" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          <div className="flex gap-2"><Button type="submit" variant="danger" loading={pending}>سجّل العطل</Button><Button type="button" variant="ghost" onClick={onDone}>رجوع</Button></div>
          {error && <p role="alert" className={`${errorClass} sm:col-span-3`}>{error}</p>}
        </form>
      </CardBody>
    </Card>
  );
}
