import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { getDb } from "@/db";
import { users } from "@/db/schema/platform";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { getLedger, listCouriers } from "@/server/orders/couriers";
import { requireStoreContext } from "@/server/store-context";
import { CashActions, CashBalance, CashScope, DeleteCourier } from "../courier-manager";

export const metadata: Metadata = { title: "كشف حساب المندوب" };

const TYPE = { collected: ["تحصيل طلبية", "teal"], settlement: ["استلام فلوس", "success"], adjustment: ["تعديل", "gold"] } as const;

export default async function CourierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const [{ id }, { page }] = await Promise.all([params, searchParams]);
  const ctx = await requireStoreContext("couriers");
  const courier = (await listCouriers(ctx.scope)).find((c) => c.id === id);
  if (!courier) notFound();
  const ledger = await getLedger(ctx.scope, id, Number(page) || 1);
  const actorIds = [...new Set(ledger.entries.map((e) => e.actorUserId).filter((x): x is string => !!x))];
  const actors = actorIds.length ? await getDb().select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds)) : [];

  return (
    <div className="space-y-5">
      <Link href="/dashboard/couriers" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronRight className="size-4" aria-hidden /> كل المندوبين</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl">{courier.name}{!courier.isActive && <Badge>موقوف</Badge>}</h1>{courier.phone && <p dir="ltr" className="text-start text-muted">{courier.phone}</p>}</div>
        <DeleteCourier id={courier.id} name={courier.name} redirectTo="/dashboard/couriers" />
      </div>
      <CashScope balance={courier.balance}><Card><CardBody className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-muted">فلوسك عنده الحين</p><CashBalance className="text-3xl font-bold" /><p className="text-sm text-muted">وفي الطريق {courier.pendingOrders} طلبية ({formatMoney(courier.pendingCash)})</p></div>
        <CashActions courier={courier} writable={ctx.access.writable} />
      </CardBody></Card></CashScope>
      <Card>
        <CardHeader title="كشف الحساب" />
        {ledger.entries.length === 0 ? <CardBody className="text-center text-muted">ما فيش حركات لسا.</CardBody> : (
          <ul className="divide-y divide-line">
            {ledger.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2"><Badge tone={TYPE[e.type][1]}>{TYPE[e.type][0]}</Badge>{e.orderNumber && <Link href="/dashboard/orders" className="text-link" dir="ltr">#{e.orderNumber}</Link>}</p>
                  {e.note && <p>{e.note}</p>}
                  <p className="text-xs text-muted">{formatDateTimeYear(e.createdAt)}{e.actorUserId ? ` · ${actors.find((a) => a.id === e.actorUserId)?.name ?? "موظف"}` : ""}</p>
                </div>
                <span className={`shrink-0 font-bold ${(e.type === "settlement" ? -e.amount : e.amount) < 0 ? "text-success-fg" : ""}`} dir="ltr">{(e.type === "settlement" ? -e.amount : e.amount) < 0 ? "−" : "+"}{formatMoney(Math.abs(e.amount))}</span>
              </li>
            ))}
          </ul>
        )}
        {ledger.pageCount > 1 && (
          <nav aria-label="الصفحات" className="flex items-center justify-center gap-3 border-t border-line p-3 text-sm">
            {ledger.page > 1 && <Link className="rounded-md border border-line px-3 py-1.5" href={`?page=${ledger.page - 1}`}>السابق</Link>}
            <span className="text-muted">صفحة {ledger.page} من {ledger.pageCount}</span>
            {ledger.page < ledger.pageCount && <Link className="rounded-md border border-line px-3 py-1.5" href={`?page=${ledger.page + 1}`}>التالي</Link>}
          </nav>
        )}
      </Card>
    </div>
  );
}
