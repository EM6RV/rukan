import type { Metadata } from "next";
import Link from "next/link";
import { HandCoins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatMoney } from "@/lib/money";
import { debtAlerts } from "@/server/pos/customers";
import { listBalances } from "@/server/pos/listing";
import { posConfigOf } from "@/server/pos/sync";
import { requireStoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";

export const metadata: Metadata = { title: "الديون والمحافظ" };

export default async function DebtsPage() {
  const ctx = await requireStoreContext("customers");
  const [settings] = await ctx.scope.from(t.storeSettings).limit(1);
  const cfg = posConfigOf(settings?.posConfig);
  const [list, alerts] = await Promise.all([listBalances(ctx.scope), debtAlerts(ctx.scope, { defaultLimit: cfg.defaultCreditLimit, alertDays: cfg.debtAlertDays })]);
  const totalDebt = list.reduce((a, c) => a + Math.max(0, c.debt), 0);
  const totalWallet = list.reduce((a, c) => a + c.wallet, 0);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الديون والمحافظ</h1><p className="text-muted">دفتر الدين (الكُناش) لكل زبون، ورصيد المحافظ ونقاط الولاء. افتح الزبون باش تسجل سداد أو تبعت كشف حسابه على واتساب.</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-sm text-muted">الديون على الزباين</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(totalDebt)}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">أرصدة المحافظ</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(totalWallet)}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">تنبيهات</p><p className="mt-1 text-2xl font-bold tabular-nums">{alerts.length}</p></Card>
      </div>
      {alerts.length > 0 && (
        <Card>
          <CardHeader title="تحتاج متابعة" description={`تعدّوا حد الدين أو ما سددوش من ${cfg.debtAlertDays} يوم`} />
          <ul className="divide-y divide-line">{alerts.map((a) => <li key={a.id}><Link href={`/dashboard/customers/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-surface-2/60"><span className="font-semibold">{a.name} <span className="font-normal text-muted" dir="ltr">{a.phone}</span></span><span className="flex items-center gap-2">{a.overLimit && <Badge tone="danger">فوق الحد</Badge>}<span className="text-muted">آخر سداد قبل {a.idleDays} يوم</span><b className="tabular-nums">{formatMoney(a.debt)}</b></span></Link></li>)}</ul>
        </Card>
      )}
      {list.length === 0 ? <EmptyState icon={<HandCoins className="size-6" />} title="ما فيش ديون ولا أرصدة" description="البيع على الحساب وشحن المحفظة من الكاشير يطلعوا هنا." /> : (
        <Card>
          <CardHeader title="كل الأرصدة" />
          <ul className="divide-y divide-line">{list.map((c) => <li key={c.id}><Link href={`/dashboard/customers/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-surface-2/60"><span className="font-semibold">{c.name}</span><span className="flex flex-wrap gap-3 tabular-nums text-muted"><span>دين <b className="text-fg">{formatMoney(c.debt)}</b></span><span>محفظة {formatMoney(c.wallet)}</span>{c.points !== 0 && <span>{c.points} نقطة</span>}</span></Link></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
