"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Check, Gift, Package, ShoppingBag, Users } from "lucide-react";
import { DURATIONS, monthlyEquivalent, payOnceText, planPrice, savingsPercent, type BillingPeriod } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { CARD_GROUPS, FEATURE_ROWS, rowLabel } from "@/lib/pricing-features";
import type { PricingPlan } from "@/server/admin/plans";

/** زر الكرت: في الموقع التسويقي «افتح متجرك»، وفي صفحة الاشتراك «اطلب الباقة» (رابط واتساب للدعم) */
export type PricingCta =
  | { kind: "register"; label: string }
  | { kind: "upgrade"; currentPlanId: string | null; currentCycle: BillingPeriod | null; links: Record<string, Partial<Record<BillingPeriod, string>>> | null };

const limitLine = (n: number | null | undefined, one: string, unlimited: string) => (n == null ? unlimited : `${n} ${one}`);

export function PricingTable({ plans, cta, labels, initialCycle }: {
  plans: PricingPlan[]; cta: PricingCta; labels: { popularBadge: string; rows?: Record<string, string> }; initialCycle?: BillingPeriod;
}) {
  const offered = DURATIONS.filter((d) => plans.some((p) => !p.isFree && p.prices[d.key] != null));
  const [cycle, setCycle] = useState<BillingPeriod>(initialCycle && offered.some((d) => d.cycle === initialCycle) ? initialCycle : (offered.find((d) => d.cycle === "yearly") ?? offered[0])?.cycle ?? "monthly");
  const uid = useId();
  // المجانية تبان في كل المدد، والباقي حسب سعره في المدة المختارة
  const shown = plans.filter((p) => p.isFree || planPrice(p, cycle) != null);
  const best = Math.max(0, ...plans.map((p) => savingsPercent(p, "yearly")));

  return (
    <div className="space-y-8">
      {offered.length > 1 && (
        <div role="radiogroup" aria-label="مدة الاشتراك" className="mx-auto flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-full border border-line bg-surface p-1">
          {offered.map((d) => {
            const on = d.cycle === cycle;
            return (
              <button key={d.key} type="button" role="radio" aria-checked={on} onClick={() => setCycle(d.cycle)}
                className={cn("relative rounded-full px-4 py-2 text-sm font-semibold transition-colors", on ? "bg-fg text-bg" : "text-muted hover:text-fg")}>
                {d.toggle}
                {d.cycle === "yearly" && best > 0 && <span className={cn("ms-1.5 text-xs font-bold", on ? "text-gold" : "text-success-fg")}>-{best}%</span>}
              </button>
            );
          })}
        </div>
      )}

      <ul className={cn("mx-auto grid max-w-6xl gap-5", shown.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : shown.length === 3 ? "lg:grid-cols-3" : shown.length === 2 ? "md:grid-cols-2 max-w-3xl" : "max-w-md")}>
        {shown.map((p) => {
          const hot = p.isFeatured;
          const price = p.isFree ? 0 : planPrice(p, cycle)!;
          const cmp = p.isFree ? null : (p.comparePrices[DURATIONS.find((d) => d.cycle === cycle)!.key] ?? null);
          const save = p.isFree ? 0 : savingsPercent(p, cycle);
          const perk = p.isFree ? undefined : p.durationPerks[DURATIONS.find((d) => d.cycle === cycle)!.key];
          const months = DURATIONS.find((d) => d.cycle === cycle)!.months;
          const included = FEATURE_ROWS.filter((r) => r.card && r.value(p) !== false);
          const isCurrent = cta.kind === "upgrade" && cta.currentPlanId === p.id && (p.isFree || cta.currentCycle === cycle);
          const href = cta.kind === "register" ? "/register" : (cta.links?.[p.id]?.[cycle] ?? null);
          return (
            <li key={p.id} className={cn("relative flex flex-col rounded-2xl border bg-surface p-6", hot ? "border-fg ring-1 ring-fg/15" : "border-line")}>
              {hot && <span className="absolute -top-3 start-6 rounded-full bg-fg px-3 py-1 text-xs font-bold text-bg">{labels.popularBadge}</span>}
              <h3 className="text-xl">{p.name}</h3>
              {p.description && <p className="mt-1 min-h-10 text-sm leading-6 text-muted">{p.description}</p>}

              {/* السعر يتبدل بحركة ناعمة مع المدة */}
              <div key={`${p.id}-${cycle}`} className="mt-5 animate-[rise_0.25s_ease-out_both] space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {cmp != null && <s className="text-lg text-muted tabular-nums">{formatMoney(cmp)}</s>}
                  <span className="text-4xl font-bold tracking-tight tabular-nums">{p.isFree ? "مجاناً" : formatMoney(price)}</span>
                  {!p.isFree && <span className="text-sm text-muted">/ {DURATIONS.find((d) => d.cycle === cycle)!.unit}</span>}
                </div>
                {!p.isFree && months > 1 && <p className="text-sm text-muted">يعني {formatMoney(monthlyEquivalent(price, cycle))} في الشهر</p>}
                {!p.isFree && <p className="text-xs text-muted">تدفع مرة وحدة {formatMoney(price)} {payOnceText(cycle)}</p>}
                <div className="flex min-h-6 flex-wrap gap-1.5 pt-1">
                  {save > 0 && <span className="rounded-full bg-success/12 px-2.5 py-0.5 text-xs font-bold text-success-fg">وفّر {save}%</span>}
                  {perk && (perk.note || perk.freeDesigns) && <span className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-2.5 py-0.5 text-xs font-semibold text-link-strong"><Gift className="size-3.5" aria-hidden />{perk.note || `${perk.freeDesigns} تصميم مجاني`}</span>}
                </div>
              </div>

              <ul className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center text-xs">
                <li><Package className="mx-auto mb-1 size-5" aria-hidden />{limitLine(p.limits.maxProducts, "منتج", "منتجات بدون حد")}</li>
                <li><ShoppingBag className="mx-auto mb-1 size-5" aria-hidden />{limitLine(p.limits.maxOrdersPerMonth, "طلبية/شهر", "طلبيات بدون حد")}</li>
                <li><Users className="mx-auto mb-1 size-5" aria-hidden />{limitLine(p.limits.maxStaff, p.limits.maxStaff === 1 ? "موظف" : "موظفين", "موظفين بدون حد")}</li>
              </ul>

              <div className="mt-5 flex-1 space-y-4">
                {CARD_GROUPS.map((g) => {
                  const rows = included.filter((r) => r.card === g);
                  if (!rows.length) return null;
                  return (
                    <div key={g}>
                      <p className="mb-1.5 text-xs font-semibold text-muted">{g}</p>
                      <ul className="space-y-1.5 text-sm">
                        {rows.map((r) => { const v = r.value(p); return <li key={r.key} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden /><span>{rowLabel(r.key, labels.rows)}{typeof v === "string" ? <span className="text-muted"> · {v}</span> : null}</span></li>; })}
                      </ul>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6">
                {isCurrent ? (
                  <span className="flex h-11 items-center justify-center rounded-md border border-line text-sm font-semibold text-muted">باقتك الحالية</span>
                ) : href ? (
                  <Link href={href} target={cta.kind === "upgrade" ? "_blank" : undefined} rel={cta.kind === "upgrade" ? "noopener noreferrer" : undefined} aria-describedby={`${uid}-${p.id}`}
                    className={cn("flex h-11 items-center justify-center rounded-md px-5 text-[15px] font-semibold transition-all", hot ? "bg-gold text-navy hover:brightness-95" : "border border-line hover:bg-surface-2")}>
                    {cta.kind === "register" ? cta.label : "اطلب الباقة هذي"}
                  </Link>
                ) : (
                  <span className="block text-center text-sm text-muted">للاشتراك كلّم الدعم.</span>
                )}
                <span id={`${uid}-${p.id}`} className="sr-only">باقة {p.name}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
