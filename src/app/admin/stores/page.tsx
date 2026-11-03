import type { Metadata } from "next";
import Link from "next/link";
import { Search, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/datetime";
import { STATE_LABEL, STATE_TONE } from "@/lib/store-state";
import { getDb } from "@/db";
import { listPlans } from "@/server/admin/plans";
import { STORE_STATE_FILTERS, listStores, type StoreStateFilter } from "@/server/admin/stores";
import { LINE_INFO, PRODUCT_LINES, isProductLine } from "@/lib/product-lines";

export const metadata: Metadata = { title: "النشاطات" };

type SP = { q?: string; state?: string; plan?: string; line?: string; page?: string };

export default async function AdminStores({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const db = getDb();
  const state = STORE_STATE_FILTERS.includes(sp.state as StoreStateFilter) ? (sp.state as StoreStateFilter) : undefined;
  const line = isProductLine(sp.line) ? sp.line : undefined;
  const [r, plans] = await Promise.all([listStores(db, { q: sp.q, state, line, planId: sp.plan || undefined, page: Number(sp.page) || 1 }), listPlans(db)]);
  const href = (over: Partial<SP>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...sp, ...over })) if (v) p.set(k, v); return `/admin/stores${p.size ? `?${p}` : ""}`; };

  return (
    <>
      <div><h1 className="text-2xl">النشاطات</h1><p className="text-muted">{r.total} نشاط{line ? ` في ${LINE_INFO[line].brand}` : ""}</p></div>
      <nav aria-label="المنظومة" className="flex flex-wrap gap-2">
        {[{ k: undefined as string | undefined, l: "كل المنظومات" }, ...PRODUCT_LINES.map((k) => ({ k: k as string | undefined, l: LINE_INFO[k].brand }))].map((t) => (
          <Link key={t.l} href={href({ line: t.k, plan: undefined, page: undefined })} aria-current={line === t.k ? "page" : undefined} className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium", line === t.k ? "border-fg bg-fg text-bg" : "border-line bg-surface text-muted hover:text-fg")}>{t.l}</Link>
        ))}
      </nav>
      <nav aria-label="حالة المتجر" className="flex flex-wrap gap-2">
        {[{ k: undefined, l: "الكل" }, ...STORE_STATE_FILTERS.map((k) => ({ k: k as string | undefined, l: STATE_LABEL[k] }))].map((t) => (
          <Link key={t.l} href={href({ state: t.k, page: undefined })} aria-current={state === t.k ? "page" : undefined} className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium", state === t.k ? "border-fg/60 bg-surface-2" : "border-line bg-surface text-muted hover:text-fg")}>{t.l}</Link>
        ))}
      </nav>
      <form method="get" action="/admin/stores" className="grid gap-3 rounded-xl border border-line bg-surface p-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        {state && <input type="hidden" name="state" value={state} />}
        {line && <input type="hidden" name="line" value={line} />}
        <Input name="q" label="بحث" placeholder="اسم المتجر أو الرابط أو اسم/رقم المالك" defaultValue={sp.q ?? ""} />
        <Select name="plan" label="الباقة" defaultValue={sp.plan ?? ""}><option value="">كل الباقات</option>{plans.filter((p) => !line || p.line === line).map((p) => <option key={p.id} value={p.id}>{line ? p.nameAr : `${LINE_INFO[p.line].brand} · ${p.nameAr}`}</option>)}</Select>
        <Button type="submit"><Search className="size-4" aria-hidden /> بحث</Button>
      </form>

      {r.items.length === 0 ? <EmptyState icon={<Store className="size-6" />} title="ما لقينا متاجر" description="جرّب تغيّر البحث أو الفلتر." /> : (
        <ul className="space-y-2">
          {r.items.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/stores/${s.id}`} className="grid gap-1 rounded-xl border border-line bg-surface p-4 shadow-soft transition-colors hover:border-fg/25 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold"><span className="truncate">{s.name}</span><Badge tone={STATE_TONE[s.state]}>{STATE_LABEL[s.state]}</Badge>{!s.onboarded && <Badge>ما كمّل الإعداد</Badge>}</p>
                  <p className="text-sm text-muted"><span dir="ltr">{s.slug}</span> · {s.ownerName} · <span dir="ltr">{s.ownerPhone}</span></p>
                  {s.lines.length > 0 && <p className="mt-1 flex flex-wrap gap-1.5">{s.lines.map((x) => <Badge key={x.line} tone={STATE_TONE[x.state]}>{LINE_INFO[x.line].brand}: {STATE_LABEL[x.state]}</Badge>)}</p>}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted"><span>{s.planName ?? "بدون باقة"}</span>{s.daysLeft !== null && s.state !== "suspended" && <span>{s.daysLeft > 0 ? `باقي ${s.daysLeft} يوم` : "منتهي"}</span>}<span className="hidden md:inline">{formatDate(s.createdAt)}</span></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {r.pageCount > 1 && (
        <nav aria-label="الصفحات" className="flex items-center justify-center gap-3 text-sm">
          {r.page > 1 && <Link className="rounded-md border border-line px-3 py-2" href={href({ page: String(r.page - 1) })}>السابق</Link>}
          <span className="text-muted">صفحة {r.page} من {r.pageCount}</span>
          {r.page < r.pageCount && <Link className="rounded-md border border-line px-3 py-2" href={href({ page: String(r.page + 1) })}>التالي</Link>}
        </nav>
      )}
    </>
  );
}
