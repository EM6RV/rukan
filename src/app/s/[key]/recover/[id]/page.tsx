import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecoverCart } from "@/components/store/recover-cart";
import { getDb } from "@/db";
import { getRecoverableCart } from "@/server/marketing/abandoned-carts";
import { loadStore } from "@/server/storefront/request";
import { forStore } from "@/server/tenant";

export const metadata: Metadata = { title: "سلتك", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** رابط التذكير على واتساب: يرجّع للزبون سلته ويفتح صفحة السلة */
export default async function RecoverPage({ params }: { params: Promise<{ key: string; id: string }> }) {
  const { key, id } = await params;
  const sf = await loadStore(key);
  if (!sf) notFound();
  const items = await getRecoverableCart(forStore(getDb(), sf.id), id);
  return <RecoverCart items={items ?? []} />;
}
