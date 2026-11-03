"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { formatMoney } from "@/lib/money";

type Props = { slug: string; bookable: boolean; stations: { id: string; name: string }[]; tournaments: { id: string; name: string; game: string | null; fee: number; players: number; max: number; startsAt: string | null }[] };

export function PublicLounge({ slug, bookable, stations, tournaments }: Props) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [b, setB] = useState({ stationId: stations[0]?.id ?? "", name: "", phone: "", when: "", minutes: "60" });
  const [j, setJ] = useState({ tournamentId: tournaments[0]?.id ?? "", name: "", phone: "" });
  const send = async (body: object) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/lounge/public/${encodeURIComponent(slug)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
      setMsg(r.ok ? { ok: true, text: d.message ?? "تم! بنأكد معاك قريب." } : { ok: false, text: d.error ?? "صار خطأ." });
    } catch { setMsg({ ok: false, text: "ما فيش اتصال." }); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-8">
      {msg && <p role="status" className={`rounded-lg px-4 py-3 text-sm ${msg.ok ? "bg-success/10 text-success-fg" : "bg-danger/10 text-danger-fg"}`}>{msg.text}</p>}
      {bookable && stations.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-1 text-xl">احجز جهاز</h2><p className="mb-4 text-sm text-muted">الطلب يستنى تأكيد الصالة.</p>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void send({ op: "book", stationId: b.stationId, name: b.name, phone: b.phone, minutes: Number(b.minutes), startsAt: new Date(`${b.when}:00+02:00`).getTime() }); }}>
            <Select label="الجهاز" value={b.stationId} onChange={(e) => setB({ ...b, stationId: e.target.value })}>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <Select label="المدة" value={b.minutes} onChange={(e) => setB({ ...b, minutes: e.target.value })}>{[30, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m} دقيقة</option>)}</Select>
            <Input label="الاسم" value={b.name} maxLength={60} onChange={(e) => setB({ ...b, name: e.target.value })} />
            <Input label="رقم الهاتف" dir="ltr" inputMode="tel" value={b.phone} maxLength={20} onChange={(e) => setB({ ...b, phone: e.target.value })} />
            <Input label="الموعد (بتوقيت ليبيا)" type="datetime-local" value={b.when} onChange={(e) => setB({ ...b, when: e.target.value })} />
            <div className="flex items-end"><Button type="submit" loading={busy} disabled={!b.when || !b.name || !b.phone} className="w-full">أرسل طلب الحجز</Button></div>
          </form></section>
      )}
      {tournaments.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="mb-3 text-xl">بطولات مفتوحة للتسجيل</h2>
          <ul className="mb-4 divide-y divide-line text-sm">{tournaments.map((x) => <li key={x.id} className="flex flex-wrap justify-between gap-2 py-2"><span><b>{x.name}</b>{x.game ? ` · ${x.game}` : ""}{x.startsAt ? ` · ${x.startsAt}` : ""}</span><span className="text-muted">{x.fee > 0 ? `رسوم ${formatMoney(x.fee)}` : "مجانية"} · {x.players}/{x.max}</span></li>)}</ul>
          <form className="grid gap-3 sm:grid-cols-4 sm:items-end" onSubmit={(e) => { e.preventDefault(); void send({ op: "join", ...j }); }}>
            <Select label="البطولة" value={j.tournamentId} onChange={(e) => setJ({ ...j, tournamentId: e.target.value })}>{tournaments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
            <Input label="الاسم" value={j.name} maxLength={60} onChange={(e) => setJ({ ...j, name: e.target.value })} />
            <Input label="رقم الهاتف" dir="ltr" inputMode="tel" value={j.phone} maxLength={20} onChange={(e) => setJ({ ...j, phone: e.target.value })} />
            <Button type="submit" loading={busy} disabled={!j.name || !j.phone}>سجّلني</Button>
          </form></section>
      )}
    </div>
  );
}
