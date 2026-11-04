"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { formatDateTime } from "@/lib/datetime";
import { SECTION_LABELS, type Section } from "@/lib/gym";
import { attendanceAction, bookClassAction, cancelBookingAction, deleteClassAction, saveClassAction } from "../actions";
import { findMemberByPhoneAction } from "../lookup";

type C = { id: string; name: string; trainerId: string | null; room: string | null; weekday: number; startMinute: number; durationMin: number; capacity: number; section: Section; cancelBeforeMin: number; isActive: boolean };
const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const blank = { id: "", name: "", trainerId: "", room: "", weekday: "6", time: "18:00", dur: "60", cap: "15", section: "mixed" as Section, cancel: "120" };

export function ClassesManager(p: { classes: C[]; trainers: { id: string; name: string }[]; upcoming: { id: string; name: string; day: string; at: number; capacity: number; booked: number; waitlist: number; trainer: string | null }[]; rosters: Record<string, { id: string; memberId: string; name: string; phone: string; status: string }[]>; writable: boolean }) {
  const router = useRouter();
  const act = useAct();
  const [f, setF] = useState(blank);
  const [open, setOpen] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const done = () => router.refresh();
  return (
    <div className="space-y-5">
      {act.error && <p role="alert" className={errorClass}>{act.error}</p>}
      <Card><CardHeader title="الحصص القادمة" />
        <ul className="divide-y divide-line text-sm">{p.upcoming.map((u) => {
          const k = `${u.id}|${u.day}`, r = p.rosters[k] ?? [];
          return (
            <li key={k} className="px-5 py-3"><div className="flex flex-wrap items-center gap-2"><button className="min-w-0 flex-1 text-start" onClick={() => setOpen(open === k ? null : k)}><b>{u.name}</b> <span className="text-muted">{formatDateTime(u.at)}{u.trainer ? ` · ${u.trainer}` : ""}</span></button><Badge tone={u.booked >= u.capacity ? "danger" : "teal"}>{u.booked}/{u.capacity}</Badge>{u.waitlist > 0 && <Badge tone="gold">انتظار {u.waitlist}</Badge>}</div>
              {open === k && (
                <div className="mt-3 space-y-2">
                  <ul className="divide-y divide-line rounded-lg border border-line">{r.map((b) => <li key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2"><span className="flex-1">{b.name} <span className="text-muted" dir="ltr">{b.phone}</span></span><Badge tone={b.status === "attended" ? "success" : b.status === "waitlist" ? "gold" : "neutral"}>{b.status === "attended" ? "حضر" : b.status === "waitlist" ? "انتظار" : b.status === "no_show" ? "غاب" : "محجوز"}</Badge>{p.writable && <><Button size="sm" variant="outline" onClick={() => act.act(() => attendanceAction(b.id, true), "تم", done)}>حضر</Button><Button size="sm" variant="ghost" onClick={() => act.act(() => attendanceAction(b.id, false), "تم", done)}>غاب</Button><Button size="sm" variant="ghost" onClick={() => act.act(() => cancelBookingAction(b.id), "تم الإلغاء", done)}>إلغاء</Button></>}</li>)}{r.length === 0 && <li className="px-3 py-2 text-muted">ما فيش حجوزات.</li>}</ul>
                  {p.writable && <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act.act(async () => { const m = await findMemberByPhoneAction(phone); if (!m.ok) return m; return bookClassAction(u.id, m.data.id, u.day); }, "تم الحجز", () => { setPhone(""); done(); }); }}><Input label="احجز لعضو برقمه" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /><Button type="submit" loading={act.pending}>احجز</Button></form>}
                </div>
              )}</li>);
        })}{p.upcoming.length === 0 && <li className="px-5 py-4 text-muted">ما فيش حصص قادمة.</li>}</ul></Card>
      <Card><CardHeader title="الجدول الأسبوعي" />
        <ul className="divide-y divide-line text-sm">{p.classes.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-2 px-5 py-3"><span className="flex-1"><b>{c.name}</b> <span className="text-muted">{DAYS[c.weekday]} {hm(c.startMinute)} · {c.durationMin}د · {c.capacity} مكان · {SECTION_LABELS[c.section]}{c.trainerId ? ` · ${p.trainers.find((t) => t.id === c.trainerId)?.name ?? ""}` : ""}</span></span>{!c.isActive && <Badge tone="neutral">متوقفة</Badge>}
          {p.writable && <><Button size="sm" variant="outline" onClick={() => setF({ id: c.id, name: c.name, trainerId: c.trainerId ?? "", room: c.room ?? "", weekday: String(c.weekday), time: hm(c.startMinute), dur: String(c.durationMin), cap: String(c.capacity), section: c.section, cancel: String(c.cancelBeforeMin) })}>عدّل</Button><Button size="sm" variant="ghost" className="text-danger-fg" onClick={() => { if (confirm("نحذفو الحصة وحجوزاتها؟")) act.act(() => deleteClassAction(c.id), "تم الحذف", done); }}>حذف</Button></>}</li>)}{p.classes.length === 0 && <li className="px-5 py-4 text-muted">ما فيش حصص.</li>}</ul></Card>
      {p.writable && <Card><CardHeader title={f.id ? "تعديل حصة" : "حصة جديدة"} /><CardBody>
        <form className="grid gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); act.act(() => saveClassAction({ id: f.id || undefined, name: f.name, trainerId: f.trainerId || null, room: f.room, weekday: Number(f.weekday), startMinute: Number(f.time.slice(0, 2)) * 60 + Number(f.time.slice(3, 5)), durationMin: Number(f.dur) || 60, capacity: Number(f.cap) || 1, section: f.section, cancelBeforeMin: Number(f.cancel) || 0 }), "تم الحفظ", () => { setF(blank); done(); }); }}>
          <Input label="الاسم" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Select label="اليوم" value={f.weekday} onChange={(e) => setF({ ...f, weekday: e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select>
          <Input label="الوقت" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /><Input label="المدة (دقيقة)" inputMode="numeric" value={f.dur} onChange={(e) => setF({ ...f, dur: e.target.value.replace(/\D/g, "") })} />
          <Input label="السعة" inputMode="numeric" value={f.cap} onChange={(e) => setF({ ...f, cap: e.target.value.replace(/\D/g, "") })} />
          <Select label="المدرب" value={f.trainerId} onChange={(e) => setF({ ...f, trainerId: e.target.value })}><option value="">—</option>{p.trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          <Select label="القسم" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value as Section })}>{(Object.keys(SECTION_LABELS) as Section[]).map((s) => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}</Select>
          <Input label="الإلغاء قبل (دقيقة)" inputMode="numeric" value={f.cancel} onChange={(e) => setF({ ...f, cancel: e.target.value.replace(/\D/g, "") })} />
          <div className="flex gap-2"><Button type="submit" loading={act.pending}>{f.id ? "احفظ" : "أضف"}</Button>{f.id && <Button type="button" variant="ghost" onClick={() => setF(blank)}>إلغاء</Button>}</div>
        </form></CardBody></Card>}
    </div>
  );
}
