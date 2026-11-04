"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "./cart-context";
import { useStore } from "./store-context";

/** يحط بنود السلة المتروكة في سلة الزبون ويحوّله للسلة (السيرفر يتحقق من الأسعار والمخزون وقت العرض) */
export function RecoverCart({ items }: { items: { variantId: string; quantity: number; note?: string }[] }) {
  const cart = useCart();
  const store = useStore();
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (!cart.ready || done.current) return;
    done.current = true;
    if (items.length) { cart.clear(); for (const i of items) cart.add(i.variantId, i.quantity, i.note); }
    router.replace(store.href("/cart"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.ready]);
  return <p className="py-20 text-center text-(--sp-muted)">جاري تجهيز سلتك…</p>;
}
