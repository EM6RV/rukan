"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { submitReviewAction } from "@/app/s/[key]/actions";
import type { ReviewSummary } from "@/server/reviews";
import { useStore } from "./store-context";
import { getKit } from "./templates";

export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex text-(--sa-text)", className)} role="img" aria-label={`${value} من 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn("size-4", i <= Math.round(value) ? "fill-current" : "opacity-30")} aria-hidden />)}
    </span>
  );
}

/** تقييمات المنتج + نموذج تقييم للمشتري (رقم الطلبية + الهاتف) */
export function ReviewsSection({ productId, summary, storeKey }: { productId: string; summary: ReviewSummary; storeKey: string }) {
  const store = useStore();
  const kit = getKit(store.template);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await submitReviewAction(storeKey, { productId, orderNumber: f.get("order"), phone: f.get("phone"), rating, body: f.get("body") });
      if (r.ok) setDone(true); else setError(r.error);
    });
  }

  return (
    <section aria-label="التقييمات" className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">التقييمات</h2>
        {summary.count > 0 && <span className="flex items-center gap-2 text-sm"><Stars value={summary.average} /> <b>{summary.average}</b> <span className="text-(--sp-muted)">({summary.count})</span></span>}
        <span className="flex-1" />
        {!done && <button type="button" onClick={() => setOpen((o) => !o)} className={kit.cls.btnOutline} aria-expanded={open}>قيّم المنتج</button>}
      </div>
      {done && <p role="status" className={cn(kit.cls.panel, "text-center font-semibold")}>شكراً! تقييمك وصل وبيظهر بعد ما يراجعه المتجر.</p>}
      {open && !done && (
        <form onSubmit={submit} className={cn(kit.cls.panel, "grid gap-3 sm:grid-cols-2")}>
          <p className="text-sm text-(--sp-muted) sm:col-span-2">التقييم لمن استلم طلبيته فقط: اكتب رقم طلبيتك والهاتف اللي طلبت بيه.</p>
          <input name="order" inputMode="numeric" required placeholder="رقم الطلبية" aria-label="رقم الطلبية" className={kit.cls.input} />
          <input name="phone" inputMode="tel" required placeholder="رقم الهاتف" aria-label="رقم الهاتف" className={kit.cls.input} />
          <div className="flex items-center gap-1 sm:col-span-2" role="radiogroup" aria-label="التقييم">
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} نجوم`} onClick={() => setRating(i)} className="p-1 text-(--sa-text)">
                <Star className={cn("size-7", i <= rating && "fill-current")} />
              </button>
            ))}
          </div>
          <textarea name="body" maxLength={600} rows={3} placeholder="رأيك في المنتج (اختياري)" aria-label="رأيك" className={cn(kit.cls.input, "sm:col-span-2")} />
          {error && <p role="alert" className="text-sm font-semibold text-red-700 sm:col-span-2">{error}</p>}
          <button className={cn(kit.cls.btn, "sm:col-span-2")} disabled={pending}>{pending ? "جاري الإرسال…" : "أرسل التقييم"}</button>
        </form>
      )}
      {summary.items.length === 0 ? <p className="text-sm text-(--sp-muted)">لسه ما فيه تقييمات. كن أول من يقيّم!</p> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {summary.items.map((r) => (
            <li key={r.id} className={cn(kit.cls.panel, "space-y-1.5")}>
              <div className="flex items-center gap-2"><Stars value={r.rating} /><b className="text-sm">{r.name}</b>{r.verified && <span className="inline-flex items-center gap-1 text-xs text-green-800"><BadgeCheck className="size-3.5" aria-hidden /> مشترٍ موثّق</span>}</div>
              {r.body && <p className="leading-7">{r.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
