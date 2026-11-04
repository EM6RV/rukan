import type { Metadata } from "next";
import Link from "next/link";
import { Eye, MousePointerClick, Percent, ShoppingBag } from "lucide-react";
import { LockedPage } from "@/components/dashboard/locked-page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { canUse } from "@/lib/entitlements";
import { getAnalytics, SOURCE_LABELS } from "@/server/analytics";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "تحليلات المتجر" };
const RANGES = [7, 30, 90];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const ctx = await requireStoreContext("reports");
  if (!canUse(ctx.limits, "analytics")) return <LockedPage feature="analytics" />;
  const days = RANGES.includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  const a = await getAnalytics(ctx.scope, days);
  const max = Math.max(1, ...a.sources.map((s) => s.visits));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl">تحليلات المتجر</h1><p className="text-muted">زيارات متجرك ومنين جايين، بدون كوكيز ولا تتبع شخصي.</p></div>
        <nav className="flex gap-2" aria-label="الفترة">{RANGES.map((d) => <Link key={d} href={`?days=${d}`} className={`rounded-full border px-3 py-1 text-sm ${d === days ? "border-navy bg-navy text-white" : "border-line"}`}>{d} يوم</Link>)}</nav>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Eye />} label="الزيارات" value={a.visits} />
        <StatCard icon={<MousePointerClick />} label="مشاهدات الصفحات" value={a.pageViews} />
        <StatCard icon={<ShoppingBag />} label="الطلبيات" value={a.orders} />
        <StatCard icon={<Percent />} label="معدل التحويل" value={a.conversion === null ? "—" : `${(a.conversion * 100).toFixed(1)}%`} hint="طلبيات ÷ زيارات" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="مصادر الزيارات" description="حسب رابط الحملة (utm_source) أو الموقع اللي جا منه الزبون." />
          <CardBody className="space-y-3">
            {a.sources.length === 0 ? <p className="text-sm text-muted">لسه ما فيه زيارات. شارك رابط متجرك في إنستا وتيك توك وواتساب.</p> : a.sources.map((s) => (
              <div key={s.source} className="space-y-1">
                <div className="flex justify-between text-sm"><span>{SOURCE_LABELS[s.source]}</span><b className="tabular-nums">{s.visits}</b></div>
                <div className="h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full bg-teal" style={{ width: `${(s.visits / max) * 100}%` }} /></div>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="أكثر المنتجات مشاهدة" />
          <CardBody>
            {a.topProducts.length === 0 ? <p className="text-sm text-muted">ما فيه مشاهدات منتجات بعد.</p> : (
              <ol className="divide-y divide-line">
                {a.topProducts.map((p) => <li key={p.productId} className="flex justify-between gap-3 py-2 text-sm"><Link href={`/dashboard/products/${p.productId}`} className="truncate hover:underline">{p.name}</Link><b className="tabular-nums">{p.views}</b></li>)}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>
      <p className="text-xs text-muted">طريقة الحساب: الزيارة = أول صفحة يفتحها الزائر في جلسته. ما نخزنوش IP ولا معرّف شخصي.</p>
    </div>
  );
}
