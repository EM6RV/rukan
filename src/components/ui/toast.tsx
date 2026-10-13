"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "success" | "error" | "info";
type ToastItem = { id: number; message: string; tone: Tone };
type Ctx = { toast: (message: string, tone?: Tone) => void };

const ToastContext = createContext<Ctx | null>(null);

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast لازم يكون داخل ToastProvider");
  return ctx;
}

const icons = { success: CheckCircle2, error: TriangleAlert, info: Info } as const;
const toneClass = {
  success: "text-success-fg",
  error: "text-danger-fg",
  info: "text-link",
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
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
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const Icon = icons[t.tone];
            return (
              <motion.div
                key={t.id}
                role={t.tone === "error" ? "alert" : "status"}
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-lift"
              >
                <Icon className={cn("size-5 shrink-0", toneClass[t.tone])} aria-hidden />
                <p className="flex-1 text-sm">{t.message}</p>
                <button onClick={() => dismiss(t.id)} aria-label="إغلاق" className="text-muted hover:text-fg">
                  <X className="size-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
