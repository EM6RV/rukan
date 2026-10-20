import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Rocket, ShoppingBag, Store, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getDb } from "@/db";
import { renewalMessage } from "@/lib/billing";
import { formatDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { waLink } from "@/lib/whatsapp";
import { toWhatsappNumber } from "@/lib/phone";
import { getPlatformStats } from "@/server/admin/stats";

export const metadata: Metadata = { title: "نظرة عامة" };

export default async function AdminHome() {
  const s = await getPlatformStats(getDb());
  const maxRev = Math.max(1, ...s.revenue.map((r) => r.total));
  const kpi = [
    { icon: Store, label: "المتاجر", value: String(s.storesTotal), hint: `${s.byState.active} نشط · ${s.byState.trial} تجريبي · ${s.byState.expired} منتهي · ${s.byState.suspended} موقوف` },
    { icon: TrendingUp, label: "الدخل الشهري المتكرر", value: formatMoney(s.mrr), hint: "من المتاجر النشطة حسب باقاتها" },
    { icon: Banknote, label: "إيرادات هذا الشهر", value: formatMoney(s.revenueThisMonth), hint: "الدفعات المسجلة" },
    { icon: Rocket, label: "متاجر جديدة", value: String(s.newWeek), hint: `آخر 7 أيام · ${s.newMonth} آخر 30 يوم` },
    { icon: ShoppingBag, label: "طلبيات المنصة (30 يوم)", value: String(s.platformOrders30d.orders), hint: formatMoney(s.platformOrders30d.total) },
    { icon: Users, label: "المستخدمين", value: String(s.usersCount), hint: s.unfinished ? `${s.unfinished} ما كمّلوا إعداد المتجر` : undefined },
  ];

  return (
    <>
      <div><h1 className="text-2xl">نظرة عامة</h1><p className="text-muted">صورة سريعة عن المنصة والاشتراكات.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpi.map(({ icon: Icon, label, value, hint }) => (
          <Card key={label} className="flex items-start gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2"><Icon className="size-5" aria-hidden /></div>
            <div className="min-w-0"><p className="text-sm text-muted">{label}</p><p className="text-xl font-bold">{value}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="الإيرادات الشهرية" description="آخر 6 شهور" />
          <CardBody>
            <div role="img" aria-label="إيرادات آخر 6 شهور" className="flex h-44 items-end gap-3" dir="ltr">
              {s.revenue.map((r, i) => (
                <div key={r.month} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-xs text-muted">{r.total ? formatMoney(r.total).replace(" د.ل", "") : ""}</span>
                  <div className={`w-full rounded-t-md ${i === s.revenue.length - 1 ? "bg-teal" : "bg-teal/45"}`} style={{ height: `${Math.max(3, (r.total / maxRev) * 120)}px`, opacity: r.total ? 1 : 0.25 }} title={`${r.month}: ${formatMoney(r.total)} (${r.payments} دفعة)`} />
                  <span className="text-xs text-muted">{r.month.slice(5)}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="أنشط المتاجر" description="حسب عدد الطلبيات آخر 30 يوم" />
          {s.topStores.length === 0 ? <CardBody className="text-center text-sm text-muted">ما فيش طلبيات لسا.</CardBody> : (
            <ol className="divide-y divide-line">
              {s.topStores.map((t, i) => (
                <li key={t.id}><Link href={`/admin/stores/${t.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2/60"><span className="w-5 text-muted">{i + 1}</span><span className="min-w-0 flex-1 truncate font-medium">{t.name}</span><span className="text-muted">{t.orders} طلبية</span><b>{formatMoney(t.total)}</b></Link></li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="اشتراكات تنتهي قريباً" description="خلال 5 أيام أو انتهت آخر 7 أيام. ابعث للبياع رسالة واتساب جاهزة." action={<Link href="/admin/payments" className="text-sm text-link">كل الاشتراكات</Link>} />
        {s.expiring.length === 0 ? <CardBody className="text-center text-sm text-muted">ما فيش اشتراكات قربت تخلص.</CardBody> : (
          <ul className="divide-y divide-line">
            {s.expiring.map((e) => {
              const wa = toWhatsappNumber(e.ownerPhone);
              const msg = renewalMessage({ ownerName: e.ownerName, storeName: e.name, daysLeft: e.daysLeft, endDate: formatDate(e.endsAt), planName: e.planName });
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Link href={`/admin/stores/${e.id}`} className="min-w-0 flex-1"><p className="truncate font-semibold">{e.name}</p><p className="text-muted">{e.ownerName} · <span dir="ltr">{e.ownerPhone}</span></p></Link>
                  <Badge tone={e.state === "expired" ? "danger" : e.state === "trial" ? "gold" : "teal"}>{e.state === "expired" ? "منتهي" : e.state === "trial" ? "تجريبي" : "نشط"} · {e.daysLeft <= 0 ? `من ${-e.daysLeft} يوم` : `${e.daysLeft} يوم`}</Badge>
                  {wa && <a href={waLink(wa, msg)} target="_blank" rel="noopener noreferrer" className="rounded-md bg-success px-3 py-1.5 font-semibold text-white hover:brightness-95">واتساب</a>}
                  <Link href={`/admin/stores/${e.id}#payment`} className="rounded-md border border-line px-3 py-1.5 font-medium hover:bg-surface-2">سجّل دفعة</Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {s.byPlan.length > 0 && (
        <Card><CardHeader title="المتاجر النشطة حسب الباقة" /><CardBody className="flex flex-wrap gap-2">{s.byPlan.map((p) => <Badge key={p.name} tone="neutral" className="text-sm">{p.name}: {p.count}</Badge>)}</CardBody></Card>
      )}
    </>
  );
}
