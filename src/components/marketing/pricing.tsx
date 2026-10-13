"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

type Plan = { id: string; slug: string; name: string; description: string | null; priceMonthly: number; priceYearly: number; limits: { maxProducts: number | null; maxStaff: number | null; allTemplates: boolean; coupons: boolean; reports: boolean; customDomain: boolean; pixels: boolean; removeBranding: boolean } };
const FLAGS = [["allTemplates", "كل القوالب"], ["coupons", "كوبونات الخصم"], ["reports", "تقارير ومبيعات"], ["pixels", "Pixels للإعلانات"], ["customDomain", "دومين خاص"], ["removeBranding", "بدون شعار رُكن"]] as const;

/** جدول الأسعار مع تبديل شهري/سنوي. الباقة الأوسط مميزة. */
export function Pricing({ plans, cta }: { plans: Plan[]; cta: string }) {
  const [yearly, setYearly] = useState(false);
  const featured = plans.length >= 3 ? plans[1]!.id : plans.length === 2 ? plans[1]!.id : null;
  const anySave = plans.some((p) => p.priceMonthly > 0 && p.priceYearly < p.priceMonthly * 12);
  return (
    <div className="space-y-8">
      {anySave && (
        <div className="mx-auto flex w-fit rounded-full border border-line bg-surface p-1" role="group" aria-label="دورة الدفع">
          {([[false, "شهري"], [true, "سنوي (وفّر)"]] as const).map(([y, l]) => (
            <button key={l} type="button" aria-pressed={yearly === y} onClick={() => setYearly(y)} className={cn("rounded-full px-5 py-2 text-sm font-semibold transition-colors", yearly === y ? "bg-gold text-navy" : "text-muted hover:text-fg")}>{l}</button>
          ))}
        </div>
      )}
      <ul className={cn("mx-auto grid max-w-5xl gap-5", plans.length >= 3 ? "lg:grid-cols-3" : plans.length === 2 ? "lg:grid-cols-2" : "max-w-md")}>
        {plans.map((p) => {
          const price = yearly ? p.priceYearly : p.priceMonthly;
          const save = p.priceMonthly > 0 ? Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100) : 0;
          return (
            <li key={p.id} className={cn("relative flex flex-col rounded-2xl border p-7 transition-shadow", p.id === featured ? "border-navy bg-navy text-white shadow-lift ring-1 ring-gold/50 lg:-translate-y-3" : "border-line bg-surface shadow-soft hover:shadow-lift")}>
              {p.id === featured && <span className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full bg-gold px-3.5 py-1 text-xs font-bold text-navy shadow-soft rtl:translate-x-1/2">الأكثر طلباً</span>}
              <h3 className={cn("text-xl", p.id === featured && "text-white")}>{p.name}</h3>
              {p.description && <p className={cn("mt-1 min-h-10 text-sm", p.id === featured ? "text-white/70" : "text-muted")}>{p.description}</p>}
              <p className={cn("mt-4 text-4xl font-bold tabular-nums tracking-tight", p.id === featured && "text-gold")}>{formatMoney(price)}<span className={cn("text-base font-normal", p.id === featured ? "text-white/70" : "text-muted")}> / {yearly ? "سنة" : "شهر"}</span></p>
              <p className={cn("mt-1 h-5 text-sm", p.id === featured ? "text-gold" : "text-success-fg")}>{yearly && save > 0 ? `وفّر ${save}% مقارنة بالشهري` : ""}</p>
              <ul className="my-6 flex-1 space-y-3 border-t border-current/10 pt-6 text-[15px]">
                <li className="flex items-center gap-2"><Check className={cn("size-4.5", p.id === featured ? "text-gold" : "text-success-fg")} aria-hidden />{p.limits.maxProducts === null ? "منتجات غير محدودة" : `${p.limits.maxProducts} منتج`}</li>
                <li className="flex items-center gap-2"><Check className={cn("size-4.5", p.id === featured ? "text-gold" : "text-success-fg")} aria-hidden />{p.limits.maxStaff === null ? "موظفين غير محدودين" : `${p.limits.maxStaff} ${p.limits.maxStaff === 1 ? "موظف" : "موظفين"}`}</li>
                {FLAGS.map(([k, l]) => <li key={k} className={cn("flex items-center gap-2", !p.limits[k] && (p.id === featured ? "text-white/50 line-through" : "text-muted line-through decoration-muted/50"))}>{p.limits[k] ? <Check className={cn("size-4.5", p.id === featured ? "text-gold" : "text-success-fg")} aria-hidden /> : <X className="size-4.5" aria-hidden />}{l}</li>)}
              </ul>
              <Link href="/register" className={cn("inline-flex h-12 items-center justify-center rounded-md font-semibold transition-all duration-200", p.id === featured ? "bg-gold text-navy shadow-soft hover:brightness-95" : "border border-line hover:border-navy hover:bg-surface-2")}>{cta}</Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
