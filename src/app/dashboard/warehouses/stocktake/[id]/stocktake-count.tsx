"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { closeStocktakeAction, saveCountsAction } from "../../actions";

type Item = { variantId: string; name: string; expected: number; counted: number | null };

export function StocktakeCount({ id, status, items, writable }: { id: string; status: "open" | "closed"; items: Item[]; writable: boolean }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(items.map((i) => [i.variantId, i.counted === null ? "" : String(i.counted)])));
  const { act, pending, error, setError } = useAct();
  const open = status === "open" && writable;
  const payload = () => {
    const out: { variantId: string; counted: number | null }[] = [];
    for (const i of items) {
      const raw = (vals[i.variantId] ?? "").trim();
      if (raw === "") { out.push({ variantId: i.variantId, counted: null }); continue; }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) { setError(`كمية «${i.name}» لازم تكون رقم صحيح.`); return null; }
      out.push({ variantId: i.variantId, counted: n });
    }
    return out;
  };
  const diffs = items.filter((i) => (vals[i.variantId] ?? "").trim() !== "" && Number(vals[i.variantId]) !== i.expected).length;
  return (
    <div className="space-y-4">
      {error && <p role="alert" className={errorClass}>{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="bg-surface-2 text-muted"><tr>{["المنتج", "المتوقع", "الفعلي", "الفرق"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {items.map((i) => {
              const raw = (vals[i.variantId] ?? "").trim(), diff = raw === "" ? null : Number(raw) - i.expected;
              return (
                <tr key={i.variantId}>
                  <td className="px-3 py-2 font-medium">{i.name}</td><td className="px-3 py-2 tabular-nums">{i.expected}</td>
                  <td className="px-2 py-1.5"><input aria-label={`الفعلي ${i.name}`} inputMode="numeric" disabled={!open} value={vals[i.variantId] ?? ""} onChange={(e) => setVals({ ...vals, [i.variantId]: e.target.value })} className="h-9 w-24 rounded-md border border-line bg-surface px-2" /></td>
                  <td className={`px-3 py-2 font-bold tabular-nums ${diff ? (diff < 0 ? "text-danger-fg" : "text-success-fg") : ""}`}>{diff === null ? "—" : diff > 0 ? `+${diff}` : diff}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" loading={pending} onClick={() => { const p = payload(); if (p) act(() => saveCountsAction(id, p), "تم حفظ العدّ"); }}>حفظ العدّ</Button>
          <Button loading={pending} onClick={() => { const p = payload(); if (!p) return; act(async () => { const s = await saveCountsAction(id, p); return s.ok ? closeStocktakeAction(id) : s; }, "تم إقفال الجرد وتسجيل الفروقات", () => router.push("/dashboard/warehouses/stocktake")); }}>إقفال الجرد ({diffs} فرق)</Button>
        </div>
      )}
    </div>
  );
}
