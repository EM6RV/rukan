"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { formatMoney } from "@/lib/money";
import type { Suggestion } from "@/server/market/purchase-orders";
import { cancelPurchaseOrderAction, createPurchaseOrderAction, purchaseOrderToInvoiceAction, sentPurchaseOrderAction } from "../actions";

export function SuggestionGroups({ suggestions, suppliers, writable }: { suggestions: Suggestion[]; suppliers: { id: string; name: string }[]; writable: boolean }) {
  // المورد لكل صنف (قابل للتغيير) والكمية بالوحدة الأكبر
  const [supplierOf, setSupplierOf] = useState<Record<string, string>>(() => Object.fromEntries(suggestions.map((s) => [s.variantId, s.supplierId ?? ""])));
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(suggestions.map((s) => [s.variantId, String(s.unitQty)])));
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const { act, pending, error } = useAct();
  const groups = useMemo(() => {
    const m = new Map<string, Suggestion[]>();
    for (const s of suggestions) { const k = supplierOf[s.variantId] || ""; m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : 0));
  }, [suggestions, supplierOf]);
  const supName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "بدون مورد";
  if (!suggestions.length) return <Card className="p-5 text-sm text-muted">كل الأصناف فوق حد إعادة الطلب. 👌</Card>;
  return (
    <div className="space-y-4">
      {groups.map(([sid, list]) => {
        const chosen = list.filter((s) => !skip.has(s.variantId) && Number(qty[s.variantId]) > 0);
        const total = chosen.reduce((a, s) => a + (s.lastCost ?? 0) * (s.unit?.factor ?? 1) * Number(qty[s.variantId]), 0);
        return (
          <Card key={sid || "none"}>
            <CardHeader title={sid ? supName(sid) : "بدون مورد (اختار مورد لكل صنف)"} description={`${list.length} صنف${total ? ` · تقريباً ${formatMoney(total)}` : ""}`}
              action={writable && sid ? <Button size="sm" loading={pending} disabled={!chosen.length} onClick={() => act(() => createPurchaseOrderAction({
                supplierId: sid, items: chosen.map((s) => ({ variantId: s.variantId, quantity: Number(qty[s.variantId]), unitFactor: s.unit?.factor ?? 1, unitName: s.unit?.name ?? null, unitCost: (s.lastCost ?? 0) * (s.unit?.factor ?? 1) })),
              }), "تم إنشاء طلب الشراء")}>اعمل طلب شراء</Button> : undefined} />
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="الأصناف المقترحة">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-surface-2 text-muted"><tr><th className="p-2.5 text-start font-medium">الصنف</th><th className="p-2.5 text-start font-medium">المخزون</th><th className="p-2.5 text-start font-medium">البيع/يوم</th><th className="p-2.5 text-start font-medium">يكفي</th><th className="p-2.5 text-start font-medium">الكمية</th><th className="p-2.5 text-start font-medium">المورد</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {list.map((s) => (
                    <tr key={s.variantId} className={skip.has(s.variantId) ? "opacity-50" : ""}>
                      <td className="p-2.5"><label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={!skip.has(s.variantId)} onChange={() => setSkip((x) => { const n = new Set(x); if (n.has(s.variantId)) n.delete(s.variantId); else n.add(s.variantId); return n; })} aria-label={`اطلب ${s.name}`} />{s.name}</label></td>
                      <td className="p-2.5 tabular-nums">{s.stock} <span className="text-xs text-muted">(الحد {s.reorderPoint})</span></td>
                      <td className="p-2.5 tabular-nums">{s.dailyRate}</td>
                      <td className="p-2.5">{s.daysLeft === null ? "—" : `${s.daysLeft} يوم`}</td>
                      <td className="p-2.5"><span className="flex items-center gap-1"><input inputMode="numeric" aria-label={`كمية ${s.name}`} value={qty[s.variantId] ?? ""} onChange={(e) => setQty({ ...qty, [s.variantId]: e.target.value.replace(/\D/g, "") })} className="h-9 w-16 rounded-md border border-line bg-surface px-2 text-center" />{s.unit ? `${s.unit.name} (${s.unit.factor})` : "حبة"}</span></td>
                      <td className="p-2.5"><Select aria-label={`مورد ${s.name}`} value={supplierOf[s.variantId] ?? ""} onChange={(e) => setSupplierOf({ ...supplierOf, [s.variantId]: e.target.value })} className="h-9 min-w-36"><option value="">—</option>{suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
      {error && <p role="alert" className={errorClass}>{error}</p>}
    </div>
  );
}

export function PoActions({ id, wa }: { id: string; wa: string | null }) {
  const router = useRouter();
  const { act, pending, error } = useAct();
  return (
    <span className="flex flex-wrap items-center gap-2">
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => void sentPurchaseOrderAction(id).then(() => router.refresh())} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#25D366] px-3 text-sm font-semibold text-navy"><MessageCircle className="size-4" aria-hidden /> واتساب للمورد</a>}
      <Button size="sm" variant="outline" loading={pending} onClick={() => act(async () => { const r = await purchaseOrderToInvoiceAction(id); if (r.ok) router.push(`/dashboard/purchasing/${r.data.invoiceId}`); return r; }, "اتحول لفاتورة شراء")}>حوّل لفاتورة</Button>
      <Button size="sm" variant="ghost" onClick={() => { if (confirm("نلغوا طلب الشراء؟")) act(() => cancelPurchaseOrderAction(id), "تم الإلغاء"); }}>إلغاء</Button>
      {error && <span role="alert" className="text-danger-fg">{error}</span>}
    </span>
  );
}
