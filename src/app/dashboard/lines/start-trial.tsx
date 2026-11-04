"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { LINE_INFO, type ProductLine } from "@/lib/product-lines";
import { startLineTrialAction } from "./actions";

export function StartTrialButton({ line, label }: { line: ProductLine; label: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <Button loading={pending} onClick={() => start(async () => {
      const r = await startLineTrialAction(line);
      if (!r.ok) return toast(r.error, "error");
      toast(`باهي! بدت تجربة ${LINE_INFO[line].brand}`);
      router.push(LINE_INFO[line].home);
    })}>{label}</Button>
  );
}
