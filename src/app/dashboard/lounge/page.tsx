import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChartColumn, Gamepad2, MonitorSmartphone, Tag, Trophy, Tv } from "lucide-react";
import { LineStatus } from "@/components/dashboard/line-status";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getDb } from "@/db";
import { formatMoney } from "@/lib/money";
import { LINE_INFO } from "@/lib/product-lines";
import { lineSetups } from "@/server/lines";
import { renewLinkFor } from "@/server/lines-view";
import { floorStatus, listBookings } from "@/server/lounge/service";
import { loungeToday } from "@/server/lounge/reports";
import { requireLineContext } from "@/server/store-context";
import { SeedStationsButton } from "./seed-button";

export const metadata: Metadata = { title: "رُكن بلاي" };

const STATUS: Record<string, { label: string; cls: string }> = {
  available: { label: "متاح", cls: "bg-success/15 text-success-fg" }, busy: { label: "شغال", cls: "bg-teal/15" }, paused: { label: "موقوف", cls: "bg-surface-2" },
  ending: { label: "قرب يخلص", cls: "bg-gold/25" }, unpaid: { label: "مش مدفوع", cls: "bg-danger/15 text-danger-fg" }, maintenance: { label: "صيانة", cls: "bg-surface-2 opacity-70" },
};
const TILES = [
  { href: "/pos", icon: MonitorSmartphone, title: "افتح شاشة الصالة", text: "الجلسات بالعداد، البار على نفس الفاتورة، ويشتغل بدون نت." },
  { href: "/dashboard/lounge/stations", icon: Gamepad2, title: "الأجهزة والصيانة", text: "PS5، Xbox، بلياردو… الغرف VIP، الألعاب، والأعطال." },
  { href: "/dashboard/lounge/pricing", icon: Tag, title: "الأسعار والباقات", text: "باليدات والماتش، الصبح والليل، التقريب، وباقات الساعات." },
  { href: "/dashboard/lounge/bookings", icon: CalendarDays, title: "الحجوزات", text: "حجز جهاز بوقت، تأكيد على واتساب، ومهلة تأخير." },
  { href: "/dashboard/lounge/tournaments", icon: Trophy, title: "البطولات", text: "القرعة والنتايج والترتيب، والتسجيل من الصفحة العامة." },
  { href: "/dashboard/lounge/tv", icon: Tv, title: "شاشة الحائط", text: "رابط للتلفزيون: الأجهزة المتاحة والبطولة والعروض." },
  { href: "/dashboard/lounge/reports", icon: ChartColumn, title: "تقارير الصالة", text: "الإشغال والإيراد لكل جهاز، الجلسات مقابل البار." },
];

async function load(ctx: Awaited<ReturnType<typeof requireLineContext>>) {
  const now = Date.now();
  const db = getDb();
  return Promise.all([
    renewLinkFor(db, ctx, "lounge"), floorStatus(ctx.scope, now), loungeToday(ctx.scope, now),
    listBookings(ctx.scope, { from: now - 3_600_000, to: now + 86_400_000 }, now), lineSetups(db, ctx.store.id),
  ]);
}

export default async function LoungeHome() {
  const ctx = await requireLineContext("lounge", "dashboard");
  const [renew, floor, today, bookings, setups] = await load(ctx);
  const setup = setups.lounge?.lounge;
  const upcoming = bookings.filter((b) => b.status === "pending" || b.status === "confirmed");
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">{LINE_INFO.lounge.brand}</h1><p className="text-muted">{LINE_INFO.lounge.description}</p></div>
      <Card><CardBody><LineStatus access={ctx.lines.lounge} renew={renew} /></CardBody></Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["متاح الحين", `${floor.filter((s) => s.status === "available").length} من ${floor.length}`], ["جلسات شغالة", String(floor.filter((s) => ["busy", "paused", "ending"].includes(s.status)).length)],
          ["إيراد اليوم", formatMoney(today.revenue)], ["حجوزات اليوم", String(upcoming.length)]].map(([l, v]) => (
          <Card key={l} className="p-4"><p className="text-sm text-muted">{l}</p><p className="mt-1 text-2xl font-bold tabular-nums">{v}</p></Card>
        ))}
      </div>
      {floor.length === 0 ? (
        <Card><CardBody className="flex flex-wrap items-center justify-between gap-3"><p>ما فيش أجهزة لسه.{setup?.stations?.length ? " نجهزوهم من إعدادك المبدئي؟" : ""}</p>{setup?.stations?.length ? <SeedStationsButton /> : <Link href="/dashboard/lounge/stations" className="text-link-strong underline">ضيف الأجهزة</Link>}</CardBody></Card>
      ) : (
        <Card>
          <CardHeader title="الصالة الحين" />
          <ul className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-4 lg:grid-cols-6">
            {floor.map((s) => <li key={s.id} className={`rounded-xl p-3 text-sm ${STATUS[s.status]?.cls ?? ""}`}><b>{s.name}</b><br />{STATUS[s.status]?.label}{s.remaining !== null ? ` · ${s.remaining} د` : ""}</li>)}
          </ul>
        </Card>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((tile) => (
          <li key={tile.href}><Link href={tile.href} className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 hover:border-gold"><tile.icon className="size-6 text-teal" aria-hidden /><span className="font-semibold">{tile.title}</span><span className="text-sm text-muted">{tile.text}</span></Link></li>
        ))}
      </ul>
      {setup && <Card><CardBody className="text-sm"><p className="font-semibold">إعدادك المبدئي</p><p className="mt-1 text-muted">{setup.stations?.map((x) => `${x.type} × ${x.count}`).join("، ")}{setup.hourlyPrice != null ? ` · سعر الساعة ${formatMoney(setup.hourlyPrice)}` : ""}</p></CardBody></Card>}
    </div>
  );
}
