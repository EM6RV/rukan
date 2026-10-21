import { canUse } from "@/lib/entitlements";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutForm } from "@/components/store/checkout-form";
import { getKit } from "@/components/store/templates";
import { getDeliveryRates } from "@/server/storefront/data";
import { loadStore } from "@/server/storefront/request";

export const metadata: Metadata = { title: "إتمام الطلب", robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ key: string }> }) {
  const sf = await loadStore((await params).key);
  if (!sf) notFound();
  const kit = getKit(canUse(sf.limits, "allTemplates") ? sf.template : "simple");
  const rates = await getDeliveryRates(sf.id);
  return (
    <div className={`${kit.cls.container} space-y-8 py-8 md:py-12`}>
      <h1 className={kit.cls.heading}>إتمام الطلب</h1>
      <CheckoutForm rates={rates} payments={sf.payments} defaultCityId={sf.settings.cityId} />
    </div>
  );
}
