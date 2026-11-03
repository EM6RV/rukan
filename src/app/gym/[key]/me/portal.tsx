"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarcodeSvg } from "@/components/barcode-svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { daysLeft } from "@/lib/gym";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";

type View = {
  now: number; name: string; qrToken: string;
  current: { planName: string; endsAt: number; status: string; visitsLeft: number | null } | null;
  installments: { amount: number; dueAt: number; paidAt: number | null }[]; checkins: number[];
  measurements: { at: number; weightG: number | null; fatPct10: number | null }[];
  programs: { title: string; content: string; kind: string }[];
  classes: { id: string; name: string; day: string; at: number; left: number; booking: string | null }[];
};

export function Portal({ slug, shop, view }: { slug: string; shop: string; view: View | null }) {
  const router = useRouter();
  const [f, setF] = useState({ phone: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const call = async (body: object) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/gym/portal/${encodeURIComponent(slug)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) setErr(j.error ?? "صار خطأ."); else router.refresh();
    } catch { setErr("ما فيش اتصال."); } finally { setBusy(false); }
  };
  if (!view) {
    return (
      <main className="mx-auto max-w-sm space-y-4 p-5">
        <h1 className="text-2xl">{shop}</h1><p className="text-muted">ادخل لصفحتك الشخصية. كلمة السر تاخذها من الاستقبال.</p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void call({ op: "login", ...f }); }}>
          <Input label="رقم الهاتف" dir="ltr" inputMode="tel" autoComplete="username" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <Input label="كلمة السر" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          {err && <p role="alert" className="text-sm text-danger-fg">{err}</p>}
          <Button type="submit" loading={busy} className="w-full">دخول</Button>
        </form>
      </main>
    );
  }
  const c = view.current, left = c ? daysLeft(c.endsAt, view.now) : null;
  const next = view.installments.find((i) => !i.paidAt);
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex items-center justify-between"><div><p className="text-sm text-muted">{shop}</p><h1 className="text-2xl">أهلاً {view.name}</h1></div><Button variant="ghost" size="sm" onClick={() => void call({ op: "logout" })}>خروج</Button></header>
      {err && <p role="alert" className="text-sm text-danger-fg">{err}</p>}
      <section className="rounded-2xl border border-line bg-surface p-4">
        {c ? <><p className="text-lg font-bold">{c.planName}</p><p className={left! < 0 ? "text-danger-fg" : left! <= 3 ? "text-gold-fg" : "text-success-fg"}>{c.status === "frozen" ? "اشتراكك مجمّد" : left! < 0 ? "اشتراكك انتهى" : `باقي ${left} يوم · ينتهي ${formatDate(c.endsAt)}`}{c.visitsLeft !== null ? ` · ${c.visitsLeft} حصة` : ""}</p></> : <p>ما عندك اشتراك فعال.</p>}
        {next && <p className="mt-2 text-sm">قسطك القادم: <b>{formatMoney(next.amount)}</b> بتاريخ {formatDate(next.dueAt)}</p>}
        <a href={`/gym/${encodeURIComponent(slug)}`} className="mt-3 inline-block text-sm text-link-strong underline">جدّد اشتراكك (واتساب)</a>
      </section>
      <section className="rounded-2xl border border-line bg-white p-4 text-center text-black" style={{ colorScheme: "light" }}><p className="mb-1 text-sm">بطاقتك للدخول</p><BarcodeSvg code={view.qrToken} height={44} className="mx-auto h-16 w-full" /></section>
      <section className="rounded-2xl border border-line bg-surface p-4"><h2 className="mb-2 font-semibold">الحصص القادمة</h2>
        <ul className="divide-y divide-line text-sm">{view.classes.map((k) => <li key={`${k.id}${k.day}`} className="flex items-center gap-2 py-2"><span className="flex-1">{k.name} <span className="text-muted">{formatDateTime(k.at)}</span></span>
          {k.booking ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void call({ op: "cancel", bookingId: k.booking })}>إلغاء حجزي</Button> : <Button size="sm" disabled={busy} onClick={() => void call({ op: "book", classId: k.id, day: k.day })}>{k.left > 0 ? "احجز" : "قائمة انتظار"}</Button>}</li>)}{view.classes.length === 0 && <li className="py-2 text-muted">ما فيش حصص.</li>}</ul></section>
      {view.programs.map((p) => <section key={p.title} className="rounded-2xl border border-line bg-surface p-4"><h2 className="font-semibold">{p.kind === "workout" ? "🏋️" : "🥗"} {p.title}</h2><p className="mt-1 whitespace-pre-line text-sm text-muted">{p.content}</p></section>)}
      {view.measurements.length > 0 && <section className="rounded-2xl border border-line bg-surface p-4"><h2 className="mb-2 font-semibold">قياساتي</h2><ul className="text-sm">{[...view.measurements].reverse().slice(0, 8).map((x) => <li key={x.at} className="flex justify-between py-1"><span>{formatDate(x.at)}</span><span className="tabular-nums">{x.weightG ? `${x.weightG / 1000} كغ` : ""}{x.fatPct10 ? ` · دهون ${x.fatPct10 / 10}%` : ""}</span></li>)}</ul></section>}
      <section className="rounded-2xl border border-line bg-surface p-4"><h2 className="mb-2 font-semibold">آخر حضور</h2><ul className="text-sm text-muted">{view.checkins.slice(0, 10).map((a) => <li key={a}>{formatDateTime(a)}</li>)}{view.checkins.length === 0 && <li>ما فيش.</li>}</ul></section>
    </main>
  );
}
