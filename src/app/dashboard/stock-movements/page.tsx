import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { dateInputToMs } from "@/lib/date-input";
import { formatDateTime } from "@/lib/datetime";
import { listMovements, MOVEMENT_LABELS, MOVEMENT_REASONS } from "@/server/catalog/stock-movements";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "حركة المخزون" };
type SP = { reason?: string; q?: string; from?: string; to?: string; page?: string };

export default async function StockMovementsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStoreContext("products");
  const sp = await searchParams;
  const r = await listMovements(ctx.scope, {
    reason: sp.reason, q: sp.q, page: Number(sp.page) || 1,
    from: sp.from ? dateInputToMs(sp.from, "start") ?? undefined : undefined, to: sp.to ? dateInputToMs(sp.to, "end") ?? undefined : undefined,
  });
  const qs = (p: number) => `?${new URLSearchParams({ ...(sp.reason ? { reason: sp.reason } : {}), ...(sp.q ? { q: sp.q } : {}), ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  const input = "h-10 rounded-md border border-line bg-surface px-3 text-sm";
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">حركة المخزون</h1><p className="text-muted">كل تغيير في المخزون: طلبية، مرتجع، تعديل يدوي، استيراد. ما تتعدلش ولا تنمسح.</p></div>
      <form className="flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={sp.q} placeholder="ابحث باسم المنتج" aria-label="بحث" className={input} />
        <select name="reason" defaultValue={sp.reason ?? ""} aria-label="السبب" className={input}><option value="">كل الأسباب</option>{MOVEMENT_REASONS.map((x) => <option key={x} value={x}>{MOVEMENT_LABELS[x]}</option>)}</select>
        <input type="date" name="from" defaultValue={sp.from} aria-label="من" dir="ltr" className={input} />
        <input type="date" name="to" defaultValue={sp.to} aria-label="إلى" dir="ltr" className={input} />
        <button className="h-10 rounded-md bg-fg px-4 text-sm font-semibold text-bg">تطبيق</button>
      </form>
      {r.rows.length === 0 ? <EmptyState icon={<History className="size-6" />} title="ما فيه حركات" description="حركات المخزون تظهر هنا أول ما يتغير مخزون أي منتج." /> : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-surface-2 text-muted"><tr>{["التاريخ", "المنتج", "التغيير", "السبب", "ملاحظة"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {r.rows.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDateTime(m.at)}</td>
                  <td className="px-3 py-2 font-medium">{m.product}{m.label ? ` — ${m.label}` : ""}</td>
                  <td className="px-3 py-2"><Badge tone={m.delta > 0 ? "success" : "danger"}><bdi dir="ltr">{m.delta > 0 ? `+${m.delta}` : m.delta}</bdi></Badge></td>
                  <td className="px-3 py-2">{MOVEMENT_LABELS[m.reason] ?? m.reason}</td>
                  <td className="px-3 py-2 text-muted">{m.orderId ? <Link href={`/dashboard/orders/${m.orderId}`} className="hover:underline">{m.note ?? "الطلبية"}</Link> : m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.pageCount > 1 && (
        <nav aria-label="الصفحات" className="flex items-center justify-center gap-3 text-sm">
          {r.page > 1 && <Link href={qs(r.page - 1)} className="rounded-md border border-line px-3 py-1.5">السابق</Link>}
          <span className="text-muted">صفحة {r.page} من {r.pageCount} ({r.total} حركة)</span>
          {r.page < r.pageCount && <Link href={qs(r.page + 1)} className="rounded-md border border-line px-3 py-1.5">التالي</Link>}
        </nav>
      )}
    </div>
  );
}
