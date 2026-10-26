import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { getDb } from "@/db";
import { EmptyState } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/datetime";
import { listStoreActivity } from "@/server/store-audit";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "سجل النشاط" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await requireStoreContext("settings");
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { rows, hasMore } = await listStoreActivity(getDb(), ctx.store.id, page);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">سجل النشاط</h1><p className="text-muted">مين عمل شن ومتى في متجرك.</p></div>
      {rows.length === 0 ? <EmptyState icon={<ScrollText className="size-6" />} title="ما فيه نشاط مسجّل" description="العمليات (تعديل منتج، تغيير حالة طلبية، إضافة موظف…) تظهر هنا." /> : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
              <b>{r.actor}</b><span>{r.label}</span><span className="flex-1" /><time className="text-xs text-muted" dateTime={new Date(r.at).toISOString()}>{formatDateTime(r.at)}</time>
            </li>
          ))}
        </ul>
      )}
      <nav className="flex justify-center gap-3 text-sm" aria-label="الصفحات">
        {page > 1 && <Link href={`?page=${page - 1}`} className="rounded-md border border-line px-3 py-1.5">السابق</Link>}
        {hasMore && <Link href={`?page=${page + 1}`} className="rounded-md border border-line px-3 py-1.5">التالي</Link>}
      </nav>
    </div>
  );
}
