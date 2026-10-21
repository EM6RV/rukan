import { BASE_TEMPLATE } from "@/lib/plan-limits";
import { canUse } from "@/lib/entitlements";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackForm } from "@/components/store/track-form";
import { getKit } from "@/components/store/templates";
import { loadStore } from "@/server/storefront/request";

export const metadata: Metadata = { title: "تتبع طلبيتك", robots: { index: false, follow: false } };

export default async function TrackPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ n?: string }> }) {
  const sf = await loadStore((await params).key);
  if (!sf) notFound();
  const { n } = await searchParams;
  const kit = getKit(canUse(sf.limits, "allTemplates") ? sf.template : BASE_TEMPLATE);
  return (
    <div className={`${kit.cls.container} max-w-2xl space-y-8 py-8 md:py-12`}>
      <header className="space-y-2"><h1 className={kit.cls.heading}>تتبع طلبيتك</h1><p className="text-(--sp-muted)">اكتب رقم الطلبية ورقم الهاتف اللي سجلت بيه.</p></header>
      <TrackForm initialNumber={n?.replace(/\D/g, "").slice(0, 10)} />
    </div>
  );
}
