import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { canUse } from "@/lib/entitlements";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { waLink } from "@/lib/whatsapp";
import { floorStatus, listRates, listTournaments } from "@/server/lounge/service";
import { publicLine } from "@/server/public-line";
import { PublicLounge } from "./public-lounge";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const p = await publicLine(getDb(), decodeURIComponent((await params).key), "lounge");
  return p ? { title: `${p.store.name} — الأجهزة والأسعار`, description: `الأجهزة والأسعار والحجز والبطولات في ${p.store.name}.` } : { title: "غير موجود", robots: { index: false } };
}
const STATUS: Record<string, string> = { available: "متاح", busy: "مشغول", paused: "مشغول", ending: "يخلص قريب", unpaid: "مشغول", maintenance: "صيانة" };

export default async function PlayPublic({ params }: { params: Promise<{ key: string }> }) {
  const p = await publicLine(getDb(), decodeURIComponent((await params).key), "lounge");
  if (!p) notFound();
  const [floor, rates, tours] = await Promise.all([floorStatus(p.scope), listRates(p.scope), listTournaments(p.scope, { publicOnly: true })]);
  const wa = p.contact.whatsapp;
  const hourly = rates.filter((r) => r.isActive && r.mode === "hour" && !r.days?.length && r.fromMinute == null);
  const bookable = canUse(p.limits, "bookings");
  const open = tours.filter((x) => x.status === "registration" && x.publicSignup);
  const games = [...new Set(floor.flatMap((f) => f.games))].slice(0, 30);
  return (
    <div dir="rtl" className="min-h-dvh bg-bg text-fg">
      <header className="bg-navy px-4 py-10 text-center text-white"><h1 className="text-3xl text-white">{p.store.name}</h1>{p.contact.address && <p className="mt-1 text-white/80">{p.contact.address}</p>}</header>
      <main className="mx-auto max-w-4xl space-y-10 px-4 py-10">
        <section><h2 className="mb-4 text-2xl">الأجهزة الحين</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{floor.map((s) => <li key={s.id} className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4"><span><b>{s.name}</b><span className="block text-xs text-muted">{s.kindLabel}{s.room ? ` · ${s.room}` : ""}{s.hourPrice ? ` · ${formatMoney(s.hourPrice)}/ساعة` : ""}</span></span><span className={`rounded-full px-3 py-1 text-xs font-bold ${s.status === "available" ? "bg-success/15 text-success-fg" : s.status === "maintenance" ? "bg-surface-2 text-muted" : "bg-danger/10 text-danger-fg"}`}>{STATUS[s.status]}{s.remaining ? ` · ${s.remaining}د` : ""}</span></li>)}{floor.length === 0 && <li className="text-muted">قريباً.</li>}</ul></section>
        {hourly.length > 0 && <section><h2 className="mb-3 text-2xl">الأسعار</h2><ul className="divide-y divide-line rounded-2xl border border-line bg-surface">{hourly.map((r) => <li key={r.id} className="flex justify-between px-5 py-3"><span>{r.stationKind ?? "كل الأجهزة"}{r.room ? ` · ${r.room}` : ""}{r.controllers ? ` · ${r.controllers} يد` : ""}</span><b className="tabular-nums">{formatMoney(r.price)} / ساعة</b></li>)}</ul></section>}
        {games.length > 0 && <section><h2 className="mb-3 text-2xl">الألعاب</h2><p className="flex flex-wrap gap-2">{games.map((g) => <span key={g} className="rounded-full border border-line bg-surface px-3 py-1 text-sm">{g}</span>)}</p></section>}
        <PublicLounge slug={p.store.slug} bookable={bookable} stations={floor.filter((s) => s.status !== "maintenance").map((s) => ({ id: s.id, name: s.name }))}
          tournaments={open.map((x) => ({ id: x.id, name: x.name, game: x.game, fee: x.entryFee, players: x.players, max: x.maxPlayers, startsAt: x.startsAtMs ? formatDateTime(x.startsAtMs) : null }))} />
        {wa && <p className="text-center"><a href={waLink(wa, `السلام عليكم، استفسار عن ${p.store.name}.`)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-md bg-[#25D366] px-6 font-semibold text-navy">كلّمنا على واتساب</a></p>}
      </main>
    </div>
  );
}
