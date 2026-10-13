import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CartView } from "@/components/store/cart-view";
import { getKit } from "@/components/store/templates";
import { loadStore } from "@/server/storefront/request";

export const metadata: Metadata = { title: "السلة", robots: { index: false, follow: false } };

export default async function CartPage({ params }: { params: Promise<{ key: string }> }) {
  const sf = await loadStore((await params).key);
  if (!sf) notFound();
  const kit = getKit(sf.limits.allTemplates ? sf.template : "simple");
  return (
    <div className={`${kit.cls.container} space-y-8 py-8 md:py-12`}>
      <h1 className={kit.cls.heading}>سلة التسوق</h1>
      <CartView />
    </div>
  );
}
