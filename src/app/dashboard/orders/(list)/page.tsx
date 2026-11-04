import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Search } from "lucide-react";
import { getDb } from "@/db";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/feedback";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { getDeliveryConfig } from "@/server/delivery-service";
import { courierRestriction } from "@/server/orders/access";
import { listCouriers } from "@/server/orders/couriers";
import { listOrders } from "@/server/orders/manage";
import { TZ_OFFSET_MS } from "@/server/orders/stats";
import { requireStoreContext } from "@/server/store-context";
import { PushToggle } from "@/components/dashboard/push-toggle";
import { pushConfig } from "@/server/push";
import { OrderTable } from "../order-table";
import { CourierOrders } from "./courier-orders";

export const metadata: Metadata = { title: "الطلبيات" };

type SP = Record<string, string | undefined>;
const DAY = 86_400_000;
const dayStart = (d: string | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(`${d}T00:00:00Z`) - TZ_OFFSET_MS : undefined);

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requireStoreContext("orders");
  const restrict = await courierRestriction(ctx);
  const isCourier = ctx.role === "courier";

  const status = ORDER_STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : undefined;
  const from = dayStart(sp.from);
  const toStart = dayStart(sp.to);
  const filters = {
    status, q: sp.q, cityId: sp.city, courierId: sp.courier, payment: sp.pay === "cod" || sp.pay === "bank_transfer" ? sp.pay : undefined,
    from, to: toStart !== undefined ? toStart + DAY - 1 : undefined, page: Number(sp.page) || 1, restrictCourierId: restrict, maxOrdersPerMonth: ctx.limits.maxOrdersPerMonth,
  } as const;
  const [result, couriers, delivery] = await Promise.all([
    listOrders(ctx.scope, filters),
    listCouriers(ctx.scope),
    isCourier ? { rows: [] } : getDeliveryConfig(getDb(), ctx.scope),
  ]);

  const href = (over: SP) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return `/dashboard/orders${s ? `?${s}` : ""}`;
  };
  const mine = isCourier ? couriers.find((c) => c.id === restrict) : undefined;
  const push = isCourier ? pushConfig() : null;
  const hasFilters = !!(sp.q || sp.city || sp.courier || sp.pay || sp.from || sp.to);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl">الطلبيات</h1><p className="text-muted">{isCourier ? "الطلبيات المعيّنة لك." : "تابع طلبيات زباينك من أول ما توصل لين التوصيل."}</p></div>{!isCourier && ctx.access.writable && <ButtonLink href="/dashboard/orders/new" size="sm">+ طلبية يدوية</ButtonLink>}</div>

      {push && <PushToggle publicKey={push.publicKey} courier />}

      <nav aria-label="حالات الطلبيات" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ key: undefined, label: "الكل", n: result.allCount }, ...ORDER_STATUSES.filter((s) => s !== "with_courier" || ctx.store.useCouriers || status === s || (result.counts[s] ?? 0) > 0).map((s) => ({ key: s as string | undefined, label: ORDER_STATUS_LABELS[s], n: result.counts[s] ?? 0 }))].map((tab) => (
          <Link
            key={tab.key ?? "all"} href={href({ status: tab.key, page: undefined })} aria-current={status === tab.key ? "page" : undefined}
            className={cn("flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors", status === tab.key ? "border-fg/60 bg-surface-2" : "border-line bg-surface text-muted hover:text-fg")}
          >
            {tab.label}<span className="rounded-full bg-surface-2 px-1.5 text-xs">{tab.n}</span>
          </Link>
        ))}
      </nav>

      <form method="get" action="/dashboard/orders" className="space-y-3 rounded-xl border border-line bg-surface p-3">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="flex gap-2">
          <div className="flex-1"><Input name="q" aria-label="بحث" placeholder="ابحث برقم الطلبية أو الاسم أو الهاتف" defaultValue={sp.q ?? ""} /></div>
          <Button type="submit" aria-label="بحث"><Search className="size-5" /></Button>
        </div>
        {!isCourier && (
          <details open={hasFilters && !!(sp.city || sp.courier || sp.pay || sp.from || sp.to)}>
            <summary className="cursor-pointer text-sm font-medium text-link">فلاتر أكثر</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Select name="city" label="المدينة" defaultValue={sp.city ?? ""}><option value="">كل المدن</option>{delivery.rows.filter((c) => c.isActive).map((c) => <option key={c.cityId} value={c.cityId}>{c.cityName}</option>)}</Select>
              {ctx.store.useCouriers && <Select name="courier" label="المندوب" defaultValue={sp.courier ?? ""}><option value="">الكل</option>{couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
              <Select name="pay" label="الدفع" defaultValue={sp.pay ?? ""}><option value="">الكل</option><option value="cod">عند الاستلام</option><option value="bank_transfer">تحويل مصرفي</option></Select>
              <Input name="from" type="date" label="من تاريخ" defaultValue={sp.from ?? ""} />
              <Input name="to" type="date" label="إلى تاريخ" defaultValue={sp.to ?? ""} />
            </div>
          </details>
        )}
        {hasFilters && <Link href={href({ q: undefined, city: undefined, courier: undefined, pay: undefined, from: undefined, to: undefined, page: undefined })} className="inline-block text-sm text-link">مسح البحث والفلاتر</Link>}
      </form>

      {result.items.length === 0 ? (
        <EmptyState icon={<Inbox className="size-6" />} title={hasFilters || status ? "ما لقينا طلبيات" : "ما فيش طلبيات لسا"} description={hasFilters || status ? "غيّر البحث أو الفلاتر." : "شارك رابط متجرك، وأول طلبية تظهر هنا."}
          action={hasFilters || status ? <ButtonLink variant="outline" href="/dashboard/orders">عرض كل الطلبيات</ButtonLink> : isCourier ? undefined : <ButtonLink href="/dashboard#store-link">شارك رابط متجرك</ButtonLink>} />
      ) : (
        <>
          {isCourier
            ? <CourierOrders rows={result.items} summary={{ pendingOrders: mine?.pendingOrders ?? 0, pendingCash: mine?.pendingCash ?? 0, balance: mine?.balance ?? 0 }} writable={ctx.access.writable} />
            : <OrderTable rows={result.items} couriers={couriers.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name }))} canBulk={ctx.access.writable && ctx.store.useCouriers} />}
          {result.pageCount > 1 && (
            <nav aria-label="الصفحات" className="flex items-center justify-center gap-3 text-sm">
              {result.page > 1 && <Link className="rounded-md border border-line px-3 py-2" href={href({ page: String(result.page - 1) })}>السابق</Link>}
              <span className="text-muted">صفحة {result.page} من {result.pageCount} · {result.total} طلبية</span>
              {result.page < result.pageCount && <Link className="rounded-md border border-line px-3 py-2" href={href({ page: String(result.page + 1) })}>التالي</Link>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
