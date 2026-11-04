import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { marketCan } from "@/server/market/access";
import { expiringReport, listWriteoffs, WRITEOFF_REASON_LABELS } from "@/server/market/batches";
import { variantOptions } from "@/server/market/catalog";
import { requireLineContext } from "@/server/store-context";
import { BatchForm, ExpiryRows, WriteoffForm } from "./forms";

export const metadata: Metadata = { title: "الصلاحية والهالك" };
const DAY = 86_400_000;

async function load(ctx: Awaited<ReturnType<typeof requireLineContext>>, days: number, batches: boolean) {
  const now = Date.now();
  return Promise.all([
    batches ? expiringReport(ctx.scope, days, now) : Promise.resolve([]),
    listWriteoffs(ctx.scope, { from: now - 30 * DAY, to: now }),
    variantOptions(ctx.scope),
  ]);
}

export default async function ExpiryPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const ctx = await requireLineContext("market", "products");
  const days = [7, 15, 30].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 15;
  const batches = marketCan(ctx.lines, "batches");
  const [rows, waste, options] = await load(ctx, days, batches);
  const writable = ctx.lines.market.writable;
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الصلاحية والهالك</h1><p className="text-muted">الأصناف اللي صلاحيتها قربت تخلص (من الدفعات: الأقرب انتهاءً يطلع أول)، بخصم مقترح، والإتلاف بتكلفته.</p></div>

      {batches ? (
        <Card>
          <CardHeader title="قربت تخلص" description="الكمية الباقية من كل دفعة حسب المخزون الحالي." action={
            <div className="flex gap-1" role="tablist" aria-label="المدة">{[7, 15, 30].map((d) => <Link key={d} href={`?days=${d}`} role="tab" aria-selected={days === d} className={`rounded-full px-3 py-1.5 text-sm ${days === d ? "bg-fg text-bg" : "border border-line"}`}>{d} يوم</Link>)}</div>
          } />
          <ExpiryRows rows={rows.map((r) => ({ ...r, expires: formatDate(r.expiresAt) }))} writable={writable} />
        </Card>
      ) : (
        <Card className="p-5 text-sm"><b>الصلاحية والدفعات</b> متاحة في باقة «نمو» وأعلى لرُكن ماركت. <Link href="/dashboard/lines?add=market" className="text-link-strong underline">رقّي الباقة</Link></Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <WriteoffForm options={options} writable={writable} />
        {batches && <BatchForm options={options} writable={writable} />}
      </div>

      <Card>
        <CardHeader title="الهالك آخر 30 يوم" description={`الإجمالي بالتكلفة ${formatMoney(waste.total)} · منتهي ${formatMoney(waste.byReason.expired)} · تالف ${formatMoney(waste.byReason.damaged)}`} />
        {waste.items.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش إتلاف مسجل.</p> : (
          <ul className="divide-y divide-line text-sm">{waste.items.map((w) => <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"><span><b>{w.name}</b> × {w.quantity} <span className="text-muted">· {WRITEOFF_REASON_LABELS[w.reason]}{w.note ? ` · ${w.note}` : ""}</span></span><span className="flex gap-3 text-muted"><span>{formatDate(w.at)}</span><b className="text-fg tabular-nums">{formatMoney(w.totalCost)}</b></span></li>)}</ul>
        )}
      </Card>
    </div>
  );
}
