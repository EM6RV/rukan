import type { Metadata } from "next";
import { ShoppingCart } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { getEnv } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { toWhatsappNumber } from "@/lib/phone";
import { storeUrl } from "@/lib/store-url";
import { renderWhatsapp } from "@/lib/whatsapp-defaults";
import { waLink } from "@/lib/whatsapp";
import { listAbandonedCarts } from "@/server/marketing/abandoned-carts";
import { getWhatsappTemplates } from "@/server/orders/whatsapp-templates";
import { requireStoreContext } from "@/server/store-context";
import { CartList } from "./cart-list";

export const metadata: Metadata = { title: "السلات المتروكة" };
export const dynamic = "force-dynamic";

export default async function AbandonedCartsPage() {
  const ctx = await requireStoreContext("customers");
  const [carts, templates] = await Promise.all([listAbandonedCarts(ctx.scope), getWhatsappTemplates(ctx.scope)]);
  const link = `${storeUrl(ctx.store.slug, getEnv())}/cart`;
  const body = templates.abandoned_cart!.body;
  const rows = carts.map((c) => {
    const wa = toWhatsappNumber(c.phone);
    const text = renderWhatsapp(body, { name: c.name ?? "", total: formatMoney(c.total), store: ctx.store.name, link });
    return { ...c, whatsappUrl: wa ? waLink(wa, text) : null };
  });
  const total = carts.reduce((s, c) => s + c.total, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">السلات المتروكة</h1>
        <p className="text-muted">زباين كتبوا رقمهم في صفحة الطلب وما كمّلوا. ذكّرهم على واتساب برسالة جاهزة (تقدر تعدّلها من الإعدادات، تبويب واتساب).</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<ShoppingCart className="size-6" />} title="ما فيش سلات متروكة" description="لما زبون يكتب رقمه ويسيب السلة 30 دقيقة، تظهر هنا. الأرقام تتمسح بعد 30 يوم." />
      ) : (
        <>
          <p className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
            <b className="tabular-nums">{rows.length}</b> سلة بقيمة <b className="tabular-nums">{formatMoney(total)}</b> بانتظار تذكير.
          </p>
          <CartList rows={rows} writable={ctx.access.writable} />
        </>
      )}
    </div>
  );
}
