import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { moduleGate } from "@/components/dashboard/module-gate";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { listInvoices } from "@/server/inventory/purchasing";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "فواتير الشراء" };
const STATUS = { draft: ["مسودة", "neutral"], partial: ["مستلمة جزئياً", "gold"], received: ["مستلمة", "success"], cancelled: ["ملغية", "danger"] } as const;

export default async function PurchasingPage() {
  const ctx = await requireStoreContext("products");
  const gate = moduleGate(ctx, "purchasing");
  if (gate) return gate;
  const invoices = await listInvoices(ctx.scope);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl">فواتير الشراء</h1><p className="text-muted">لما تستلم البضاعة المخزون يزيد ومتوسط التكلفة يتحدث تلقائياً، وعلى أساسه يتحسب ربحك.</p></div>
        <div className="flex gap-2"><ButtonLink href="/dashboard/purchasing/suppliers" variant="outline" size="sm">الموردين</ButtonLink>{ctx.access.writable && <ButtonLink href="/dashboard/purchasing/new" size="sm"><Plus className="size-4" /> فاتورة جديدة</ButtonLink>}</div>
      </div>
      {invoices.length === 0 ? <EmptyState title="ما فيه فواتير شراء" description="سجّل فاتورة شراء من مورد، واستلم البضاعة لما توصل." action={<ButtonLink href="/dashboard/purchasing/new">فاتورة جديدة</ButtonLink>} /> : (
        <ul className="grid gap-2">
          {invoices.map((i) => (
            <li key={i.id}>
              <Link href={`/dashboard/purchasing/${i.id}`}><Card className="flex flex-wrap items-center gap-3 p-4 hover:bg-surface-2/60">
                <b>#{i.number}</b><span>{i.supplier}</span><span className="text-sm text-muted">{i.warehouse} · {formatDate(i.at)}</span><span className="flex-1" />
                <span className="font-bold tabular-nums">{formatMoney(i.total)}</span><Badge tone={STATUS[i.status][1]}>{STATUS[i.status][0]}</Badge>
              </Card></Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
