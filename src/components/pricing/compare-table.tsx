import { Check, Minus } from "lucide-react";
import { COMPARE_GROUPS, FEATURE_ROWS, rowLabel, type CompareValue } from "@/lib/pricing-features";
import type { PricingPlan } from "@/server/admin/plans";

function Cell({ v }: { v: CompareValue }) {
  if (v === true) return <Check className="mx-auto size-5 text-success-fg" aria-label="متاح" />;
  if (v === false) return <Minus className="mx-auto size-4 text-muted" aria-label="مش متاح" />;
  if (v === "unlimited") return <span className="font-semibold">بدون حد</span>;
  return <span className="font-semibold tabular-nums">{v}</span>;
}

/** جدول مقارنة كامل: الميزات صفوف والباقات أعمدة. على الموبايل يتمرر أفقي وعمود الميزة ثابت. */
export function CompareTable({ plans, rows }: { plans: PricingPlan[]; rows?: Record<string, string> }) {
  return (
    <div tabIndex={0} role="region" aria-label="جدول مقارنة الباقات" className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <caption className="sr-only">مقارنة الباقات</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="sticky start-0 z-10 w-48 bg-surface p-4 text-start font-semibold">الميزة</th>
            {plans.map((p) => <th key={p.id} scope="col" className={`p-4 text-center font-heading text-base ${p.isFeatured ? "bg-surface-2" : ""}`}>{p.name}</th>)}
          </tr>
        </thead>
        {COMPARE_GROUPS.map((g) => {
          const list = FEATURE_ROWS.filter((r) => r.group === g);
          return (
            <tbody key={g}>
              <tr><th colSpan={plans.length + 1} scope="colgroup" className="sticky start-0 bg-surface-2 px-4 py-2 text-start text-xs font-semibold text-muted">{g}</th></tr>
              {list.map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <th scope="row" className="sticky start-0 z-10 bg-surface px-4 py-3 text-start font-medium">{rowLabel(r.key, rows)}</th>
                  {plans.map((p) => <td key={p.id} className={`px-4 py-3 text-center ${p.isFeatured ? "bg-surface-2/50" : ""}`}><Cell v={r.value(p)} /></td>)}
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
