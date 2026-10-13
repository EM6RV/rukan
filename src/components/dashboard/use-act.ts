"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

export type ActResult = { ok: boolean; error?: string };

/** ينفذ أكشن ويعرض خطأ/نجاح ويحدّث الصفحة (مشترك بين نماذج اللوحات) */
export function useAct() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<ActResult>, success: string, onDone?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "صار خطأ");
      toast(success);
      onDone?.();
      router.refresh();
    });
  };
  return { act, pending, error, setError };
}

export const errorClass = "rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg";
