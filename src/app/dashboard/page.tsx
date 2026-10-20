import type { Metadata } from "next";
import Link from "next/link";
import { isNull } from "drizzle-orm";
import { Banknote, CheckCircle2, Clapperboard, Circle, FolderTree, Inbox, Package, ReceiptText, RotateCcw, TriangleAlert } from "lucide-react";
import { StoreLinkCard } from "@/components/dashboard/copy-link";
import { PushToggle } from "@/components/dashboard/push-toggle";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { getEnv } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { getDashboardStats } from "@/server/orders/stats";
import { pushConfig } from "@/server/push";
import { can } from "@/server/permissions";
import { storeUrl } from "@/lib/store-url";
import { currentRequest } from "@/server/request-origin";
import { requireStoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";

export const metadata: Metadata = { title: "الرئيسية" };

export default async function DashboardHome() {
  const ctx = await requireStoreContext("dashboard");
  const { scope, store, limits } = ctx;

  const [stats, productCount, categoryCount, [settings]] = await Promise.all([
    getDashboardStats(scope),
    scope.count(t.products, isNull(t.products.deletedAt)),
    scope.count(t.categories),
    scope.from(t.storeSettings).limit(1),
  ]);

  const checklist = [
    { done: !!store.logoMediaId, label: "ارفع لوجو متجرك", href: "/dashboard/settings" },
    { done: categoryCount > 0, label: "أضف أول قسم", href: "/dashboard/categories" },
    { done: productCount > 0, label: "أضف أول منتج", href: "/dashboard/products/new" },
    { done: !!settings?.whatsapp, label: "حط رقم واتساب للتواصل", href: "/dashboard/settings?tab=contact" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const push = can(ctx.role, "orders") ? pushConfig() : null;
  const req = await currentRequest();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl tracking-tight md:text-3xl">أهلاً {ctx.user.name} 👋</h1>
        <p className="mt-1 text-muted">هذي لمحة سريعة عن متجرك «{store.name}».</p>
      </div>

      {push && <PushToggle publicKey={push.publicKey} />}

      <section aria-label="المبيعات" className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* مبيعات اليوم: البطاقة البطلة */}
          <Card className="col-span-2 p-5">
            <p className="text-sm font-medium text-muted">مبيعات اليوم</p>
            <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight md:text-4xl">{formatMoney(stats.sales.today.total)}</p>
            <p className="mt-2 inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium tabular-nums">{stats.sales.today.orders} طلبية</p>
          </Card>
          {([["آخر 7 أيام", stats.sales.week], ["آخر 30 يوم", stats.sales.month]] as const).map(([label, v]) => (
            <Card key={label} className="flex flex-col justify-between p-4"><p className="text-xs text-muted sm:text-sm">مبيعات {label}</p><p className="mt-2 text-lg font-bold tabular-nums tracking-tight sm:text-2xl">{formatMoney(v.total)}</p><p className="mt-1 text-xs tabular-nums text-muted">{v.orders} طلبية</p></Card>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard href="/dashboard/orders?status=new" icon={<Inbox />} label="طلبيات جديدة" value={stats.newOrders} className={stats.newOrders > 0 ? "border-fg/30" : undefined} />
          {can(ctx.role, "couriers") && store.useCouriers && <StatCard tone="teal" href="/dashboard/couriers" icon={<Banknote />} label="فلوسك عند المندوبين" value={formatMoney(stats.cashWithCouriers)} hint={stats.pendingCash > 0 ? `+ ${formatMoney(stats.pendingCash)} في الطريق` : undefined} />}
          {can(ctx.role, "returns") && <StatCard tone="danger" href="/dashboard/returns" icon={<RotateCcw />} label="نسبة المرتجعات (30 يوم)" value={stats.returnRate === null ? "—" : `${Math.round(stats.returnRate * 100)}%`} />}
          {stats.pendingReceipts > 0 && <StatCard href="/dashboard/orders?pay=bank_transfer" icon={<ReceiptText />} label="إيصالات بانتظار المراجعة" value={stats.pendingReceipts} className="border-fg/30" />}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader title="المبيعات اليومية" description="آخر 7 أيام" /><CardBody><SalesChart data={stats.chart} /></CardBody></Card>
          <Card>
            <CardHeader title="منتجات قربت تخلص" description={stats.lowStockCount ? `${stats.lowStockCount} منتج مخزونه 5 أو أقل` : undefined} />
            {stats.lowStock.length === 0 ? <CardBody className="text-center text-sm text-muted">كل المنتجات مخزونها تمام.</CardBody> : (
              <ul className="divide-y divide-line">
                {stats.lowStock.map((p) => (
                  <li key={p.id}><Link href={`/dashboard/products/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface-2/60"><span className="truncate">{p.name}</span><span className={`inline-flex shrink-0 items-center gap-1 font-bold ${p.stock === 0 ? "text-danger-fg" : ""}`}>{p.stock === 0 && <TriangleAlert className="size-3.5" aria-hidden />}{p.stock === 0 ? "خلص" : `باقي ${p.stock}`}</span></Link></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      {can(ctx.role, "settings") && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Clapperboard className="size-5" aria-hidden /></span>
              <div><p className="font-semibold">نصمم لك ريلز ولوجو وهوية</p><p className="text-sm text-muted">اطلب تصميم لمتجرك، والسعر حسب الطلب{(limits.freeDesigns ?? 0) > 0 ? ". وباقتك فيها ريل أو لوجو مجاني." : "."}</p></div>
            </div>
            <ButtonLink href="/dashboard/design-services" variant="outline" size="sm">اطلب تصميم</ButtonLink>
          </CardBody>
        </Card>
      )}

      <Card id="store-link" className="scroll-mt-20">
        <CardHeader title="رابط متجرك" description="شاركه في إنستغرام وتيك توك وواتساب." />
        <CardBody><StoreLinkCard url={storeUrl(store.slug, getEnv(), req)} name={store.name} /></CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard href="/dashboard/products" icon={<Package />} label="المنتجات" value={productCount} usage={{ used: productCount, limit: limits.maxProducts, unit: "منتج" }} />
        <StatCard href="/dashboard/categories" icon={<FolderTree />} label="الأقسام" value={categoryCount} />
      </div>

      {doneCount < checklist.length && (
        <Card>
          <CardHeader title="ابدا من هنا" description={`${doneCount} من ${checklist.length} خلصت`} />
          <CardBody className="space-y-1 p-2">
            <div className="mx-3 mb-2 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-teal transition-all duration-500" style={{ width: `${(doneCount / checklist.length) * 100}%` }} /></div>
            {checklist.map((c) => (
              <Link key={c.label} href={c.href} className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2">
                {c.done ? <CheckCircle2 className="size-5 text-success-fg" /> : <Circle className="size-5 text-muted" />}
                <span className={c.done ? "text-muted line-through" : "font-medium"}>{c.label}</span>
              </Link>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
