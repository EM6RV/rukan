"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** يحفظ فورم بزر وإشعار نجاح/خطأ */
export function useSave(action: (input: unknown) => Promise<{ ok: boolean; error?: string }>) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = (input: unknown) => {
    setError(null);
    start(async () => {
      const r = await action(input);
      if (!r.ok) return setError(r.error ?? "صار خطأ");
      toast("تم الحفظ");
      router.refresh();
    });
  };
  return { save, pending, error };
}

export function Footer({ pending, error, disabled }: { pending: boolean; error: string | null; disabled: boolean }) {
  return (
    <div className="space-y-3 border-t border-line pt-4">
      {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{error}</p>}
      <Button type="submit" loading={pending} disabled={disabled}>حفظ</Button>
    </div>
  );
}
