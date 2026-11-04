import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChartColumn, MessageCircle, MonitorSmartphone, ScanLine, Tag, UserRound, Users } from "lucide-react";
import { LineStatus } from "@/components/dashboard/line-status";
import { Card, CardBody } from "@/components/ui/card";
import { getDb } from "@/db";
import { formatMoney } from "@/lib/money";
import { LINE_INFO } from "@/lib/product-lines";
import { gymReport } from "@/server/gym/reports";
import { insideCount, listMembers, listPlans } from "@/server/gym/service";
import { todayMessages } from "@/server/gym/messages";
import { lineSetups } from "@/server/lines";
import { renewLinkFor } from "@/server/lines-view";
import { requireLineContext } from "@/server/store-context";
import { SeedPlansButton } from "./seed-button";

export const metadata: Metadata = { title: "رُكن فِت" };
const DAY = 86_400_000;
const TILES = [
  { href: "/dashboard/gym/reception", icon: ScanLine, title: "الاستقبال", text: "دخول بالـ QR أو الهاتف، وعدّاد الموجودين." },
  { href: "/dashboard/gym/members", icon: Users, title: "الأعضاء", text: "التسجيل، الاشتراك، التجميد، الأقساط." },
  { href: "/dashboard/gym/plans", icon: Tag, title: "الاشتراكات والإعدادات", text: "الأنواع والأسعار، ساعات النساء، مهلة الأقساط." },
  { href: "/dashboard/gym/classes", icon: CalendarDays, title: "الحصص", text: "الجدول الأسبوعي والحجز وقائمة الانتظار." },
  { href: "/dashboard/gym/trainers", icon: UserRound, title: "المدربين", text: "الملفات وحصص PT والعمولة." },
  { href: "/dashboard/gym/messages", icon: MessageCircle, title: "رسائل اليوم", text: "واتساب بضغطة: تجديد، قسط، غياب، ميلاد." },
  { href: "/dashboard/gym/reports", icon: ChartColumn, title: "تقارير النادي", text: "العضويات، الإيرادات، الحضور، العمولات." },
  { href: "/pos", icon: MonitorSmartphone, title: "كاشير النادي", text: "مكملات ومشروبات على حساب العضو أو كاش." },
];

async function load(ctx: Awaited<ReturnType<typeof requireLineContext>>) {
  const now = Date.now();
  const db = getDb();
  return Promise.all([renewLinkFor(db, ctx, "gym"), gymReport(ctx.scope, { from: now - 30 * DAY, to: now }, now), insideCount(ctx.scope, now), listMembers(ctx.scope, { filter: "expiring", now }), todayMessages(ctx.scope, ctx.store.name, now), listPlans(ctx.scope), lineSetups(db, ctx.store.id), listMembers(ctx.scope, { limit: 1 })]);
}

export default async function GymHome() {
  const ctx = await requireLineContext("gym", "dashboard");
  const [renew, rep, inside, expiring, msgs, plans, setups, first] = await load(ctx);
  const max = ctx.lines.gym.limits?.maxMembers ?? null;
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">{LINE_INFO.gym.brand}</h1><p className="text-muted">{LINE_INFO.gym.description}</p></div>
      <Card><CardBody><LineStatus access={ctx.lines.gym} renew={renew} /></CardBody></Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[["داخل النادي الحين", String(inside)], ["الأعضاء النشطين", max === null ? String(rep.members.active) : `${rep.members.active} من ${max}`], ["يخلص قريب", String(expiring.length)], ["أقساط متأخرة", formatMoney(rep.revenue.installmentsLate)], ["رسائل اليوم", String(msgs.length)]].map(([l, v]) => <Card key={l} className="p-4"><p className="text-sm text-muted">{l}</p><p className="mt-1 text-2xl font-bold tabular-nums">{v}</p></Card>)}
      </div>
      {plans.length === 0 && setups.gym?.gym?.membershipTypes?.length ? <Card><CardBody className="flex flex-wrap items-center justify-between gap-3"><p>ما فيش أنواع اشتراكات. نجهزوها من إعدادك المبدئي؟</p><SeedPlansButton /></CardBody></Card> : null}
      {first.length === 0 && <Card><CardBody className="text-sm">ما سجلتش أعضاء لسه. <Link href="/dashboard/gym/members" className="text-link-strong underline">سجّل أول عضو</Link></CardBody></Card>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((x) => <li key={x.href}><Link href={x.href} className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 hover:border-gold"><x.icon className="size-6 text-teal" aria-hidden /><span className="font-semibold">{x.title}</span><span className="text-sm text-muted">{x.text}</span></Link></li>)}
      </ul>
    </div>
  );
}
