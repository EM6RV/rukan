import type { Metadata } from "next";
import Link from "next/link";
import { Search, TriangleAlert, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { listCustomers } from "@/server/orders/customers";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "الزبائن" };
type SP = { q?: string; flag?: string; page?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requireStoreContext("customers");
  const flag = sp.flag === "problematic" || sp.flag === "returns" ? sp.flag : undefined;
  const r = await listCustomers(ctx.scope, { q: sp.q, flag, page: Number(sp.page) || 1 });
  const href = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...over })) if (v) p.set(k, v);
    return `/dashboard/customers${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الزبائن</h1><p className="text-muted">قائمة تتبني تلقائياً من الطلبيات. علّم الزبون المزعج باش تنتبه له.</p></div>
      <nav aria-label="تصفية الزبائن" className="flex flex-wrap gap-2">
        {[{ key: undefined, label: "الكل" }, { key: "problematic", label: "مزعجين" }, { key: "returns", label: "كثير الإرجاع" }].map((t) => (
          <Link key={t.label} href={href({ flag: t.key, page: undefined })} aria-current={flag === t.key ? "page" : undefined} className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium", flag === t.key ? "border-fg/60 bg-surface-2" : "border-line bg-surface text-muted hover:text-fg")}>{t.label}</Link>
        ))}
      </nav>
      <form method="get" action="/dashboard/customers" className="flex gap-2">
        {flag && <input type="hidden" name="flag" value={flag} />}
        <div className="flex-1"><Input name="q" aria-label="بحث" placeholder="ابحث بالاسم أو رقم الهاتف" defaultValue={sp.q ?? ""} /></div>
        <Button type="submit" aria-label="بحث"><Search className="size-5" /></Button>
      </form>
      {r.items.length === 0 ? (
        <EmptyState icon={<Users className="size-6" />} title={sp.q || flag ? "ما لقينا زبائن" : "ما فيش زبائن لسا"} description={sp.q || flag ? "جرّب تغيّر البحث." : "أول طلبية تدخل تضيف زبونها هنا."} />
      ) : (
        <ul className="space-y-2">
          {r.items.map((c) => (
            <li key={c.id}>
              <Link href={`/dashboard/customers/${c.id}`} className="grid gap-1 rounded-xl border border-line bg-surface p-4 shadow-soft transition-colors hover:border-fg/25 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{c.name}{c.flag === "problematic" && <Badge tone="danger"><TriangleAlert className="size-3" aria-hidden /> مزعج</Badge>}{c.returnedCount >= 2 && c.returnedCount * 10 >= c.ordersCount * 3 && <Badge tone="gold">كثير الإرجاع</Badge>}</p>
                  <p dir="ltr" className="text-start text-sm text-muted">{c.phone}</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span>{c.ordersCount} طلبية</span><span className="text-muted">رجّع {c.returnedCount}</span><span className="font-bold">{formatMoney(c.totalSpent)}</span><span className="hidden text-xs text-muted md:inline">منذ {formatDate(c.createdAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {r.pageCount > 1 && (
        <nav aria-label="الصفحات" className="flex items-center justify-center gap-3 text-sm">
          {r.page > 1 && <Link className="rounded-md border border-line px-3 py-2" href={href({ page: String(r.page - 1) })}>السابق</Link>}
          <span className="text-muted">صفحة {r.page} من {r.pageCount} · {r.total} زبون</span>
          {r.page < r.pageCount && <Link className="rounded-md border border-line px-3 py-2" href={href({ page: String(r.page + 1) })}>التالي</Link>}
        </nav>
      )}
    </div>
  );
}
