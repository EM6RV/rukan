import type { Metadata } from "next";
import Link from "next/link";
import { Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { getDb } from "@/db";
import { formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { listShifts } from "@/server/pos/listing";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "الورديات" };

export default async function ShiftsPage() {
  const ctx = await requireStoreContext("reports");
  const shifts = await listShifts(getDb(), ctx.scope);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الورديات</h1><p className="text-muted">كل وردية برصيدها الافتتاحي والمتوقع والمعدود والفرق (عجز أو زيادة)، وتقرير Z.</p></div>
      {shifts.length === 0 ? <EmptyState icon={<Clock3 className="size-6" />} title="ما فيش ورديات" description="الكاشير يفتح وردية من جهازه أول ما يبدا." /> : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {shifts.map((s) => (
            <li key={s.id}>
              <Link href={`/dashboard/shifts/${s.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-surface-2/60">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{s.zNumber ? `Z${s.zNumber}` : "وردية"} · {s.branch} {s.status === "open" ? <Badge tone="success">مفتوحة</Badge> : null}</p>
                  <p className="text-sm text-muted">{formatDateTimeYear(s.openedAt)}{s.closedAt ? ` ← ${formatDateTimeYear(s.closedAt)}` : ""} · {s.openedByName}</p>
                </div>
                {s.difference !== null && <Badge tone={s.difference < 0 ? "danger" : s.difference > 0 ? "success" : "neutral"}>{s.difference < 0 ? "عجز" : s.difference > 0 ? "زيادة" : "مضبوط"} {s.difference ? formatMoney(Math.abs(s.difference)) : ""}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
