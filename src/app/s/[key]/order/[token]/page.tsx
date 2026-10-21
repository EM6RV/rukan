import { canUse } from "@/lib/entitlements";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { OrderPurchaseEffects, WhatsAppConfirmButton } from "@/components/store/order-confirmation";
import { OrderSummary } from "@/components/store/order-summary";
import { getKit } from "@/components/store/templates";
import { getDb } from "@/db";
import { toWhatsappNumber } from "@/lib/phone";
import { orderConfirmMessage, waLink } from "@/lib/whatsapp";
import { getOrderByToken } from "@/server/orders/create";
import { getRequestContext, loadStore } from "@/server/storefront/request";
import { forStore } from "@/server/tenant";

export const metadata: Metadata = { title: "تم استلام طلبيتك", robots: { index: false, follow: false } };

// صفحة تأكيد الطلب: بيانات حية من القاعدة (بدون كاش). الـ token عشوائي وصعب التخمين.
export default async function OrderPage({ params }: { params: Promise<{ key: string; token: string }> }) {
  const { key, token } = await params;
  const sf = await loadStore(key);
  if (!sf) notFound();
  const order = await getOrderByToken(forStore(getDb(), sf.id), token);
  if (!order) notFound();
  const { base } = await getRequestContext(key);
  const kit = getKit(canUse(sf.limits, "allTemplates") ? sf.template : "simple");
  const wa = sf.settings.whatsapp ? toWhatsappNumber(sf.settings.whatsapp) : null;
  const waHref = wa ? waLink(wa, orderConfirmMessage({ storeName: sf.name, number: order.number, name: order.customerName, total: order.total, items: order.items })) : null;

  return (
    <div className={`${kit.cls.container} max-w-2xl space-y-8 py-8 md:py-12`}>
      <OrderPurchaseEffects token={token} />
      <header className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto size-16 text-green-600" />
        <h1 className={kit.cls.heading}>وصلتنا طلبيتك!</h1>
        <p className="text-lg">رقم طلبيتك <b dir="ltr" className="px-1">#{order.number}</b></p>
        <p className="text-(--sp-muted)">{sf.settings.thanksMessage ?? "شكراً لطلبك! حنتواصلوا معاك قريب لتأكيد الطلبية."}</p>
        {order.paymentMethod === "bank_transfer" && <p className="mx-auto max-w-md border-s-4 border-(--sa) bg-(--sa-soft) px-4 py-2 text-sm font-medium">استلمنا إيصال التحويل وحنراجعه ونأكد الدفع.</p>}
      </header>
      {waHref && <WhatsAppConfirmButton href={waHref} className={`${kit.cls.btn} w-full !bg-[#25D366] !text-[#0b2e18]`} />}
      <OrderSummary order={order} panelClass={kit.cls.panel} />
      <p className="text-center text-sm text-(--sp-muted)">احتفظ برقم الطلبية ورقم هاتفك لتتبع طلبيتك من <Link href={`${base}/track`} className="font-semibold underline">صفحة التتبع</Link>.</p>
      <div className="text-center"><Link href={base || "/"} className={kit.cls.btnOutline}>كمّل التسوق</Link></div>
    </div>
  );
}
