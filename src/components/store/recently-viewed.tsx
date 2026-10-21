"use client";

import { useEffect, useState } from "react";
import type { CardProduct } from "@/server/storefront/types";
import { useStore } from "./store-context";
import { getKit } from "./templates";

type Snap = Pick<CardProduct, "id" | "slug" | "name" | "price" | "compareAt" | "thumb">;
const KEY = (storeId: string) => `rukn-rv-${storeId}`;
const read = (storeId: string): Snap[] => { try { return JSON.parse(localStorage.getItem(KEY(storeId)) ?? "[]") as Snap[]; } catch { return []; } };

/** «شفتها مؤخراً»: آخر منتجات شافها الزبون (محفوظة في جهازه فقط، بدون تتبع)، ويسجّل المنتج الحالي */
export function RecentlyViewed({ current }: { current: Snap }) {
  const store = useStore();
  const kit = getKit(store.template);
  const [items, setItems] = useState<Snap[]>([]);

  useEffect(() => {
    const prev = read(store.id).filter((p) => p.id !== current.id);
    // الأسعار تتحدث كل ما الزبون يرجع للمنتج؛ نعرض غير المنتج الحالي
    setItems(prev.slice(0, 4)); // eslint-disable-line react-hooks/set-state-in-effect
    try { localStorage.setItem(KEY(store.id), JSON.stringify([current, ...prev].slice(0, 8))); } catch { /* التخزين غير متاح */ }
  }, [store.id, current]);

  if (items.length === 0) return null;
  return (
    <section aria-label="شفتها مؤخراً">
      <kit.SectionTitle title="شفتها مؤخراً" />
      <div className={kit.cls.productGrid}>
        {items.map((p) => <kit.ProductCard key={p.id} product={{ ...p, maxPrice: p.price, thumb2: null, inStock: true, isFeatured: false, hasOptions: false }} />)}
      </div>
    </section>
  );
}
