"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const DISMISS_KEYS = { store: "rukn-install-dismissed", admin: "rukn-admin-install-dismissed" } as const;
const DISMISS_MS = 14 * 86_400_000;

const dismissedRecently = (key: string) => { try { return Date.now() - Number(localStorage.getItem(key) ?? 0) < DISMISS_MS; } catch { return false; } };

/**
 * يسجّل service worker (للإشعارات والتثبيت)، ويعرض شريط «ثبّت رُكن على جوالك»:
 * أندرويد/كروم عبر beforeinstallprompt، وآيفون بتعليمات «إضافة إلى الشاشة الرئيسية».
 */
export function PwaSetup({ app = "store" }: { app?: "store" | "admin" }) {
  const dismissKey = DISMISS_KEYS[app];
  const name = app === "admin" ? "أدمن رُكن" : "رُكن";
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || dismissedRecently(dismissKey)) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstall(null));
    // آيفون ما عنده beforeinstallprompt: نعرض التعليمات (بعد الرسم الأول علشان ما يختلفش عن الـ SSR)
    const timer = /iphone|ipad|ipod/i.test(navigator.userAgent) ? setTimeout(() => setIos(true), 0) : undefined;
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); if (timer) clearTimeout(timer); };
  }, [dismissKey]);

  function dismiss() {
    try { localStorage.setItem(dismissKey, String(Date.now())); } catch { /* التخزين غير متاح: يظهر الشريط بالجلسة الجاية */ }
    setInstall(null);
    setIos(false);
  }
  async function doInstall() {
    if (!install) return;
    await install.prompt();
    const r = await install.userChoice;
    if (r.outcome === "accepted") setInstall(null); else dismiss();
  }

  if (!install && !ios) return null;
  return (
    // بطاقة عائمة فوق الشريط السفلي (مش داخل الصفحة) باش ظهورها المتأخر ما يحرّكش المحتوى (CLS)
    <div role="region" aria-label="تثبيت التطبيق" className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex animate-[toast-in_0.2s_ease-out_both] items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm shadow-lift lg:inset-x-auto lg:bottom-4 lg:end-4 lg:max-w-md">
      {install ? <Download className="size-5 shrink-0" aria-hidden /> : <Share className="size-5 shrink-0" aria-hidden />}
      <p className="min-w-0 flex-1">
        {install ? (app === "admin" ? "ثبّت لوحة الأدمن على جوالك: أيقونة لوحدها تفتح بنقرة." : "ثبّت رُكن على جوالك: يفتح بنقرة، وتوصلك إشعارات الطلبيات.") : `ثبّت ${name} على جوالك: من زر المشاركة اختر «إضافة إلى الشاشة الرئيسية».`}
      </p>
      {install && <Button size="sm" onClick={doInstall}>تثبيت</Button>}
      <button type="button" onClick={dismiss} aria-label="إغلاق" className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"><X className="size-4" aria-hidden /></button>
    </div>
  );
}
