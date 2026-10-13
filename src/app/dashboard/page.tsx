import type { Metadata } from "next";
import Link from "next/link";
import { isNull } from "drizzle-orm";
import { Banknote, CheckCircle2, Circle, FolderTree, Inbox, Package, ReceiptText, RotateCcw, TriangleAlert } from "lucide-react";
import { StoreLinkCard } from "@/components/dashboard/copy-link";
import { PushToggle } from "@/components/dashboard/push-toggle";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getEnv } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { getDashboardStats } from "@/server/orders/stats";
import { pushConfig } from "@/server/push";
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
  const push = ctx.role !== "courier" && can(ctx.role, "orders") ? pushConfig() : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl tracking-tight md:text-3xl">أهلاً {ctx.user.name} 👋</h1>
        <p className="mt-1 text-muted">هذي لمحة سريعة عن متجرك «{store.name}».</p>
      </div>

      {push && <PushToggle publicKey={push.publicKey} />}

      <section aria-label="المبيعات" className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* مبيعات اليوم: البطاقة البطلة (كحلي) */}
          <div className="relative col-span-2 isolate overflow-hidden rounded-2xl bg-navy p-5 text-white shadow-lift ring-1 ring-white/10">
            <div aria-hidden className="pointer-events-none absolute -top-16 -start-10 -z-10 size-48 rounded-full bg-gold/25 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-20 -end-10 -z-10 size-48 rounded-full bg-teal/30 blur-3xl" />
            <p className="text-sm font-medium text-white/75">مبيعات اليوم</p>
            <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-gold md:text-4xl">{formatMoney(stats.sales.today.total)}</p>
            <p className="mt-2 inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium tabular-nums ring-1 ring-white/15">{stats.sales.today.orders} طلبية</p>
          </div>
          {([["آخر 7 أيام", stats.sales.week], ["آخر 30 يوم", stats.sales.month]] as const).map(([label, v]) => (
            <Card key={label} className="flex flex-col justify-between p-4"><p className="text-xs text-muted sm:text-sm">مبيعات {label}</p><p className="mt-2 text-lg font-bold tabular-nums tracking-tight sm:text-2xl">{formatMoney(v.total)}</p><p className="mt-1 text-xs tabular-nums text-muted">{v.orders} طلبية</p></Card>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HomeStat tone="gold" href="/dashboard/orders?status=new" icon={<Inbox className="size-5" />} label="طلبيات جديدة" value={String(stats.newOrders)} highlight={stats.newOrders > 0} />
          {can(ctx.role, "couriers") && <HomeStat tone="teal" href="/dashboard/couriers" icon={<Banknote className="size-5" />} label="كاش عند المندوبين" value={formatMoney(stats.cashWithCouriers)} hint={stats.pendingCash > 0 ? `+ ${formatMoney(stats.pendingCash)} في الطريق` : undefined} />}
          {can(ctx.role, "returns") && <HomeStat tone="danger" href="/dashboard/returns" icon={<RotateCcw className="size-5" />} label="نسبة المرتجعات (30 يوم)" value={stats.returnRate === null ? "—" : `${Math.round(stats.returnRate * 100)}%`} />}
          {stats.pendingReceipts > 0 && <HomeStat tone="gold" href="/dashboard/orders?pay=bank_transfer" icon={<ReceiptText className="size-5" />} label="إيصالات بانتظار المراجعة" value={String(stats.pendingReceipts)} highlight />}
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

      <Card id="store-link" className="scroll-mt-20">
        <CardHeader title="رابط متجرك" description="شاركه في إنستغرام وتيك توك وواتساب." />
        <CardBody><StoreLinkCard url={storeUrl(store.slug, getEnv())} name={store.name} /></CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat tone="teal" href="/dashboard/products" icon={<Package className="size-5" />} label="المنتجات" value={productCount} limit={limits.maxProducts} />
        <Stat tone="gold" href="/dashboard/categories" icon={<FolderTree className="size-5" />} label="الأقسام" value={categoryCount} />
      </div>

      {doneCount < checklist.length && (
        <Card>
          <CardHeader title="ابدا من هنا" description={`${doneCount} من ${checklist.length} خلصت`} />
          <CardBody className="space-y-1 p-2">
            <div className="mx-3 mb-2 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gradient-to-l from-gold to-teal transition-all duration-500" style={{ width: `${(doneCount / checklist.length) * 100}%` }} /></div>
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

const TONES = {
  gold: { tile: "bg-gold/20 text-navy dark:text-gold", edge: "before:bg-gold" },
  teal: { tile: "bg-teal/15 text-link-strong", edge: "before:bg-teal" },
  danger: { tile: "bg-danger/15 text-danger-fg", edge: "before:bg-danger" },
} as const;
type Tone = keyof typeof TONES;

function Stat({ href, icon, label, value, limit, tone = "gold" }: { href: string; icon: React.ReactNode; label: string; value: number; limit?: number | null; tone?: Tone }) {
  return (
    <Link href={href} className="group block">
      <Card className="flex h-full items-center gap-4 p-5 transition-all duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-lift">
        <div className={`flex size-12 items-center justify-center rounded-xl ${TONES[tone].tile}`}>{icon}</div>
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="text-2xl font-bold tabular-nums tracking-tight">{value}{limit ? <span className="text-sm font-normal text-muted"> / {limit}</span> : null}</p>
        </div>
      </Card>
    </Link>
  );
}

function HomeStat({ href, icon, label, value, hint, highlight, tone = "gold" }: { href: string; icon: React.ReactNode; label: string; value: string; hint?: string; highlight?: boolean; tone?: Tone }) {
  return (
    <Link href={href} className="group block">
      <Card className={`relative flex h-full items-center gap-3 overflow-hidden p-4 transition-all duration-200 ease-out before:absolute before:inset-y-0 before:start-0 before:w-1 group-hover:-translate-y-0.5 group-hover:shadow-lift ${TONES[tone].edge} ${highlight ? "border-gold bg-gold/10" : ""}`}>
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${TONES[tone].tile}`}>{icon}</div>
        <div className="min-w-0"><p className="truncate text-sm text-muted">{label}</p><p className="text-xl font-bold tabular-nums tracking-tight">{value}</p>{hint && <p className="text-xs tabular-nums text-muted">{hint}</p>}</div>
      </Card>
    </Link>
  );
}
