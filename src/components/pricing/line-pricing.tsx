"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Check } from "lucide-react";
import { DURATIONS, monthlyEquivalent, payOnceText, planPrice, savingsPercent, type BillingPeriod } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import type { PricingPlan } from "@/server/admin/plans";
import { PricingTable } from "./pricing-table";

export type LineTab = "store" | "market" | "lounge" | "gym";
export const TAB_LABELS: Record<LineTab, string> = { store: "المتجر الأونلاين", market: "رُكن ماركت", lounge: "رُكن بلاي", gym: "رُكن فِت" };

/** أرقام الحدود اللي تهم كل منظومة (null = بدون حد) */
function highlights(tab: LineTab, p: PricingPlan): string[] {
  const l = p.limits;
  const n = (v: number | null | undefined, one: string, all: string) => (v === undefined ? null : v === null ? all : `${v} ${one}`);
  const out =
    tab === "market" ? [n(l.maxRegisters, "كاشير", "كاشيرات بدون حد"), n(l.maxBranches, "فرع", "فروع بدون حد"), n(l.maxProducts, "صنف", "أصناف بدون حد")]
    : tab === "lounge" ? [n(l.maxStations, "جهاز", "أجهزة بدون حد"), n(l.maxRegisters, "كاشير", "كاشيرات بدون حد"), n(l.maxStaff, "موظف", "موظفين بدون حد")]
    : [n(l.maxMembers, "عضو", "أعضاء بدون حد"), n(l.maxRegisters, "كاشير", "كاشيرات بدون حد"), n(l.maxStaff, "موظف", "موظفين بدون حد")];
  return out.filter((x): x is string => !!x);
}

export function LinePricingTabs({ store, lines, labels, cta }: {
  store: PricingPlan[]; lines: Record<"market" | "lounge" | "gym", PricingPlan[]>; labels: { popularBadge: string; rows?: Record<string, string> }; cta: string;
}) {
  const tabs = (["store", "market", "lounge", "gym"] as const).filter((t) => (t === "store" ? store : lines[t]).length > 0);
  const [tab, setTab] = useState<LineTab>(tabs[0] ?? "store");
  const uid = useId();
  return (
    <div className="space-y-8">
      {tabs.length > 1 && (
        <div role="tablist" aria-label="المنظومة" className="mx-auto flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-full border border-line bg-surface p-1">
          {tabs.map((t) => <button key={t} type="button" role="tab" id={`${uid}-${t}`} aria-selected={tab === t} aria-controls={`${uid}-panel`} onClick={() => setTab(t)} className={cn("rounded-full px-4 py-2 text-sm font-semibold transition-colors", tab === t ? "bg-fg text-bg" : "text-muted hover:text-fg")}>{TAB_LABELS[t]}</button>)}
        </div>
      )}
      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-${tab}`}>
        {tab === "store" ? <PricingTable plans={store} cta={{ kind: "register", label: cta }} labels={labels} /> : <LineCards key={tab} tab={tab} plans={lines[tab]} cta={cta} popular={labels.popularBadge} />}
      </div>
    </div>
  );
}

function LineCards({ tab, plans, cta, popular }: { tab: LineTab; plans: PricingPlan[]; cta: string; popular: string }) {
  const offered = DURATIONS.filter((d) => plans.some((p) => planPrice(p, d.cycle) != null));
  const [cycle, setCycle] = useState<BillingPeriod>((offered.find((d) => d.cycle === "yearly") ?? offered[0])?.cycle ?? "monthly");
  const shown = plans.filter((p) => planPrice(p, cycle) != null);
  return (
    <div className="space-y-6">
      {offered.length > 1 && (
        <div role="radiogroup" aria-label="مدة الاشتراك" className="mx-auto flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-full border border-line bg-surface p-1">
          {offered.map((d) => <button key={d.key} type="button" role="radio" aria-checked={d.cycle === cycle} onClick={() => setCycle(d.cycle)} className={cn("rounded-full px-4 py-2 text-sm font-semibold", d.cycle === cycle ? "bg-fg text-bg" : "text-muted hover:text-fg")}>{d.toggle}</button>)}
        </div>
      )}
      <ul className={cn("mx-auto grid max-w-5xl gap-5", shown.length >= 3 ? "lg:grid-cols-3" : shown.length === 2 ? "md:grid-cols-2 max-w-3xl" : "max-w-sm")}>
        {shown.map((p) => {
          const price = planPrice(p, cycle)!, save = savingsPercent(p, cycle), months = DURATIONS.find((d) => d.cycle === cycle)!.months;
          return (
            <li key={p.id} className={cn("relative flex flex-col rounded-2xl border bg-surface p-6", p.isFeatured ? "border-fg ring-1 ring-fg/15" : "border-line")}>
              {p.isFeatured && <span className="absolute -top-3 start-6 rounded-full bg-fg px-3 py-1 text-xs font-bold text-bg">{popular}</span>}
              <h3 className="text-xl">{p.name}</h3>
              {p.description && <p className="mt-1 min-h-10 text-sm leading-6 text-muted">{p.description}</p>}
              <div className="mt-5 space-y-1">
                <div className="flex items-baseline gap-2"><span className="text-4xl font-bold tabular-nums">{formatMoney(price)}</span><span className="text-sm text-muted">/ {DURATIONS.find((d) => d.cycle === cycle)!.unit}</span></div>
                {months > 1 && <p className="text-sm text-muted">يعني {formatMoney(monthlyEquivalent(price, cycle))} في الشهر</p>}
                <p className="text-xs text-muted">تدفع مرة وحدة {formatMoney(price)} {payOnceText(cycle)}</p>
                {save > 0 && <span className="inline-block rounded-full bg-success/12 px-2.5 py-0.5 text-xs font-bold text-success-fg">وفّر {save}%</span>}
              </div>
              <ul className="mt-5 flex-1 space-y-1.5 text-sm">{highlights(tab, p).map((h) => <li key={h} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden />{h}</li>)}</ul>
              <Link href={`/register`} className={cn("mt-6 flex h-11 items-center justify-center rounded-md px-5 text-[15px] font-semibold", p.isFeatured ? "bg-gold text-navy hover:brightness-95" : "border border-line hover:bg-surface-2")}>{cta}</Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
