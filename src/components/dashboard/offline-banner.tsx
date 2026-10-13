"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** شريط تنبيه (بدون مقاطعة) لما ينقطع الإنترنت، علشان البياع يعرف ليش الحفظ ما يشتغلش */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="flex animate-[fade-up_0.2s_ease-out_both] items-center gap-2 bg-danger/15 px-4 py-2.5 text-sm font-medium text-danger-fg">
      <WifiOff className="size-4 shrink-0" aria-hidden /> ما فيش إنترنت. التعديلات ما راح تنحفظ لين يرجع الاتصال.
    </div>
  );
}
