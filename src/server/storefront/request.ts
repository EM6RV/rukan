import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { getEnv } from "@/lib/env";
import { resolveHost } from "@/lib/host";
import { computeStoreAccess, isStoreOpenToCustomers } from "../store-access";
import { getStorefront } from "./data";
import type { Storefront } from "./types";

export const decodeKey = (key: string) => {
  try { return decodeURIComponent(key); } catch { return key; }
};

/** بيانات المتجر (من الكاش) مع dedupe داخل نفس الطلب */
export const loadStore = cache(async (key: string): Promise<Storefront | null> => getStorefront(decodeKey(key)));

export const storeAccessOf = (sf: Storefront) =>
  computeStoreAccess({ status: sf.status, trialEndsAt: sf.trialEndsAt ? new Date(sf.trialEndsAt) : null, currentPeriodEnd: sf.currentPeriodEnd ? new Date(sf.currentPeriodEnd) : null });

export const isStoreOpen = (sf: Storefront) => isStoreOpenToCustomers(storeAccessOf(sf));

/** بادئة الروابط والـ origin حسب طريقة الوصول: دومين/ساب دومين (بدون بادئة) أو /s/key (تطوير) */
export const getRequestContext = cache(async (key: string) => {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
  const target = resolveHost(host, getEnv().ROOT_DOMAIN);
  const base = target.type === "store" ? "" : `/s/${encodeURIComponent(decodeKey(key))}`;
  return { origin: `${proto}://${host}`, base };
});
