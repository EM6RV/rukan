import Link from "next/link";
import { Check, X } from "lucide-react";
import { approxMonthly, periodUnit, type BillingPeriod } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

type Plan = { id: string; slug: string; name: string; description: string | null; billingPeriod: BillingPeriod; price: number; isFeatured: boolean; limits: { maxProducts: number | null; maxStaff: number | null; allTemplates: boolean; coupons: boolean; reports: boolean; customDomain: boolean; pixels: boolean; removeBranding: boolean; freeDesigns?: number } };
const FLAGS = [["coupons", "كوبونات الخصم"], ["reports", "تقارير ومبيعات"], ["pixels", "Pixels للإعلانات"], ["customDomain", "دومين خاص"], ["removeBranding", "بدون شعار رُكن"]] as const;

/** جدول الأسعار: كل باقة لها مدة وحدة وسعر واحد. الباقة المميزة يحددها الأدمن (isFeatured). */
export function Pricing({ plans, cta }: { plans: Plan[]; cta: string }) {
  return (
    <ul className={cn("mx-auto grid max-w-5xl gap-5", plans.length >= 3 ? "lg:grid-cols-3" : plans.length === 2 ? "lg:grid-cols-2" : "max-w-md")}>
      {plans.map((p) => {
        const hot = p.isFeatured;
        const monthly = approxMonthly(p.price, p.billingPeriod);
        return (
          <li key={p.id} className={cn("relative flex flex-col rounded-2xl border p-7 transition-shadow", hot ? "border-navy bg-navy text-white shadow-lift ring-1 ring-gold/50 [--focus:#e3c487] [--focus-halo:transparent] lg:-translate-y-3" : "border-line bg-surface shadow-soft hover:shadow-lift")}>
            {hot && <span className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full bg-gold px-3.5 py-1 text-xs font-bold text-navy shadow-soft rtl:translate-x-1/2">الأكثر طلباً</span>}
            <h3 className={cn("text-xl", hot && "text-white")}>{p.name}</h3>
            {p.description && <p className={cn("mt-1 min-h-10 text-sm", hot ? "text-white/70" : "text-muted")}>{p.description}</p>}
            <p className={cn("mt-4 text-4xl font-bold tabular-nums tracking-tight", hot && "text-gold")}>{formatMoney(p.price)}<span className={cn("text-base font-normal", hot ? "text-white/70" : "text-muted")}> / {periodUnit(p.billingPeriod)}</span></p>
            <p className={cn("mt-1 h-5 text-sm", hot ? "text-gold" : "text-success-fg")}>{monthly !== null && monthly > 0 ? `يعني تقريباً ${formatMoney(monthly)} في الشهر` : ""}</p>
            <ul className="my-6 flex-1 space-y-3 border-t border-current/10 pt-6 text-[15px]">
              <li className="flex items-center gap-2"><Check className={cn("size-4.5", hot ? "text-gold" : "text-success-fg")} aria-hidden />{p.limits.maxProducts === null ? "منتجات غير محدودة" : `${p.limits.maxProducts} منتج`}</li>
              <li className="flex items-center gap-2"><Check className={cn("size-4.5", hot ? "text-gold" : "text-success-fg")} aria-hidden />{p.limits.maxStaff === null ? "موظفين غير محدودين" : `${p.limits.maxStaff} ${p.limits.maxStaff === 1 ? "موظف" : "موظفين"}`}</li>
              <li className="flex items-center gap-2"><Check className={cn("size-4.5", hot ? "text-gold" : "text-success-fg")} aria-hidden />{p.limits.allTemplates ? "كل القوالب" : "قالب واحد"}</li>
              {(p.limits.freeDesigns ?? 0) > 0 && <li className="flex items-center gap-2"><Check className={cn("size-4.5", hot ? "text-gold" : "text-success-fg")} aria-hidden />ريل أو لوجو مجاناً</li>}
              {FLAGS.map(([k, l]) => <li key={k} className={cn("flex items-center gap-2", !p.limits[k] && (hot ? "text-white/50 line-through" : "text-muted line-through decoration-muted/50"))}>{p.limits[k] ? <Check className={cn("size-4.5", hot ? "text-gold" : "text-success-fg")} aria-hidden /> : <X className="size-4.5" aria-hidden />}{l}</li>)}
            </ul>
            <Link href="/register" className={cn("inline-flex h-12 items-center justify-center rounded-md font-semibold transition-all duration-200", hot ? "bg-gold text-navy shadow-soft hover:brightness-95" : "border border-line hover:border-navy hover:bg-surface-2")}>{cta}</Link>
          </li>
        );
      })}
    </ul>
  );
}
