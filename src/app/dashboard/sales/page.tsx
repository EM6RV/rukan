import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { getDb } from "@/db";
import { cn } from "@/lib/cn";
import { formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { listSales } from "@/server/pos/listing";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "فواتير الكاشير" };
const STATUS = { completed: null, partially_returned: "مرتجع جزئي", returned: "مرتجعة" } as const;

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ review?: string; page?: string }> }) {
  const ctx = await requireStoreContext("reports");
  const sp = await searchParams;
  const review = sp.review === "1";
  const r = await listSales(getDb(), ctx.scope, { review, page: Number(sp.page) || 1 });
  const q = (o: { review?: boolean; page?: number }) => { const p = new URLSearchParams(); if (o.review ?? review) p.set("review", "1"); if (o.page && o.page > 1) p.set("page", String(o.page)); return `/dashboard/sales${p.size ? `?${p}` : ""}`; };
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">فواتير الكاشير</h1><p className="text-muted">كل فاتورة من الكاشير أو الصالة أو الاستقبال. «تحتاج مراجعة» = سعر مختلف، مخزون تحت الصفر، خصم بدون موافقة، أو دين فوق الحد.</p></div>
      <nav className="flex gap-2" aria-label="فلتر">
        {[{ l: "الكل", v: false }, { l: "تحتاج مراجعة", v: true }].map((x) => (
          <Link key={x.l} href={q({ review: x.v, page: 1 })} aria-current={review === x.v ? "page" : undefined} className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium", review === x.v ? "border-fg bg-fg text-bg" : "border-line bg-surface text-muted")}>{x.l}</Link>
        ))}
      </nav>
      {r.items.length === 0 ? <EmptyState icon={<ReceiptText className="size-6" />} title="ما فيش فواتير" description="فواتير الكاشير تطلع هنا أول ما الجهاز يتزامن." /> : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {r.items.map((s) => (
            <li key={s.id}>
              <Link href={`/dashboard/sales/${s.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-surface-2/60">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">#{s.number}{s.receiptNo && <span className="text-sm font-normal text-muted" dir="ltr">{s.receiptNo}</span>}{STATUS[s.status] && <Badge tone="danger">{STATUS[s.status]}</Badge>}{s.needsReview && <Badge tone="gold">تحتاج مراجعة</Badge>}</p>
                  <p className="text-sm text-muted">{formatDateTimeYear(s.at)} · {s.branch} · {s.cashier}{s.customer ? ` · ${s.customer}` : ""}</p>
                </div>
                <b className="tabular-nums">{formatMoney(s.total)}</b>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {r.pageCount > 1 && (
        <nav aria-label="الصفحات" className="flex items-center justify-center gap-3 text-sm">
          {r.page > 1 && <Link className="rounded-md border border-line px-3 py-2" href={q({ page: r.page - 1 })}>السابق</Link>}
          <span className="text-muted">صفحة {r.page} من {r.pageCount}</span>
          {r.page < r.pageCount && <Link className="rounded-md border border-line px-3 py-2" href={q({ page: r.page + 1 })}>التالي</Link>}
        </nav>
      )}
    </div>
  );
}
