import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { canUse } from "@/lib/entitlements";
import { SECTION_LABELS } from "@/lib/gym";
import { formatMoney } from "@/lib/money";
import { waLink } from "@/lib/whatsapp";
import { gymConfigOf, listClasses, listPlans, listTrainers } from "@/server/gym/service";
import { publicLine } from "@/server/public-line";
import { TrialForm } from "./trial-form";

export const dynamic = "force-dynamic";
const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const p = await publicLine(getDb(), decodeURIComponent((await params).key), "gym");
  return p ? { title: `${p.store.name} — الاشتراكات والحصص`, description: `أنواع الاشتراك والحصص والمدربين في ${p.store.name}.` } : { title: "غير موجود", robots: { index: false } };
}

export default async function GymPublic({ params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const p = await publicLine(getDb(), key, "gym");
  if (!p) notFound();
  const [plans, classes, trainers, cfg] = await Promise.all([listPlans(p.scope), listClasses(p.scope), listTrainers(p.scope), gymConfigOf(p.scope)]);
  const wa = p.contact.whatsapp;
  const showClasses = canUse(p.limits, "classes"), showTrainers = canUse(p.limits, "trainers");
  return (
    <div dir="rtl" className="min-h-dvh bg-bg text-fg">
      <header className="bg-navy px-4 py-10 text-center text-white"><h1 className="text-3xl text-white">{p.store.name}</h1>{p.contact.address && <p className="mt-1 text-white/80">{p.contact.address}</p>}</header>
      <main className="mx-auto max-w-4xl space-y-10 px-4 py-10">
        <section aria-labelledby="plans"><h2 id="plans" className="mb-4 text-2xl">الاشتراكات</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{plans.filter((x) => x.isActive).map((x) => (
            <li key={x.id} className="flex flex-col rounded-2xl border border-line bg-surface p-5"><h3 className="text-lg font-bold">{x.name}</h3>
              <p className="mt-1 text-sm text-muted">{x.kind === "visits" ? `${x.visits} حصة خلال ${x.days} يوم` : x.kind === "day" ? "دخول يوم" : `${x.days} يوم`} · {SECTION_LABELS[x.section]}{x.fromMinute !== null ? ` · ${hm(x.fromMinute)}–${hm(x.toMinute!)}` : ""}</p>
              <p className="mt-3 text-3xl font-bold tabular-nums">{formatMoney(x.price)}</p>
              {x.joinFee > 0 && <p className="text-xs text-muted">+ رسوم تسجيل {formatMoney(x.joinFee)}</p>}
              <div className="flex-1" />
              {wa && <a href={waLink(wa, `السلام عليكم، نبي نشترك في «${x.name}» في ${p.store.name}.`)} target="_blank" rel="noopener noreferrer" className="mt-4 flex h-11 items-center justify-center rounded-md bg-gold font-semibold text-navy">اشترك الحين عبر واتساب</a>}</li>))}
            {plans.length === 0 && <li className="text-muted">الأسعار قريباً.</li>}</ul></section>
        {cfg.womenHours.length > 0 && <section><h2 className="mb-2 text-2xl">ساعات النساء</h2><ul className="space-y-1 text-muted">{cfg.womenHours.map((w, i) => <li key={i}>{w.days.length ? w.days.map((d) => DAYS[d]).join("، ") : "كل يوم"} · من {hm(w.fromMinute)} إلى {hm(w.toMinute)}</li>)}</ul></section>}
        {showClasses && classes.some((c) => c.isActive) && <section><h2 className="mb-4 text-2xl">جدول الحصص</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">{classes.filter((c) => c.isActive).map((c) => <li key={c.id} className="flex flex-wrap justify-between gap-2 px-5 py-3"><span><b>{c.name}</b> <span className="text-muted">· {SECTION_LABELS[c.section]}{c.trainerId ? ` · ${trainers.find((x) => x.id === c.trainerId)?.name ?? ""}` : ""}</span></span><span className="text-muted">{DAYS[c.weekday]} {hm(c.startMinute)}</span></li>)}</ul>
          <p className="mt-2 text-sm text-muted">الحجز من صفحة العضو الشخصية.</p></section>}
        {showTrainers && trainers.some((x) => x.isActive) && <section><h2 className="mb-4 text-2xl">المدربين</h2>
          <ul className="grid gap-4 sm:grid-cols-2">{trainers.filter((x) => x.isActive).map((x) => <li key={x.id} className="rounded-2xl border border-line bg-surface p-5"><h3 className="font-bold">{x.name}</h3>{x.specialty && <p className="text-sm text-link-strong">{x.specialty}</p>}{x.bio && <p className="mt-1 text-sm text-muted">{x.bio}</p>}{x.hours && <p className="mt-1 text-xs text-muted">الدوام: {x.hours}</p>}</li>)}</ul></section>}
        <section className="rounded-2xl border border-gold/40 bg-gold/10 p-6"><h2 className="mb-1 text-xl">تبي تجرّب زيارة؟</h2><p className="mb-4 text-sm text-muted">اكتب اسمك ورقمك وبنتواصل معاك على واتساب لتحديد موعد زيارة تجريبية.</p>{wa ? <TrialForm wa={wa} shop={p.store.name} /> : <p className="text-muted">كلّمنا مباشرة{p.contact.phone ? `: ${p.contact.phone}` : ""}.</p>}</section>
        {canUse(p.limits, "memberPortal") && <p className="text-center"><Link href={`/gym/${encodeURIComponent(p.store.slug)}/me`} className="font-semibold text-link-strong underline">دخول الأعضاء: صفحتي الشخصية</Link></p>}
      </main>
    </div>
  );
}
