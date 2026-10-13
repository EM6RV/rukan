"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Eye, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { STORE_SAVED_EVENT } from "@/lib/preview-signal";

const query = "(min-width: 1024px)";
const subscribe = (cb: () => void) => { const m = matchMedia(query); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
const useIsDesktop = () => useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => false);

function Frame({ slug, path, device }: { slug: string; path: string; device: "mobile" | "desktop" }) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const reload = () => setVersion((v) => v + 1);
    window.addEventListener(STORE_SAVED_EVENT, reload);
    return () => window.removeEventListener(STORE_SAVED_EVENT, reload);
  }, []);
  return (
    <div>
      <div className="mb-1 flex justify-end"><button type="button" onClick={() => setVersion((v) => v + 1)} aria-label="تحديث المعاينة" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:text-fg"><RefreshCw className="size-3.5" aria-hidden /> تحديث</button></div>
      <iframe
        key={version} title="معاينة المتجر" src={`/s/${encodeURIComponent(slug)}${path}`}
        className={cn("mx-auto block h-[34rem] max-h-[70vh] rounded-xl border border-line bg-white shadow-soft", device === "mobile" ? "w-[22rem] max-w-full" : "w-full")}
      />
    </div>
  );
}

/** معاينة المتجر: mode="aside" جنب النموذج على الشاشات الكبيرة، و mode="button" زر يفتح نافذة على الموبايل. تتحدث تلقائياً بعد كل حفظ. */
export function StorePreview({ slug, path = "", mode }: { slug: string; path?: string; mode: "aside" | "button" }) {
  const desktop = useIsDesktop();
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [open, setOpen] = useState(false);

  // كل موضع يتعرض في نطاقه بس، علشان ما يتحمّلش iframe مرتين
  if (mode === "button" && desktop) return null;
  if (mode === "aside" && !desktop) return null;
  if (mode === "button") {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Eye className="size-4" aria-hidden /> معاينة المتجر</Button>
        {open && <Modal open onClose={() => setOpen(false)} title="معاينة المتجر" className="max-w-md"><div className="pt-8"><Frame slug={slug} path={path} device="mobile" /></div></Modal>}
      </>
    );
  }
  return (
    <aside aria-label="معاينة المتجر" className="sticky top-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base">معاينة مباشرة</h2>
        <div className="flex rounded-md border border-line bg-surface p-0.5">
          {([["mobile", Smartphone, "موبايل"], ["desktop", Monitor, "كمبيوتر"]] as const).map(([k, Icon, label]) => (
            <button key={k} type="button" onClick={() => setDevice(k)} aria-pressed={device === k} aria-label={label} className={cn("rounded px-2 py-1", device === k ? "bg-gold/25" : "text-muted")}><Icon className="size-4" /></button>
          ))}
        </div>
      </div>
      <div className="pt-6"><Frame slug={slug} path={path} device={device} /></div>
    </aside>
  );
}
