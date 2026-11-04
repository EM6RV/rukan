"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { enterDelay, enterItem } from "@/components/ui/motion";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import type { AbandonedCartRow } from "@/server/marketing/abandoned-carts";
import { dismissCartAction, markRemindedAction } from "./actions";

type Row = AbandonedCartRow & { whatsappUrl: string | null };

export function CartList({ rows, writable }: { rows: Row[]; writable: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [reminded, setReminded] = useState<Set<string>>(new Set());

  function remind(id: string) {
    setReminded((s) => new Set(s).add(id));
    start(async () => {
      try { await markRemindedAction(id); router.refresh(); } catch { /* التذكير نفسه اتفتح في واتساب، تسجيله مش حرج */ }
    });
  }
  function dismiss(id: string) {
    start(async () => {
      let r: Awaited<ReturnType<typeof dismissCartAction>>;
      try { r = await dismissCartAction(id); } catch { return toast("ما قدرنا نوصل للسيرفر. تأكد من الإنترنت وجرّب مرة ثانية.", "error"); }
      if (!r.ok) return toast(r.error, "error");
      toast("تم تجاهل السلة");
      router.refresh();
    });
  }

  return (
    <ul className="space-y-3">
      {rows.map((c, i) => {
        const done = !!c.remindedAt || reminded.has(c.id);
        return (
          <li key={c.id} style={enterDelay(i)} className={enterItem}>
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{c.name ?? "زبون"} {done && <Badge tone="success">تم التذكير</Badge>}</p>
                  <p className="text-sm text-muted"><bdi dir="ltr">{c.phone}</bdi> · آخر نشاط {formatDateTime(c.updatedAt)}</p>
                </div>
                <p className="text-lg font-bold tabular-nums">{formatMoney(c.total)}</p>
              </div>
              <p className="text-sm text-muted">{c.items.map((it) => `${it.name}${it.variantLabel ? ` (${it.variantLabel})` : ""} × ${it.quantity}`).join("، ")}</p>
              <div className="flex flex-wrap gap-2">
                {c.whatsappUrl ? (
                  <a href={c.whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => writable && remind(c.id)}
                    className="inline-flex h-11 items-center gap-2 rounded-md bg-gold px-5 font-semibold text-navy hover:brightness-95"><MessageCircle className="size-4" aria-hidden /> ذكّره على واتساب</a>
                ) : <span className="text-sm text-muted">الرقم ما يقبلش واتساب</span>}
                <Button variant="ghost" size="sm" disabled={!writable || pending} onClick={() => dismiss(c.id)}><Trash2 className="size-4" aria-hidden /> تجاهل</Button>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
