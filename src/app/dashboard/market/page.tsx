import type { Metadata } from "next";
import Link from "next/link";
import { BadgePercent, Barcode, CalendarClock, ChartColumn, ClipboardCheck, ListOrdered, MonitorSmartphone, PackageCheck } from "lucide-react";
import { LineStatus } from "@/components/dashboard/line-status";
import { Card, CardBody } from "@/components/ui/card";
import { getDb } from "@/db";
import { formatMoney } from "@/lib/money";
import { LINE_INFO } from "@/lib/product-lines";
import { lineSetups } from "@/server/lines";
import { renewLinkFor } from "@/server/lines-view";
import { marketCan } from "@/server/market/access";
import { prepCounts } from "@/server/market/prep";
import { libyaDayStart, marketAlerts, marketReport } from "@/server/market/reports";
import { requireLineContext } from "@/server/store-context";
import { GroceryCategoriesButton } from "./grocery-button";

export const metadata: Metadata = { title: "رُكن ماركت" };

const TILES = [
  { href: "/pos", icon: MonitorSmartphone, title: "افتح الكاشير", text: "البيع بالباركود والميزان، ويشتغل بدون نت." },
  { href: "/dashboard/market/products", icon: Barcode, title: "الباركود والوحدات", text: "باركودات، كرتونة وحبة، أسعار الجملة، الموزون، الملصقات." },
  { href: "/dashboard/market/expiry", icon: CalendarClock, title: "الصلاحية والهالك", text: "اللي قرب يخلص بخصم مقترح، والإتلاف بتكلفته." },
  { href: "/dashboard/market/promotions", icon: BadgePercent, title: "العروض", text: "اشتري وخذ، الحبة الثانية، ساعة سعيدة، سعر الباقة." },
  { href: "/dashboard/market/purchase", icon: ListOrdered, title: "اقتراح الشراء", text: "الناقص حسب البيع، وطلب للمورد على واتساب." },
  { href: "/dashboard/market/stocktake", icon: ClipboardCheck, title: "الجرد بالمسح", text: "بالقارئ أو الكاميرا، وأكثر من عدّاد مع بعض." },
  { href: "/dashboard/market/prep", icon: PackageCheck, title: "تجهيز الطلبيات", text: "طلبيات المتجر الأونلاين: تجميع بالمسح وبدائل." },
  { href: "/dashboard/market/reports", icon: ChartColumn, title: "تقارير الماركت", text: "الربح، الكاشير، الأقسام، الذروة، الراكد." },
];

async function load(ctx: Awaited<ReturnType<typeof requireLineContext>>) {
  const now = Date.now();
  const online = marketCan(ctx.lines, "onlineOrders") && ctx.lines.store.subscribed;
  return Promise.all([
    renewLinkFor(getDb(), ctx, "market"),
    marketReport(ctx.scope, { from: libyaDayStart(now), to: now }, { names: new Map(), advanced: false }),
    marketAlerts(ctx.scope, now),
    online ? prepCounts(ctx.scope) : Promise.resolve(null),
    lineSetups(getDb(), ctx.store.id).then((x) => x.market?.market ?? null),
  ]);
}

export default async function MarketHome() {
  const ctx = await requireLineContext("market", "dashboard");
  const [renew, today, alerts, prep, setup] = await load(ctx);
  const kpis = [
    { label: "مبيعات اليوم", value: formatMoney(today.totals.revenue), sub: `${today.totals.invoices} فاتورة` },
    { label: "ربح اليوم", value: formatMoney(today.totals.profit), sub: today.totals.margin === null ? "سجّل التكلفة للمنتجات" : `هامش ${Math.round(today.totals.margin * 100)}%` },
    { label: "قرب يخلص", value: String(alerts.low), sub: "صنف تحت الحد", href: "/dashboard/market/purchase" },
    { label: "صلاحيته قريبة", value: String(alerts.expiringSoon), sub: "خلال 7 أيام", href: "/dashboard/market/expiry" },
    ...(prep !== null ? [{ label: "طلبيات للتجهيز", value: String(prep), sub: "من المتجر الأونلاين", href: "/dashboard/market/prep" }] : []),
  ];
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">{LINE_INFO.market.brand}</h1><p className="text-muted">{LINE_INFO.market.description}</p></div>
      <Card><CardBody><LineStatus access={ctx.lines.market} renew={renew} /></CardBody></Card>
      <div className={`grid grid-cols-2 gap-3 ${kpis.length > 4 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {kpis.map((k) => {
          const body = <><p className="text-sm text-muted">{k.label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{k.value}</p><p className="text-xs text-muted">{k.sub}</p></>;
          return "href" in k && k.href ? <Link key={k.label} href={k.href} className="rounded-2xl border border-line bg-surface p-4 hover:border-gold">{body}</Link> : <Card key={k.label} className="p-4">{body}</Card>;
        })}
      </div>
      {today.totals.needsReview > 0 && <Link href="/dashboard/sales?review=1" className="block rounded-xl bg-gold/15 px-4 py-3 text-sm font-medium">{today.totals.needsReview} فاتورة اليوم تحتاج مراجعة (سعر تغيّر، مخزون تحت الصفر، عرض…)</Link>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.filter((tile) => tile.href !== "/dashboard/market/prep" || ctx.lines.store.subscribed).map((tile) => (
          <li key={tile.href}>
            <Link href={tile.href} className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-gold">
              <tile.icon className="size-6 text-teal" aria-hidden />
              <span className="font-semibold">{tile.title}</span>
              <span className="text-sm text-muted">{tile.text}</span>
            </Link>
          </li>
        ))}
      </ul>
      {setup && (
        <Card>
          <CardBody className="text-sm">
            <p className="font-semibold">إعدادك المبدئي</p>
            <p className="mt-1 text-muted">المحل: <b className="text-fg">{setup.shopName}</b> · الكاشيرات: <b className="text-fg">{setup.registers}</b>{setup.wholesale ? " · يبيع جملة" : ""}{setup.scale ? " · عنده ميزان (اضبط الباركود من إعدادات الكاشير)" : ""}</p>
          </CardBody>
        </Card>
      )}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold">أقسام البقالة الجاهزة</p><p className="text-sm text-muted">خضار وفواكه، ألبان، معلبات، منظفات… تتضاف الناقصة بس.</p></div>
          <GroceryCategoriesButton disabled={!ctx.lines.market.writable} />
        </CardBody>
      </Card>
    </div>
  );
}
