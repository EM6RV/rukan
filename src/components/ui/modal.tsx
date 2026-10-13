"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

// مبني على <dialog> الأصلي: يعطينا focus trap وESC وطبقة top-layer بدون مكتبات.
export function Modal({
  open, onClose, title, children, footer, className,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="modal-title"
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-line bg-surface p-0 text-fg shadow-lift",
        "backdrop:bg-navy/50 backdrop:backdrop-blur-[2px] open:animate-[modal-in_0.18s_ease-out]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-line p-5">
        <h2 id="modal-title" className="text-lg">{title}</h2>
        <button onClick={onClose} aria-label="إغلاق" className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg">
          <X className="size-5" />
        </button>
      </div>
      <div className="p-5">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line p-4">{footer}</div>}
    </dialog>
  );
}
