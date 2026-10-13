"use client";

import { createContext, useContext, useMemo } from "react";
import type { StoreTemplate } from "@/lib/constants";

export type StoreInfo = {
  id: string; key: string; name: string; template: StoreTemplate; logoMediaId: string | null;
  /** بادئة الروابط: "" على الدومين/الساب دومين، "/s/slug" في وضع التطوير */
  base: string;
  whatsapp: string | null; // بصيغة دولية 218…
  currency: string;
  announcementBar: string | null;
  categories: { slug: string; name: string }[];
  pages: { slug: string; title: string }[];
  social: { instagram: string | null; tiktok: string | null; facebook: string | null; snapchat: string | null };
  contact: { phone: string | null; email: string | null; address: string | null };
  footerText: string | null;
  showBranding: boolean;
  pixels: { meta: string | null; tiktok: string | null };
  freeDeliveryOver: number | null;
};

type Ctx = StoreInfo & { href: (path: string) => string };
const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ info, children }: { info: StoreInfo; children: React.ReactNode }) {
  const value = useMemo<Ctx>(() => ({ ...info, href: (path) => `${info.base}${path === "/" ? "" : path}` || "/" }), [info]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore لازم يكون داخل StoreProvider");
  return ctx;
}
