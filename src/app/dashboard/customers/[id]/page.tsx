import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { OrderStatusBadge } from "@/components/dashboard/order-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { getCustomerDetail } from "@/server/orders/customers";
import { requireStoreContext } from "@/server/store-context";
import { FlagForm } from "./flag-form";

export const metadata: Metadata = { title: "بيانات الزبون" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireStoreContext("customers");
  const d = await getCustomerDetail(ctx.scope, id);
  if (!d) notFound();
  const { customer: c, orders } = d;

  return (
    <div className="space-y-5">
      <Link href="/dashboard/customers" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronRight className="size-4" aria-hidden /> كل الزبائن</Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl">{c.name}{c.flag === "problematic" && <Badge tone="danger"><TriangleAlert className="size-3" aria-hidden /> مزعج</Badge>}</h1>
        <a dir="ltr" href={`tel:${c.phone}`} className="text-link">{c.phone}</a>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["الطلبيات", String(c.ordersCount)], ["تم التوصيل", String(c.deliveredCount)], ["مرتجعة", String(c.returnedCount)], ["إجمالي الشراء", formatMoney(c.totalSpent)]].map(([l, v]) => (
          <Card key={l}><CardBody className="p-4"><p className="text-sm text-muted">{l}</p><p className="mt-1 text-xl font-bold">{v}</p></CardBody></Card>
        ))}
      </div>
      <Card><CardBody><FlagForm id={c.id} flag={c.flag} notes={c.notes ?? ""} writable={ctx.access.writable} /></CardBody></Card>
      <Card>
        <CardHeader title="طلبياته" />
        <ul className="divide-y divide-line">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/dashboard/orders/${o.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-surface-2/60">
                <div className="space-y-1"><p className="flex items-center gap-2 font-medium"><span dir="ltr">#{o.number}</span><OrderStatusBadge status={o.status} /></p><p className="text-xs text-muted">{formatDateTimeYear(o.createdAt)} · {o.cityName}</p></div>
                <span className="font-bold">{formatMoney(o.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
