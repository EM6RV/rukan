"use client";

// شاشة الحائط (TV Mode): كبيرة وواضحة من بعيد، تتحدث لحظياً. التوكن في الرابط بعد # (ما يوصلش للسيرفر في الطلب الأول ولا للسجلات)
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { mediaUrl } from "@/lib/media-url";
import type { WallData } from "@/server/lounge/wall";

const STATUS: Record<string, { label: string; cls: string }> = {
  available: { label: "متاح", cls: "bg-[#276B4D]" },
  busy: { label: "شغال", cls: "bg-[#087C86]" },
  paused: { label: "موقوف", cls: "bg-white/20" },
  ending: { label: "قرب يخلص", cls: "bg-[#C19E58] text-[#0D263E]" },
  unpaid: { label: "يحاسب", cls: "bg-[#A8441F]" },
  maintenance: { label: "صيانة", cls: "bg-white/10 opacity-60" },
};
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function WallScreen() {
  const [data, setData] = useState<WallData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("t") ?? new URLSearchParams(window.location.search).get("t") ?? "";
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/lounge/wall?t=${encodeURIComponent(token)}`, { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) setError(j.error ?? "صار خطأ"); else { setData(j); setError(null); }
      } catch { /* النت قطع: نعرضوا آخر بيانات */ }
      if (!stop) setTimeout(load, 5000);
    };
    void load();
    return () => { stop = true; };
  }, []);
  if (error && !data) return <main className="flex min-h-dvh items-center justify-center bg-[#0D263E] p-10 text-center text-3xl text-white">{error}</main>;
  if (!data) return <main className="flex min-h-dvh items-center justify-center bg-[#0D263E] text-3xl text-white" aria-busy="true">جاري التحميل…</main>;
  const tour = data.tournament;
  return (
    <main className="min-h-dvh bg-[#0D263E] p-8 text-white" dir="rtl" style={data.color ? { backgroundColor: data.color } : undefined}>
      <header className="mb-6 flex items-center gap-4">
        {data.logoMediaId && <img src={mediaUrl(data.logoMediaId, 320)} alt="" className="h-16 w-auto rounded-lg bg-white/90 p-1" />}
        <h1 className="flex-1 font-heading text-5xl">{data.shop}</h1>
        <p className="rounded-2xl bg-[#276B4D] px-6 py-3 text-3xl font-bold">{data.available} متاح الحين</p>
      </header>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-4" aria-label="الأجهزة">
          {data.stations.map((s) => {
            const st = STATUS[s.status] ?? STATUS.busy!;
            return (
              <li key={s.id} className={`rounded-3xl p-5 ${st.cls}`}>
                <p className="text-3xl font-bold">{s.name}{s.room === "vip" ? " ⭐" : ""}</p>
                <p className="text-xl opacity-80">{s.kind}</p>
                <p className="mt-3 text-4xl font-extrabold tabular-nums">{s.status === "available" ? "متاح" : s.remaining !== null ? (s.remaining > 0 ? `باقي ${s.remaining} د` : "خلص") : st.label}</p>
              </li>
            );
          })}
        </ul>
        <aside className="space-y-6">
          {tour && (
            <section className="rounded-3xl bg-white/10 p-6">
              <h2 className="text-3xl font-bold">🏆 {tour.name}</h2>
              <p className="text-xl opacity-80">{tour.game} · {tour.status === "registration" ? `التسجيل مفتوح (${tour.players}/${tour.maxPlayers})${tour.entryFee ? ` · ${formatMoney(tour.entryFee)}` : ""}` : tour.status === "finished" ? "انتهت" : "جارية"}</p>
              {tour.champion && <p className="mt-3 text-3xl font-extrabold text-[#C19E58]">البطل: {tour.champion}</p>}
              {tour.table.length > 0 ? (
                <ol className="mt-4 space-y-1 text-2xl">{tour.table.map((r, i) => <li key={r.name} className="flex justify-between"><span>{i + 1}. {r.name}</span><b>{r.points}</b></li>)}</ol>
              ) : (
                <ul className="mt-4 space-y-2 text-2xl">{tour.matches.map((m, i) => <li key={i} className="flex justify-between gap-3"><span>{m.p1}</span><b className="tabular-nums">{m.s1 ?? "-"} : {m.s2 ?? "-"}</b><span>{m.p2}</span></li>)}</ul>
              )}
              {tour.prizes && <p className="mt-3 text-xl opacity-80">الجوائز: {tour.prizes}</p>}
            </section>
          )}
          {data.offers.length > 0 && (
            <section className="rounded-3xl bg-[#C19E58] p-6 text-[#0D263E]">
              <h2 className="text-3xl font-bold">العروض</h2>
              <ul className="mt-3 space-y-2 text-2xl">{data.offers.map((o) => <li key={o.name}>{o.name}{o.kind ? ` (${o.kind})` : ""}: <b>{formatMoney(o.price)}</b> {o.mode === "hour" ? "للساعة" : "للماتش"} · {hhmm(o.from)}–{hhmm(o.to % 1440)}</li>)}</ul>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
