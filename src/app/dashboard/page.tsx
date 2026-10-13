import type { Metadata } from "next";
import Link from "next/link";
import { isNull } from "drizzle-orm";
import { Banknote, CheckCircle2, Circle, FolderTree, Inbox, Package, ReceiptText, RotateCcw, TriangleAlert } from "lucide-react";
import { StoreLinkCard } from "@/components/dashboard/copy-link";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getEnv } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { getDashboardStats } from "@/server/orders/stats";
import { can } from "@/server/permissions";
import { storeUrl } from "@/lib/store-url";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">أهلاً {ctx.user.name} 👋</h1>
        <p className="text-muted">هذي لمحة سريعة عن متجرك «{store.name}».</p>
      </div>

      <section aria-label="المبيعات" className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {([["اليوم", stats.sales.today], ["آخر 7 أيام", stats.sales.week], ["آخر 30 يوم", stats.sales.month]] as const).map(([label, v]) => (
            <Card key={label} className="p-4"><p className="text-xs text-muted sm:text-sm">مبيعات {label}</p><p className="mt-1 text-base font-bold sm:text-xl">{formatMoney(v.total)}</p><p className="text-xs text-muted">{v.orders} طلبية</p></Card>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HomeStat href="/dashboard/orders?status=new" icon={<Inbox className="size-5" />} label="طلبيات جديدة" value={String(stats.newOrders)} highlight={stats.newOrders > 0} />
          {can(ctx.role, "couriers") && <HomeStat href="/dashboard/couriers" icon={<Banknote className="size-5" />} label="كاش عند المندوبين" value={formatMoney(stats.cashWithCouriers)} hint={stats.pendingCash > 0 ? `+ ${formatMoney(stats.pendingCash)} في الطريق` : undefined} />}
          {can(ctx.role, "returns") && <HomeStat href="/dashboard/returns" icon={<RotateCcw className="size-5" />} label="نسبة المرتجعات (30 يوم)" value={stats.returnRate === null ? "—" : `${Math.round(stats.returnRate * 100)}%`} />}
          {stats.pendingReceipts > 0 && <HomeStat href="/dashboard/orders?pay=bank_transfer" icon={<ReceiptText className="size-5" />} label="إيصالات بانتظار المراجعة" value={String(stats.pendingReceipts)} highlight />}
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

      <Card>
        <CardHeader title="رابط متجرك" description="شاركه في إنستغرام وتيك توك وواتساب." />
        <CardBody><StoreLinkCard url={storeUrl(store.slug, getEnv())} name={store.name} /></CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat href="/dashboard/products" icon={<Package className="size-5" />} label="المنتجات" value={productCount} limit={limits.maxProducts} />
        <Stat href="/dashboard/categories" icon={<FolderTree className="size-5" />} label="الأقسام" value={categoryCount} />
      </div>

      {doneCount < checklist.length && (
        <Card>
          <CardHeader title="ابدا من هنا" description={`${doneCount} من ${checklist.length} خلصت`} />
          <CardBody className="space-y-1 p-2">
            <div className="mx-3 mb-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gold transition-all" style={{ width: `${(doneCount / checklist.length) * 100}%` }} /></div>
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

function Stat({ href, icon, label, value, limit }: { href: string; icon: React.ReactNode; label: string; value: number; limit?: number | null }) {
  return (
    <Link href={href}>
      <Card className="flex items-center gap-4 p-5 transition-shadow hover:shadow-lift">
        <div className="flex size-11 items-center justify-center rounded-lg bg-gold/20">{icon}</div>
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="text-2xl font-bold">{value}{limit ? <span className="text-sm font-normal text-muted"> / {limit}</span> : null}</p>
        </div>
      </Card>
    </Link>
  );
}

function HomeStat({ href, icon, label, value, hint, highlight }: { href: string; icon: React.ReactNode; label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <Link href={href}>
      <Card className={`flex items-center gap-3 p-4 transition-shadow hover:shadow-lift ${highlight ? "border-gold" : ""}`}>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gold/20">{icon}</div>
        <div className="min-w-0"><p className="truncate text-sm text-muted">{label}</p><p className="text-xl font-bold">{value}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div>
      </Card>
    </Link>
  );
}
