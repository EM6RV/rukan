"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

// درج جانبي (من الجنب على الكمبيوتر، ومن تحت على الموبايل). مبني على <dialog> زي النافذة: focus trap وESC بدون مكتبات.
export function Drawer({
  open, onClose, title, children, footer, className,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="drawer-title"
      className={cn(
        "m-0 mt-auto flex max-h-[85dvh] w-full max-w-none flex-col rounded-t-2xl border border-line bg-surface p-0 text-fg not-open:hidden",
        "sm:ms-auto sm:mt-0 sm:h-dvh sm:max-h-none sm:w-[26rem] sm:rounded-none sm:rounded-s-2xl",
        "backdrop:bg-navy/40 open:animate-[drawer-up_0.22s_ease-out] sm:open:animate-[drawer-in_0.22s_ease-out]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id="drawer-title" className="text-lg">{title}</h2>
        <button onClick={onClose} aria-label="إغلاق" className="flex size-10 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"><X className="size-5" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line p-4">{footer}</div>}
    </dialog>
  );
}
