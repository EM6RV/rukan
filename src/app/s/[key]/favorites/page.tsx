import { BASE_TEMPLATE } from "@/lib/plan-limits";
import { canUse } from "@/lib/entitlements";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FavoritesList } from "@/components/store/favorites";
import { getKit } from "@/components/store/templates";
import { loadStore } from "@/server/storefront/request";

export const metadata: Metadata = { title: "المفضلة", robots: { index: false, follow: false } };

export default async function FavoritesPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const sf = await loadStore(key);
  if (!sf) notFound();
  const kit = getKit(canUse(sf.limits, "allTemplates") ? sf.template : BASE_TEMPLATE);
  return (
    <div className={`${kit.cls.container} space-y-8 py-8 md:py-12`}>
      <h1 className={kit.cls.heading}>مفضلتي</h1>
      <FavoritesList />
    </div>
  );
}
