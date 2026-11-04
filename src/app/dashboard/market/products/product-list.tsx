"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Printer, Search, Wand2 } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { formatMoney } from "@/lib/money";
import { generateMissingBarcodesAction } from "../actions";

type Row = {
  id: string; name: string; price: number; soldBy: "unit" | "weight"; plu: string | null; shelf: string | null; quick: number | null; kind: string;
  stock: number; variants: number; units: string[]; barcode: string | null; barcodes: number;
};

export function MarketProductList({ rows, q, writable }: { rows: Row[]; q: string; writable: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState(q);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<"a4-shelf" | "a4-barcode" | "roll">("a4-shelf");
  const { act, pending, error } = useAct();
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const ids = [...sel];
  return (
    <div className="space-y-3">
      <form className="relative" onSubmit={(e) => { e.preventDefault(); router.push(`/dashboard/market/products${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`); }}>
        <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الباركود أو رقم الميزان أو الرف" aria-label="بحث"
          className="h-11 w-full rounded-xl border border-line bg-surface ps-11 pe-3 outline-none focus:border-gold focus:ring-2 focus:ring-gold/30" />
      </form>

      <Card className="flex flex-wrap items-end gap-3 p-3">
        <p className="me-auto text-sm text-muted">{sel.size ? `مختار ${sel.size} صنف` : "اختار أصناف للملصقات أو الباركود الداخلي"}</p>
        <Select label="شكل الملصق" value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className="w-44">
          <option value="a4-shelf">ملصق رف (A4)</option>
          <option value="a4-barcode">باركود صغير (A4)</option>
          <option value="roll">رول ملصقات حرارية</option>
        </Select>
        <a aria-disabled={!sel.size} href={sel.size ? `/print/labels?format=${format}&ids=${ids.join(",")}` : undefined} target="_blank" rel="noopener"
          className={`inline-flex h-11 items-center gap-2 rounded-md px-4 font-medium ${sel.size ? "bg-gold text-navy" : "pointer-events-none bg-surface-2 text-muted"}`}>
          <Printer className="size-4" aria-hidden /> اطبع الملصقات
        </a>
        {writable && <Button variant="outline" disabled={!sel.size} loading={pending} onClick={() => act(() => generateMissingBarcodesAction(ids), "تم توليد الباركودات")}><Wand2 className="size-4" /> باركود داخلي للي ما عنده</Button>}
      </Card>
      {error && <p role="alert" className={errorClass}>{error}</p>}

      <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="الأصناف">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2 text-start text-muted">
            <tr>
              <th className="w-10 p-3"><input type="checkbox" aria-label="اختار الكل" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} className="size-4" /></th>
              <th className="p-3 text-start font-medium">الصنف</th><th className="p-3 text-start font-medium">الباركود</th><th className="p-3 text-start font-medium">الوحدات</th>
              <th className="p-3 text-start font-medium">الرف</th><th className="p-3 text-start font-medium">السعر</th><th className="p-3 text-start font-medium">المخزون</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted">ما فيش أصناف. ضيف منتجات من صفحة المنتجات.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2/50">
                <td className="p-3"><input type="checkbox" aria-label={`اختار ${r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="size-4" /></td>
                <td className="p-3">
                  <Link href={`/dashboard/market/products/${r.id}`} className="font-semibold text-link-strong hover:underline">{r.name}</Link>
                  <span className="ms-2 inline-flex gap-1">{r.soldBy === "weight" && <Badge tone="teal">موزون{r.plu ? ` · ${r.plu}` : ""}</Badge>}{r.quick !== null && <Badge tone="gold">سريع</Badge>}{r.kind === "bundle" && <Badge>باقة</Badge>}</span>
                </td>
                <td className="p-3 tabular-nums" dir="ltr">{r.barcode ?? <span className="text-muted">—</span>}{r.barcodes > 1 && <span className="text-xs text-muted"> +{r.barcodes - 1}</span>}</td>
                <td className="p-3 text-muted">{r.units.join("، ") || "حبة"}</td>
                <td className="p-3">{r.shelf ?? "—"}</td>
                <td className="p-3 tabular-nums">{formatMoney(r.price)}{r.soldBy === "weight" ? " /كغ" : ""}</td>
                <td className="p-3 tabular-nums">{r.soldBy === "weight" ? `${(r.stock / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })} كغ` : r.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
