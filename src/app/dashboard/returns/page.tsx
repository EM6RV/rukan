import type { Metadata } from "next";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { RETURN_REASONS, RETURN_REASON_LABELS } from "@/lib/order-flow";
import { listReturns } from "@/server/orders/returns";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "المرتجعات" };

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const ctx = await requireStoreContext("returns");
  const r = await listReturns(ctx.scope, { page: Number(page) || 1 });

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">المرتجعات</h1><p className="text-muted">كل المرتجعات وأسبابها وتكلفة التوصيل اللي ضاعت عليك. لتسجيل مرتجع افتح الطلبية واضغط «تسجيل مرتجع».</p></div>
      {r.total === 0 ? (
        <EmptyState icon={<RotateCcw className="size-6" />} title="ما فيش مرتجعات" description="الحمد لله! لما ترجع طلبية بتظهر هنا." action={<ButtonLink variant="outline" href="/dashboard/orders">عرض الطلبيات</ButtonLink>} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardBody><p className="text-sm text-muted">عدد المرتجعات</p><p className="mt-1 text-2xl font-bold">{r.total}</p></CardBody></Card>
            <Card><CardBody><p className="text-sm text-muted">تكلفة توصيل ضايعة</p><p className="mt-1 text-2xl font-bold">{formatMoney(r.totalShippingLoss)}</p></CardBody></Card>
            <Card><CardBody><p className="mb-1 text-sm text-muted">حسب السبب</p><div className="flex flex-wrap gap-1.5">{RETURN_REASONS.filter((k) => r.byReason[k]).map((k) => <Badge key={k} tone="danger">{RETURN_REASON_LABELS[k]} · {r.byReason[k]}</Badge>)}</div></CardBody></Card>
          </div>
          <ul className="space-y-2">
            {r.items.map((x) => (
              <li key={x.id}>
                <Link href={`/dashboard/orders/${x.orderId}`} className="block rounded-xl border border-line bg-surface p-4 shadow-soft transition-colors hover:border-gold/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold"><span dir="ltr">#{x.orderNumber}</span> · {x.customerName}</p>
                    <Badge tone="danger">{RETURN_REASON_LABELS[x.reason as keyof typeof RETURN_REASON_LABELS] ?? x.reason}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{x.items.map((i) => `${i.name} × ${i.quantity}`).join("، ")}</p>
                  {x.note && <p className="mt-1 text-sm">{x.note}</p>}
                  <p className="mt-1 text-xs text-muted">{formatDateTimeYear(x.createdAt)} · {x.restocked ? "رجع للمخزون" : "ما رجعش للمخزون"}{x.shippingLoss > 0 ? ` · توصيل ضايع ${formatMoney(x.shippingLoss)}` : ""}</p>
                </Link>
              </li>
            ))}
          </ul>
          {r.pageCount > 1 && (
            <nav aria-label="الصفحات" className="flex items-center justify-center gap-3 text-sm">
              {r.page > 1 && <Link className="rounded-md border border-line px-3 py-2" href={`?page=${r.page - 1}`}>السابق</Link>}
              <span className="text-muted">صفحة {r.page} من {r.pageCount}</span>
              {r.page < r.pageCount && <Link className="rounded-md border border-line px-3 py-2" href={`?page=${r.page + 1}`}>التالي</Link>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
