"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CardProduct } from "@/server/storefront/types";
import { useStore } from "./store-context";
import { getKit } from "./templates";

export type FavSnap = Pick<CardProduct, "id" | "slug" | "name" | "price" | "compareAt" | "thumb">;
const KEY = (storeId: string) => `rukn-fav-${storeId}`;
const listeners = new Set<() => void>();
const raw = (storeId: string) => { try { return localStorage.getItem(KEY(storeId)) ?? "[]"; } catch { return "[]"; } };

/** المفضلة محفوظة في جهاز الزبون فقط (بدون حساب) */
function useFavs(storeId: string) {
  const json = useSyncExternalStore(
    (cb) => { listeners.add(cb); window.addEventListener("storage", cb); return () => { listeners.delete(cb); window.removeEventListener("storage", cb); }; },
    () => raw(storeId), () => "[]",
  );
  const items = (() => { try { return JSON.parse(json) as FavSnap[]; } catch { return []; } })();
  const toggle = useCallback((p: FavSnap) => {
    const cur = (() => { try { return JSON.parse(raw(storeId)) as FavSnap[]; } catch { return []; } })();
    const next = cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : [p, ...cur].slice(0, 60);
    try { localStorage.setItem(KEY(storeId), JSON.stringify(next)); } catch { /* التخزين غير متاح */ }
    listeners.forEach((l) => l());
  }, [storeId]);
  return { items, toggle };
}

export function FavoriteButton({ product, className }: { product: FavSnap; className?: string }) {
  const store = useStore();
  const { items, toggle } = useFavs(store.id);
  const on = items.some((x) => x.id === product.id);
  return (
    <button type="button" onClick={() => toggle(product)} aria-pressed={on} aria-label={on ? "شيل من المفضلة" : "أضف للمفضلة"}
      className={cn("inline-flex size-11 items-center justify-center rounded-full border border-(--sp-line) transition-colors hover:border-(--sp)", on && "border-(--sa) text-(--sa-text)", className)}>
      <Heart className={cn("size-5", on && "fill-current")} />
    </button>
  );
}

export function FavoritesList() {
  const store = useStore();
  const kit = getKit(store.template);
  const { items } = useFavs(store.id);
  if (items.length === 0) {
    return <div className={cn(kit.cls.panel, "space-y-3 text-center")}><p>ما ضفت أي منتج للمفضلة لسه. اضغط على القلب في صفحة أي منتج.</p><Link href={store.href("/search")} className={kit.cls.btn}>تصفح المنتجات</Link></div>;
  }
  return <div className={kit.cls.productGrid}>{items.map((p) => <kit.ProductCard key={p.id} product={{ ...p, maxPrice: p.price, thumb2: null, inStock: true, isFeatured: false, hasOptions: false }} />)}</div>;
}
