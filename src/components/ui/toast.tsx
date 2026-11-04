"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "success" | "error" | "info";
type ToastItem = { id: number; message: string; tone: Tone; leaving?: boolean };
type Ctx = { toast: (message: string, tone?: Tone) => void };

const ToastContext = createContext<Ctx | null>(null);

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast لازم يكون داخل ToastProvider");
  return ctx;
}

const icons = { success: CheckCircle2, error: TriangleAlert, info: Info } as const;
const barClass = { success: "border-s-success", error: "border-s-danger", info: "border-s-teal" } as const;
const toneClass = {
  success: "text-success-fg",
  error: "text-danger-fg",
  info: "text-link",
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  // الخروج: نعلّمه «طالع» (حركة CSS قصيرة) وبعدين نشيله. بدون مكتبة حركة باش ما تتحمل في كل صفحة.
  const dismiss = useCallback((id: number) => {
    setItems((l) => l.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 160);
  }, []);
  const toast = useCallback(
    (message: string, tone: Tone = "success") => {
      const id = ++nextId.current;
      setItems((l) => [...l.slice(-3), { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === "error" ? 6000 : 3500);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
          {items.map((t) => {
            const Icon = icons[t.tone];
            return (
              <div
                key={t.id}
                role={t.tone === "error" ? "alert" : "status"}
                className={cn("pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-s-4 border-line bg-surface px-4 py-3 shadow-lift", barClass[t.tone], t.leaving ? "animate-[toast-out_0.16s_ease-in_both]" : "animate-[toast-in_0.2s_ease-out_both]")}
              >
                <Icon className={cn("size-5 shrink-0", toneClass[t.tone])} aria-hidden />
                <p className="flex-1 text-sm">{t.message}</p>
                <button onClick={() => dismiss(t.id)} aria-label="إغلاق" className="text-muted hover:text-fg">
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
      </div>
    </ToastContext.Provider>
  );
}
