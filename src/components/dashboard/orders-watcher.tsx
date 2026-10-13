"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/money";

type Pulse = { newCount: number; latest: { id: string; number: number; customerName: string; total: number } | null };

const INTERVAL_MS = 30_000;

/** يفحص كل 30 ثانية لو وصلت طلبية جديدة ويطلع تنبيه + يحدّث الشارة والقوائم */
export function OrdersWatcher({ initialLatestId }: { initialLatestId: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const lastId = useRef(initialLatestId);

  useEffect(() => {
    let stopped = false;
    async function check() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/dashboard/pulse", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const pulse = (await res.json()) as Pulse;
        if (pulse.latest && pulse.latest.id !== lastId.current) {
          lastId.current = pulse.latest.id;
          toast(`طلبية جديدة وصلتك #${pulse.latest.number} من ${pulse.latest.customerName} (${formatMoney(pulse.latest.total)})`);
          router.refresh();
        }
      } catch {
        /* الشبكة وقعت: نحاول في الدورة الجاية */
      }
    }
    const timer = setInterval(check, INTERVAL_MS);
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [router, toast]);

  return null;
}
