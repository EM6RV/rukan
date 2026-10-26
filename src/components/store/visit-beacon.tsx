"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "./store-context";

const kindOf = (path: string) => (/\/product\//.test(path) ? "product" : /\/category\//.test(path) ? "category" : /\/checkout/.test(path) ? "checkout" : /\/cart/.test(path) ? "cart" : /\/(search|page|track|order|favorites|recover)/.test(path) ? "other" : "home");

/** عدّاد زيارات بدون كوكيز: أول صفحة في التبويب = زيارة، وكل صفحة = مشاهدة. المصدر من utm/referrer. */
export function VisitBeacon() {
  const store = useStore();
  const path = usePathname();
  useEffect(() => {
    try {
      const first = !sessionStorage.getItem("rukn-visit");
      let source: string | null = null;
      if (first) {
        sessionStorage.setItem("rukn-visit", "1");
        const q = new URLSearchParams(location.search);
        source = q.get("utm_source") || q.get("ref");
        if (!source && document.referrer) { try { const u = new URL(document.referrer); if (u.host !== location.host) source = u.host; } catch { /* referrer غير صالح */ } }
        if (source) sessionStorage.setItem("rukn-src", source);
      } else source = sessionStorage.getItem("rukn-src");
      const productMatch = path.match(/\/product\/([^/?#]+)/);
      fetch(store.href("/hit"), {
        method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: kindOf(path), slug: productMatch ? decodeURIComponent(productMatch[1]!) : null, source, session: first }),
      }).catch(() => {});
    } catch { /* التخزين غير متاح */ }
  }, [path, store]);
  return null;
}
