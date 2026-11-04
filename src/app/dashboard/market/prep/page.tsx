import type { Metadata } from "next";
import Link from "next/link";
import { LockedPage } from "@/components/dashboard/locked-page";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { timeAgo } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { marketCan } from "@/server/market/access";
import { prepQueue } from "@/server/market/prep";
import { requireLineContext } from "@/server/store-context";

export const metadata: Metadata = { title: "تجهيز الطلبيات" };

export default async function PrepPage() {
  const ctx = await requireLineContext("market", "orders");
  if (!marketCan(ctx.lines, "onlineOrders")) return <LockedPage feature="onlineOrders" line="market" title="تجهيز الطلبيات" />;
  if (!ctx.lines.store.subscribed) {
    return <div className="space-y-5"><h1 className="text-2xl">تجهيز الطلبيات</h1><Card className="p-5 text-sm">الطلبيات الأونلاين تجي من <b>متجر رُكن</b>. <Link href="/dashboard/lines?add=store" className="text-link-strong underline">فعّل المتجر</Link> باش زباينك يطلبوا من الموبايل وتجهزهم من هنا.</Card></div>;
  }
  const queue = await prepQueue(ctx.scope);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">تجهيز الطلبيات</h1><p className="text-muted">الطلبيات الجديدة والمؤكدة من المتجر الأونلاين. افتح الطلبية، اجمع الأصناف بالمسح، اقترح بديل للناقص، وبعدها «جاهزة» وتمشي للمندوب.</p></div>
      {queue.length === 0 ? <Card className="p-8 text-center text-muted">ما فيش طلبيات تستنى التجهيز. 👌</Card> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {queue.map((o) => (
            <li key={o.id}>
              <Link href={`/dashboard/market/prep/${o.id}`} className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 hover:border-gold">
                <span className="flex items-center justify-between"><b className="text-lg">#{o.number}</b><Badge tone={o.prepStatus === "picking" ? "gold" : "neutral"}>{o.prepStatus === "picking" ? "قيد التجميع" : "جديدة"}</Badge></span>
                <span className="text-sm">{o.customerName} · {o.cityName}</span>
                <span className="text-sm text-muted">{o.items.length} صنف · {o.picked}/{o.units} حبة متجمعة · {formatMoney(o.total)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full bg-success" style={{ width: `${o.units ? Math.round((o.picked / o.units) * 100) : 0}%` }} /></span>
                <span className="text-xs text-muted">{timeAgo(o.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
