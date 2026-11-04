"use client";

import { useState } from "react";
import { BadgeCheck, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { useAct, errorClass } from "@/components/dashboard/use-act";
import { formatDate } from "@/lib/datetime";
import { cn } from "@/lib/cn";
import type { ReviewStatus } from "@/server/reviews";
import { deleteReviewAction, moderateReviewAction } from "./actions";

type Row = { id: string; product: string; name: string; rating: number; body: string | null; status: ReviewStatus; verified: boolean; at: number };
const TABS: { key: ReviewStatus | "all"; label: string }[] = [
  { key: "pending", label: "بانتظار الموافقة" }, { key: "approved", label: "معتمدة" }, { key: "rejected", label: "مرفوضة" }, { key: "all", label: "الكل" },
];

export function ReviewManager({ reviews, canEdit }: { reviews: Row[]; canEdit: boolean }) {
  const { act, pending, error } = useAct();
  const [tab, setTab] = useState<ReviewStatus | "all">("pending");
  const shown = reviews.filter((r) => tab === "all" || r.status === tab);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((x) => (
          <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)} className={cn("rounded-full border px-4 py-1.5 text-sm transition-colors", tab === x.key ? "border-navy bg-navy text-white" : "border-line hover:bg-surface")}>
            {x.label} ({x.key === "all" ? reviews.length : reviews.filter((r) => r.status === x.key).length})
          </button>
        ))}
      </div>
      {error && <p role="alert" className={errorClass}>{error}</p>}
      {shown.length === 0 ? <EmptyState icon={<Star className="size-6" />} title="ما فيه تقييمات هنا" description="الزبون يقيّم المنتج من صفحته بعد ما تتسلم طلبيته." /> : (
        <ul className="grid gap-3">
          {shown.map((r) => (
            <li key={r.id}>
              <Card className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.name}</span>
                  {r.verified && <Badge tone="success"><BadgeCheck className="size-3.5" aria-hidden /> مشترٍ موثّق</Badge>}
                  <span className="text-gold" aria-label={`${r.rating} من 5`}>{"★".repeat(r.rating)}<span className="text-line">{"★".repeat(5 - r.rating)}</span></span>
                  <span className="flex-1" />
                  <span className="text-xs text-muted">{formatDate(new Date(r.at))}</span>
                </div>
                <p className="text-sm text-muted">على: {r.product}</p>
                {r.body && <p className="leading-7">{r.body}</p>}
                {canEdit && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {r.status !== "approved" && <Button size="sm" disabled={pending} onClick={() => act(() => moderateReviewAction(r.id, "approved"), "تم اعتماد التقييم")}>اعتماد</Button>}
                    {r.status !== "rejected" && <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => moderateReviewAction(r.id, "rejected"), "تم رفض التقييم")}>رفض</Button>}
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => deleteReviewAction(r.id), "تم الحذف")}>حذف</Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
