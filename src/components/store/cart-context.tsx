"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

export type CartItem = { variantId: string; quantity: number; note?: string };
type Cart = {
  items: CartItem[];
  count: number;
  ready: boolean;
  add: (variantId: string, quantity?: number, note?: string) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
};

const CartContext = createContext<Cart | null>(null);
const MAX_QTY = 20;

const read = (text: string): CartItem[] => {
  try {
    const raw = JSON.parse(text) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((i): i is CartItem => !!i && typeof i.variantId === "string" && Number.isInteger(i.quantity) && i.quantity > 0)
      .slice(0, 50)
      .map((i) => ({ variantId: i.variantId, quantity: Math.min(i.quantity, MAX_QTY), ...(typeof i.note === "string" && i.note.trim() ? { note: i.note.trim().slice(0, 200) } : {}) }));
  } catch {
    return [];
  }
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb); // تغييرات التبويبات الثانية
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
};
const noop = () => () => {};

/** السلة في متصفح الزبون (localStorage) لكل متجر. الأسعار والمخزون يتحققوا منهم السيرفر عند الطلب. */
export function CartProvider({ storeId, children }: { storeId: string; children: React.ReactNode }) {
  const storageKey = `rukn-cart:${storeId}`;
  // النص الخام هو الـ snapshot (قيمة بدائية = مقارنة مستقرة)، والبنود تتحسب منه
  const raw = useSyncExternalStore(
    subscribe,
    () => { try { return localStorage.getItem(storageKey) ?? "[]"; } catch { return "[]"; } },
    () => "[]",
  );
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const items = useMemo(() => read(raw), [raw]);

  const commit = useCallback((next: CartItem[]) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
    notify();
  }, [storageKey]);

  const value = useMemo<Cart>(() => ({
    items, ready,
    count: items.reduce((s, i) => s + i.quantity, 0),
    add: (variantId, quantity = 1, note) => {
      const found = items.find((i) => i.variantId === variantId);
      const n = note?.trim() ? { note: note.trim().slice(0, 200) } : {};
      commit(found ? items.map((i) => (i === found ? { ...i, ...n, quantity: Math.min(MAX_QTY, i.quantity + quantity) } : i)) : [...items, { variantId, quantity: Math.min(MAX_QTY, quantity), ...n }]);
    },
    setQuantity: (variantId, quantity) => commit(items.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.max(1, Math.min(MAX_QTY, quantity)) } : i))),
    remove: (variantId) => commit(items.filter((i) => i.variantId !== variantId)),
    clear: () => commit([]),
  }), [items, ready, commit]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): Cart {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart لازم يكون داخل CartProvider");
  return ctx;
}
