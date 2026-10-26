"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { dateInputToMs, msToDateInput } from "@/lib/date-input";
import { dirhamToInput, inputToDirham } from "@/lib/money";
import type { GridRow } from "@/server/catalog/grid";
import { saveGridAction } from "./actions";

type Draft = { price: string; stock: string; min: string; cost: string; expires: string };
const toDraft = (r: GridRow): Draft => ({ price: dirhamToInput(r.price), stock: String(r.stock), min: r.minStock === null ? "" : String(r.minStock), cost: r.cost === null ? "" : dirhamToInput(r.cost), expires: msToDateInput(r.expiresAt) });
const cell = "h-9 w-full min-w-0 rounded-md border border-line bg-surface px-2 text-sm focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30";

export function GridEditor({ rows, canEdit }: { rows: GridRow[]; canEdit: boolean }) {
  const { act, pending, error, setError } = useAct();
  const original = useMemo(() => new Map(rows.map((r) => [r.variantId, toDraft(r)])), [rows]);
  const [drafts, setDrafts] = useState<Map<string, Draft>>(original);
  const [q, setQ] = useState("");
  const dirty = rows.filter((r) => { const a = drafts.get(r.variantId)!, b = original.get(r.variantId)!; return a.price !== b.price || a.stock !== b.stock || a.min !== b.min || a.cost !== b.cost || a.expires !== b.expires; });
  const shown = rows.filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()));
  const patch = (id: string, p: Partial<Draft>) => setDrafts((cur) => new Map(cur).set(id, { ...cur.get(id)!, ...p }));

  function save() {
    setError(null);
    const payload: { variantId: string; price: number; stock: number; cost: number | null; minStock: number | null; expiresAt: number | null }[] = [];
    for (const r of dirty) {
      const d = drafts.get(r.variantId)!;
      const price = inputToDirham(d.price), cost = d.cost.trim() ? inputToDirham(d.cost) : null, stock = Number(d.stock);
      if (price === null || price === undefined) return setError(`سعر «${r.name}» غير صحيح.`);
      if (cost === undefined) return setError(`تكلفة «${r.name}» غير صحيحة.`);
      if (!Number.isInteger(stock)) return setError(`مخزون «${r.name}» لازم يكون رقم صحيح.`);
      const min = d.min.trim() === "" ? null : Number(d.min);
      if (min !== null && (!Number.isInteger(min) || min < 0)) return setError(`حد التنبيه لـ «${r.name}» لازم يكون رقم صحيح.`);
      payload.push({ variantId: r.variantId, price, stock, minStock: min, cost, expiresAt: d.expires ? dateInputToMs(d.expires, "end") : null });
    }
    act(() => saveGridAction(payload), "تم حفظ التعديلات");
  }

  if (rows.length === 0) return <EmptyState title="ما فيه منتجات" description="أضف منتجات وارجع هنا للتعديل السريع." action={<ButtonLink href="/dashboard/products/new">منتج جديد</ButtonLink>} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="بحث" placeholder="ابحث باسم المنتج…" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 w-full max-w-xs rounded-md border border-line bg-surface px-3 text-sm" />
        <span className="flex-1" />
        <a href="/dashboard/export-products" className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm hover:bg-surface-2"><Download className="size-4" /> تصدير Excel</a>
        <Link href="/dashboard/products/import" className="inline-flex h-10 items-center rounded-md border border-line px-3 text-sm hover:bg-surface-2">استيراد</Link>
        {canEdit && <Button onClick={save} loading={pending} disabled={dirty.length === 0}>حفظ ({dirty.length})</Button>}
      </div>
      {error && <p role="alert" className={errorClass}>{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-surface-2 text-start text-muted"><tr>{["المنتج", "السعر (د.ل)", "المخزون", "حد التنبيه", "التكلفة (د.ل)", "ينتهي في"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => {
              const d = drafts.get(r.variantId)!;
              const changed = dirty.includes(r);
              return (
                <tr key={r.variantId} className={changed ? "bg-gold/10" : undefined}>
                  <td className="px-3 py-2"><Link href={`/dashboard/products/${r.productId}`} className="font-medium hover:underline">{r.name}</Link>{r.label && <span className="text-muted"> — {r.label}</span>}{r.isBundle && <span className="ms-2 text-xs text-muted">باقة</span>}</td>
                  <td className="px-2 py-1.5"><input aria-label={`سعر ${r.name}`} inputMode="decimal" disabled={!canEdit} value={d.price} onChange={(e) => patch(r.variantId, { price: e.target.value })} className={cell} /></td>
                  <td className="px-2 py-1.5"><input aria-label={`مخزون ${r.name}`} inputMode="numeric" disabled={!canEdit || r.isBundle} value={r.isBundle ? "—" : d.stock} onChange={(e) => patch(r.variantId, { stock: e.target.value })} className={cell} /></td>
                  <td className="px-2 py-1.5"><input aria-label={`حد التنبيه ${r.name}`} inputMode="numeric" placeholder="5" disabled={!canEdit || r.isBundle} value={d.min} onChange={(e) => patch(r.variantId, { min: e.target.value })} className={cell} /></td>
                  <td className="px-2 py-1.5"><input aria-label={`تكلفة ${r.name}`} inputMode="decimal" disabled={!canEdit} value={d.cost} onChange={(e) => patch(r.variantId, { cost: e.target.value })} className={cell} /></td>
                  <td className="px-2 py-1.5"><input aria-label={`انتهاء ${r.name}`} type="date" dir="ltr" disabled={!canEdit} value={d.expires} onChange={(e) => patch(r.variantId, { expires: e.target.value })} className={cell} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
