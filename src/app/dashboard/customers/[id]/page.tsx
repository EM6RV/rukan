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
import { LedgerPanel } from "./ledger-panel";
import { formatDate } from "@/lib/datetime";
import { toWhatsappNumber } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import { balanceOf, customerStatement, LEDGER_KIND_LABELS, statementMessage } from "@/server/pos/customers";
import { OPS_LINES } from "@/lib/product-lines";

export const metadata: Metadata = { title: "بيانات الزبون" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireStoreContext("customers");
  const d = await getCustomerDetail(ctx.scope, id);
  if (!d) notFound();
  const { customer: c, orders } = d;
  // دفتر الدين والمحفظة: يبان لو فيه منظومة تشغيل (كاشير/صالة/نادي) أو حركات
  const showLedger = OPS_LINES.some((l) => ctx.lines[l].subscribed);
  const [bal, statement] = showLedger ? await Promise.all([balanceOf(ctx.scope, c.id), customerStatement(ctx.scope, c.id, "debt", 100)]) : [null, []];
  const wa = toWhatsappNumber(c.phone);
  const statementLink = bal && wa ? waLink(wa, statementMessage({ shopName: ctx.store.name, customerName: c.name, balance: bal.debt, entries: statement.map((e) => ({ at: formatDate(e.at), label: LEDGER_KIND_LABELS[e.kind], amount: e.amount })) }, formatMoney)) : null;

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
      {bal && (
        <LedgerPanel customerId={c.id} balances={bal} creditLimit={c.creditLimit} priceLevel={c.priceLevel} whatsapp={statementLink} writable={ctx.access.writable}
          entries={statement.map((e) => ({ id: e.id, at: formatDate(e.at), label: LEDGER_KIND_LABELS[e.kind], method: e.method, amount: e.amount, balanceAfter: e.balanceAfter, note: e.note }))} />
      )}
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
