import type { Metadata } from "next";
import { Download, Truck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatMoney } from "@/lib/money";
import { listCouriers } from "@/server/orders/couriers";
import { requireStoreContext } from "@/server/store-context";
import { CourierList } from "./courier-manager";

export const metadata: Metadata = { title: "المندوبون والكاش" };

export default async function CouriersPage() {
  const ctx = await requireStoreContext("couriers");
  const couriers = await listCouriers(ctx.scope);
  const totalCash = couriers.reduce((s, c) => s + c.balance, 0);
  const pendingCash = couriers.reduce((s, c) => s + c.pendingCash, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl">المندوبون والكاش</h1><p className="text-muted">كم كاش عند كل مندوب وشركة توصيل، وسجّل لما يسلّمك الفلوس.</p></div>
        {couriers.length > 0 && <ButtonLink variant="outline" size="sm" href="/dashboard/couriers/export"><Download className="size-4" aria-hidden /> تقرير المستحقات</ButtonLink>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardBody><p className="text-sm text-muted">كاش عند المندوبين (مستحق لك)</p><p className="mt-1 text-2xl font-bold">{formatMoney(totalCash)}</p></CardBody></Card>
        <Card><CardBody><p className="text-sm text-muted">طلبيات لسا في الطريق (كاش متوقع)</p><p className="mt-1 text-2xl font-bold">{formatMoney(pendingCash)}</p></CardBody></Card>
      </div>
      {couriers.length === 0 ? (
        <>
          <EmptyState icon={<Truck className="size-6" />} title="ما أضفتش مندوبين لسا" description="أضف مندوباتك وشركات التوصيل باش تقدر تسلّمهم الطلبيات وتتابع الكاش اللي عندهم." />
          <CourierList couriers={[]} writable={ctx.access.writable} />
        </>
      ) : (
        <CourierList couriers={couriers} writable={ctx.access.writable} />
      )}
    </div>
  );
}
