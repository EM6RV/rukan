"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2, Truck } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import type { CartLine } from "@/server/storefront/types";
import { resolveCartAction } from "@/app/s/[key]/actions";
import { useCart } from "./cart-context";
import { useStore } from "./store-context";
import { getKit } from "./templates";
import { MediaImage, Price } from "./ui";

/** يجيب بنود السلة بأسعار ومخزون حقيقيين من السيرفر ويزامن السلة (يشيل غير المتاح ويقص الكميات) */
export function useResolvedCart() {
  const { key } = useStore();
  const cart = useCart();
  const [lines, setLines] = useState<CartLine[] | null>(null);
  const sig = JSON.stringify(cart.items);

  useEffect(() => {
    if (!cart.ready) return;
    if (cart.items.length === 0) { setLines([]); return; } // eslint-disable-line react-hooks/set-state-in-effect
    let cancelled = false;
    resolveCartAction(key, cart.items).then((resolved) => {
      if (cancelled) return;
      setLines(resolved);
      // مزامنة: بنود اختفت أو كميات أكبر من المخزون
      for (const item of cart.items) {
        const line = resolved.find((l) => l.variantId === item.variantId);
        if (!line) cart.remove(item.variantId);
        else if (line.quantity < item.quantity) cart.setQuantity(item.variantId, line.quantity);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, cart.ready, key]);

  const qty = useMemo(() => new Map(cart.items.map((i) => [i.variantId, i.quantity])), [cart.items]);
  const shown = useMemo(() => (lines ?? []).filter((l) => qty.has(l.variantId)).map((l) => ({ ...l, quantity: Math.min(qty.get(l.variantId) ?? l.quantity, l.stock) })), [lines, qty]);
  const subtotal = shown.reduce((s, l) => s + l.price * l.quantity, 0);
  return { lines: shown, loading: lines === null || !cart.ready, subtotal, cart };
}

export function CartView() {
  const store = useStore();
  const kit = getKit(store.template);
  const { lines, loading, subtotal, cart } = useResolvedCart();

  if (loading) return <div className={cn(kit.cls.panel, "animate-pulse py-16 text-center text-(--sp-muted)")}>جاري تحميل السلة…</div>;
  if (lines.length === 0) {
    return (
      <div className={cn(kit.cls.panel, "mx-auto max-w-md space-y-4 py-14 text-center")}>
        <ShoppingBag className="mx-auto size-14 text-(--sp-muted)" />
        <h2 className="text-xl font-bold">سلتك فاضية</h2>
        <p className="text-(--sp-muted)">أضف منتجات وارجع هنا لإتمام الطلب.</p>
        <Link href={store.href("/search")} className={kit.cls.btn}>تصفّح المنتجات</Link>
      </div>
    );
  }

  const over = store.freeDeliveryOver;
  const remaining = over !== null ? Math.max(0, over - subtotal) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        {remaining !== null && (
          <div className={cn(kit.cls.panel, "space-y-2 !p-4")}>
            <p className="flex items-center gap-2 text-sm font-semibold"><Truck className="size-4" /> {remaining > 0 ? `باقي ${formatMoney(remaining)} للتوصيل المجاني` : "مبروك! توصيلك مجاني 🎉"}</p>
            <div className="h-2 overflow-hidden rounded-full bg-(--sp-line)"><div className="h-full bg-(--sa) transition-all" style={{ width: `${Math.min(100, (subtotal / over!) * 100)}%` }} /></div>
          </div>
        )}
        <ul className="divide-y divide-(--sp-line) border-y border-(--sp-line)">
          {lines.map((l) => (
            <li key={l.variantId} className="flex gap-4 py-5">
              <Link href={store.href(`/product/${encodeURIComponent(l.slug)}`)} className="size-24 shrink-0 overflow-hidden bg-(--sp-soft) sm:size-28">
                {l.image && <MediaImage id={l.image} alt={l.name} sizes="112px" widths={[160, 320]} />}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                <div>
                  <Link href={store.href(`/product/${encodeURIComponent(l.slug)}`)} className="line-clamp-2 font-semibold hover:underline">{l.name}</Link>
                  {l.variantLabel && <p className="text-sm text-(--sp-muted)">{l.variantLabel}</p>}
                  <Price price={l.price} compareAt={l.compareAt} size="sm" />
                  {l.stock <= 3 && <p className="text-xs font-semibold text-(--sa-text)">باقي {l.stock} فقط</p>}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 items-center border border-(--sp-line)" role="group" aria-label={`كمية ${l.name}`}>
                    <button type="button" aria-label="نقص" disabled={l.quantity <= 1} onClick={() => cart.setQuantity(l.variantId, l.quantity - 1)} className="flex size-10 items-center justify-center disabled:opacity-30"><Minus className="size-4" /></button>
                    <span className="w-7 text-center text-sm font-semibold">{l.quantity}</span>
                    <button type="button" aria-label="زيادة" disabled={l.quantity >= Math.min(l.stock, 20)} onClick={() => cart.setQuantity(l.variantId, l.quantity + 1)} className="flex size-10 items-center justify-center disabled:opacity-30"><Plus className="size-4" /></button>
                  </div>
                  <span className="font-bold">{formatMoney(l.price * l.quantity)}</span>
                  <button type="button" aria-label={`حذف ${l.name}`} onClick={() => cart.remove(l.variantId)} className="flex size-10 items-center justify-center text-(--sp-muted) hover:text-red-700"><Trash2 className="size-5" /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <aside className={cn(kit.cls.panel, "h-fit space-y-4 lg:sticky lg:top-28")}>
        <h2 className="text-lg font-bold">ملخص الطلبية</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt>المجموع</dt><dd className="font-semibold">{formatMoney(subtotal)}</dd></div>
          <div className="flex justify-between text-(--sp-muted)"><dt>التوصيل</dt><dd>يتحسب حسب مدينتك</dd></div>
        </dl>
        <Link href={store.href("/checkout")} className={cn(kit.cls.btn, "w-full")}>إتمام الطلب</Link>
        <Link href={store.href("/search")} className="block text-center text-sm font-medium text-(--sp-muted) hover:text-(--sp)">متابعة التسوق</Link>
      </aside>
    </div>
  );
}
