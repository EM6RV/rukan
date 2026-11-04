"use client";

import { useRef, useState } from "react";
import { CheckinPanel, type Shown } from "./checkin-panel";

export function KioskScreen() {
  const [shop, setShop] = useState("");
  const token = useRef<string | null>(null);
  const tokenOf = () => (token.current ??= new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "");
  const onCheck = async (code: string): Promise<Shown> => {
    try {
      const res = await fetch("/api/gym/kiosk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: tokenOf(), code }) });
      const j = await res.json();
      if (j.shop) setShop(j.shop);
      if (!res.ok && !("ok" in j)) return { ok: false, name: null, text: j.error ?? "صار خطأ", at: Date.now() };
      if (j.ok) return { ok: true, name: j.name, text: j.visitsLeft !== null ? `باقي ${j.visitsLeft} حصة · ${j.daysLeft} يوم` : `باقي ${j.daysLeft} يوم`, sub: j.warn, at: Date.now() };
      return { ok: false, name: j.name, text: j.reason ?? "ما ينفعش الدخول", at: Date.now() };
    } catch { return { ok: false, name: null, text: "ما فيش اتصال. كلّم الاستقبال.", at: Date.now() }; }
  };
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-6 bg-navy p-6 text-fg" dir="rtl">
      <h1 className="text-center font-heading text-4xl text-white">{shop || "أهلاً بيك"}</h1>
      <div className="mx-auto w-full max-w-2xl rounded-3xl bg-bg p-6"><CheckinPanel onCheck={onCheck} camera big hint="امسح QR بطاقتك أو اكتب رقم هاتفك" /></div>
    </main>
  );
}
