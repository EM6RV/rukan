import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Kit } from "./templates";
import type { CatalogFacets } from "@/server/storefront/types";

export type ActiveFilters = { min?: string; max?: string; stock?: boolean; opt?: string };

/** فلاتر الكتالوج (GET عادي: يشتغل بدون JS). السعر بالدينار */
export function FilterBar({ action, cls, facets, active, keep }: { action: string; cls: Kit["cls"]; facets: CatalogFacets; active: ActiveFilters; keep: Record<string, string> }) {
  const count = [active.min, active.max, active.stock, active.opt].filter(Boolean).length;
  const values = facets.options.flatMap((o) => o.values.map((v) => ({ group: o.name, v })));
  return (
    <details className="group" open={count > 0}>
      <summary className={cn(cls.chip, "inline-flex cursor-pointer list-none items-center gap-2")}>
        <SlidersHorizontal className="size-4" aria-hidden /> فلترة{count > 0 && <span className="rounded-full bg-(--sa) px-1.5 text-xs text-(--sa-fg)">{count}</span>}
      </summary>
      <form action={action} className={cn(cls.panel, "mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4")}>
        {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <fieldset className="space-y-2"><legend className="text-sm font-semibold">السعر (د.ل)</legend>
          <div className="flex items-center gap-2">
            <input name="min" type="number" inputMode="numeric" min={0} defaultValue={active.min} placeholder="من" aria-label="أقل سعر" className={cls.input} />
            <input name="max" type="number" inputMode="numeric" min={0} defaultValue={active.max} placeholder="إلى" aria-label="أعلى سعر" className={cls.input} />
          </div>
        </fieldset>
        {values.length > 0 && (
          <label className="space-y-2 text-sm font-semibold">المقاس / اللون
            <select name="opt" defaultValue={active.opt ?? ""} className={cn(cls.input, "mt-2 font-normal")}>
              <option value="">الكل</option>
              {facets.options.map((o) => <optgroup key={o.name} label={o.name}>{o.values.map((v) => <option key={`${o.name}-${v}`} value={v}>{v}</option>)}</optgroup>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 self-end text-sm font-semibold"><input type="checkbox" name="stock" value="1" defaultChecked={active.stock} className="size-5" /> المتوفر فقط</label>
        <div className="flex items-end gap-2">
          <button className={cls.btn}>طبّق</button>
          {count > 0 && <a href={action + (Object.keys(keep).length ? `?${new URLSearchParams(keep)}` : "")} className={cls.btnOutline}>مسح</a>}
        </div>
      </form>
    </details>
  );
}

/** يقرا فلاتر الرابط ويحوّلها لاستعلام الكتالوج (بالدرهم) */
export function parseFilters(sp: { min?: string; max?: string; stock?: string; opt?: string }) {
  const num = (s?: string) => { const n = Number(s); return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : undefined; };
  return {
    active: { min: sp.min || undefined, max: sp.max || undefined, stock: sp.stock === "1", opt: sp.opt?.slice(0, 40) || undefined } satisfies ActiveFilters,
    query: { minPrice: num(sp.min), maxPrice: num(sp.max), inStock: sp.stock === "1" || undefined, optionValue: sp.opt?.slice(0, 40) || undefined },
  };
}
