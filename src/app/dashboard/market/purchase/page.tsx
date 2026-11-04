import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { toWhatsappNumber } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import { isModuleOn } from "@/server/modules";
import { getPurchaseOrder, listPurchaseOrders, purchaseOrderMessage, purchaseSuggestions, supplierDues } from "@/server/market/purchase-orders";
import { posConfigOf } from "@/server/pos/sync";
import { requireLineContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { PoActions, SuggestionGroups } from "./client";

export const metadata: Metadata = { title: "اقتراح الشراء" };
const STATUS = { draft: "مسودة", sent: "اتبعت", invoiced: "اتحول لفاتورة", cancelled: "ملغي" } as const;

export default async function PurchasePage() {
  const ctx = await requireLineContext("market", "products");
  if (!isModuleOn(ctx.store, ctx.limits, "purchasing")) {
    return (
      <div className="space-y-5"><h1 className="text-2xl">اقتراح الشراء</h1>
        <Card className="p-5 text-sm">اقتراح الشراء وطلبات الموردين يحتاجوا <b>وحدة المشتريات</b>. <Link href="/dashboard/settings/modules" className="text-link-strong underline">فعّلها من الوحدات</Link></Card>
      </div>
    );
  }
  const [settings] = await ctx.scope.from(t.storeSettings).limit(1);
  const cover = posConfigOf(settings?.posConfig).reorderCoverDays;
  const [sug, pos, dues, suppliers] = await Promise.all([purchaseSuggestions(ctx.scope, { coverDays: cover }), listPurchaseOrders(ctx.scope), supplierDues(ctx.scope), ctx.scope.from(t.suppliers)]);
  // رسائل واتساب للطلبات المفتوحة
  const open = pos.filter((p) => p.status === "draft" || p.status === "sent").slice(0, 20);
  const links = new Map<string, string | null>();
  for (const p of open) {
    const full = await getPurchaseOrder(ctx.scope, p.id);
    const wa = full?.supplier?.phone ? toWhatsappNumber(full.supplier.phone) : null;
    links.set(p.id, full && wa ? waLink(wa, purchaseOrderMessage({ shopName: ctx.store.name, number: full.number, note: full.note, items: full.items })) : null);
  }
  const writable = ctx.lines.market.writable;
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">اقتراح الشراء</h1><p className="text-muted">الأصناف اللي تحت حد إعادة الطلب، بكمية تغطي {cover} يوم حسب بيع آخر 30 يوم (بالكرتونة لو عندها). المورد من آخر فاتورة شراء.</p></div>
      <SuggestionGroups suggestions={sug} suppliers={suppliers.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name }))} writable={writable} />

      <Card>
        <CardHeader title="طلبات الشراء" description="ابعث الطلب للمورد على واتساب، ولما توصل البضاعة حوّله لفاتورة شراء واستلم بالكميات الفعلية." />
        {pos.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش طلبات شراء.</p> : (
          <ul className="divide-y divide-line text-sm">
            {pos.slice(0, 50).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1"><b>طلب {p.number}</b> · {p.supplier} <span className="text-muted">· {p.lines} صنف · {formatMoney(p.total)} · {formatDate(p.at)}</span></span>
                <Badge tone={p.status === "invoiced" ? "success" : p.status === "cancelled" ? "neutral" : "gold"}>{STATUS[p.status]}</Badge>
                {p.invoiceId && <Link href={`/dashboard/purchasing/${p.invoiceId}`} className="text-link-strong underline">الفاتورة</Link>}
                {writable && (p.status === "draft" || p.status === "sent") && <PoActions id={p.id} wa={links.get(p.id) ?? null} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="مستحقات الموردين" description="الدفعات تتوزع على الفواتير الأقدم أول. المتأخر = فات تاريخ استحقاقه." action={<Link href="/dashboard/purchasing/suppliers" className="text-sm text-link-strong underline">الموردين والدفعات</Link>} />
        {dues.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما عليك شي للموردين.</p> : (
          <ul className="divide-y divide-line text-sm">{dues.map((d) => (
            <li key={d.supplierId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <span><b>{d.name}</b> <span className="text-muted">· {d.openInvoices.length} فاتورة مفتوحة{d.nextDueAt ? ` · الاستحقاق الجاي ${formatDate(d.nextDueAt)}` : ""}</span></span>
              <span className="flex items-center gap-2">{d.overdue > 0 && <Badge tone="danger">متأخر {formatMoney(d.overdue)}</Badge>}<b className="tabular-nums">{formatMoney(d.balance)}</b></span>
            </li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}
