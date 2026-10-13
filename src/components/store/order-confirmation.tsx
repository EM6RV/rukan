"use client";

import { useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { trackPixel } from "@/lib/pixels";
import { useCart } from "./cart-context";

/** بعد نجاح الطلب: يفرّغ السلة ويرسل حدث Purchase مرة وحدة (حتى لو الصفحة اتحدّثت) */
export function OrderPurchaseEffects({ token }: { token: string }) {
  const cart = useCart();
  const { ready, clear } = cart;
  useEffect(() => {
    if (!ready) return;
    clear();
    try {
      const k = `rukn-purchase:${token}`;
      const raw = sessionStorage.getItem(k);
      if (raw) {
        const p = JSON.parse(raw) as { total: number; number: number; count: number };
        trackPixel({ name: "Purchase", value: p.total, orderNumber: p.number, count: p.count });
        sessionStorage.removeItem(k);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token]);
  return null;
}

export function WhatsAppConfirmButton({ href, className }: { href: string; className: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      <MessageCircle className="size-5" /> أكّد طلبيتك على واتساب
    </a>
  );
}
