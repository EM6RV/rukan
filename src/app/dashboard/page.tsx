import type { Metadata } from "next";
import Link from "next/link";
import { eq, isNull } from "drizzle-orm";
import { listExpiring } from "@/server/catalog/expiry";
import { ordersThisMonth } from "@/server/entitlements";
import { Banknote, BarChart3, Plus, ShoppingBag, CheckCircle2, Clapperboard, Circle, FolderTree, Inbox, Package, ReceiptText, RotateCcw, TriangleAlert } from "lucide-react";
import { getDb } from "@/db";
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
import { hasPermission } from "@/server/permissions";
import { storeUrl } from "@/lib/store-url";
import { currentRequest } from "@/server/request-origin";
import { requireStoreContext } from "@/server/store-context";
import { redirect } from "next/navigation";
import { LINE_INFO, OPS_LINES } from "@/lib/product-lines";
import { t } from "@/server/tenant";

export const metadata: Metadata = { title: "الرئيسية" };

export default async function DashboardHome() {
  const ctx = await requireStoreContext("dashboard");
  // نشاط بدون متجر أونلاين: الرئيسية هي صفحة أول منظومة عنده
  if (!ctx.lines.store.subscribed) {
    const first = OPS_LINES.find((l) => ctx.lines[l].subscribed);
    redirect(first ? LINE_INFO[first].home : "/dashboard/lines");
  }
  const { scope, store, limits } = ctx;

  const ordersMonth = limits.maxOrdersPerMonth != null ? await ordersThisMonth(getDb(), store.id) : 0;
  const [stats, productCount, categoryCount, , activeRates, enabledPayments, visitRows, orderCount, expiring] = await Promise.all([
    getDashboardStats(scope),
    scope.count(t.products, isNull(t.products.deletedAt)),
    scope.count(t.categories),
    Promise.resolve(null),
    scope.count(t.deliveryRates, eq(t.deliveryRates.isActive, true)),
    scope.count(t.storePaymentMethods, eq(t.storePaymentMethods.isEnabled, true)),
    scope.count(t.storeVisits),
    scope.count(t.orders),
    listExpiring(scope),
  ]);

  // «5 خطوات وتبدا تبيع»
  const checklist = [
    { done: !!store.logoMediaId, label: "ارفع لوجو متجرك", href: "/dashboard/settings" },
    { done: productCount > 0, label: "أضف أول منتج", href: "/dashboard/products/new" },
    { done: activeRates > 0, label: "حدد أسعار التوصيل لمدنك", href: "/dashboard/settings?tab=delivery" },
    { done: enabledPayments > 0, label: "فعّل طريقة دفع (عند الاستلام أو تحويل)", href: "/dashboard/settings?tab=payment" },
    { done: visitRows > 0 || orderCount > 0, label: "شارك رابط متجرك مع زباينك", href: "#store-link" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const push = hasPermission(ctx, "orders") ? pushConfig() : null;
  const req = await currentRequest();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl tracking-tight md:text-3xl">أهلاً {ctx.user.name} 👋</h1>
        <p className="mt-1 text-muted">هذي لمحة سريعة عن متجرك «{store.name}».</p>
      </div>

      {push && <PushToggle publicKey={push.publicKey} />}

      <nav aria-label="وصول سريع" className="flex flex-wrap gap-2">
        {([
          ["orders", "/dashboard/orders/new", "طلبية يدوية", Plus], ["products", "/dashboard/products/new", "منتج جديد", Package],
          ["orders", "/dashboard/orders?status=new", "الطلبيات الجديدة", ShoppingBag], ["reports", "/dashboard/reports", "التقارير", BarChart3],
        ] as const).filter(([perm]) => hasPermission(ctx, perm)).map(([, href, label, Icon]) => (
          <Link key={href} href={href} className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-2"><Icon className="size-4" aria-hidden /> {label}</Link>
        ))}
      </nav>

      {expiring.length > 0 && hasPermission(ctx, "products") && (
        <Link href="/dashboard/catalog" className="flex items-center gap-3 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3 text-sm font-medium"><TriangleAlert className="size-5" aria-hidden /> {expiring.length} منتج قرب تنتهي صلاحيته</Link>
      )}

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
          {hasPermission(ctx, "couriers") && store.useCouriers && <StatCard tone="teal" href="/dashboard/couriers" icon={<Banknote />} label="فلوسك عند المندوبين" value={formatMoney(stats.cashWithCouriers)} hint={stats.pendingCash > 0 ? `+ ${formatMoney(stats.pendingCash)} في الطريق` : undefined} />}
          {hasPermission(ctx, "returns") && <StatCard tone="danger" href="/dashboard/returns" icon={<RotateCcw />} label="نسبة المرتجعات (30 يوم)" value={stats.returnRate === null ? "—" : `${Math.round(stats.returnRate * 100)}%`} />}
          {stats.pendingReceipts > 0 && <StatCard href="/dashboard/orders?pay=bank_transfer" icon={<ReceiptText />} label="إيصالات بانتظار المراجعة" value={stats.pendingReceipts} className="border-fg/30" />}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader title="المبيعات اليومية" description="آخر 7 أيام" /><CardBody><SalesChart data={stats.chart} /></CardBody></Card>
          <Card>
            <CardHeader title="منتجات قربت تخلص" description={stats.lowStockCount ? `${stats.lowStockCount} منتج وصل لحد التنبيه` : undefined} />
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

      {hasPermission(ctx, "settings") && (
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
        {limits.maxOrdersPerMonth != null && <StatCard href="/dashboard/orders" icon={<ShoppingBag />} label="طلبيات هذا الشهر" value={ordersMonth} usage={{ used: ordersMonth, limit: limits.maxOrdersPerMonth, unit: "طلبية" }} />}
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
