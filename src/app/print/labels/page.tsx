import type { Metadata } from "next";
import { BarcodeSvg } from "@/components/barcode-svg";
import { formatMoney } from "@/lib/money";
import { labelData } from "@/server/market/catalog";
import { requireLineContext } from "@/server/store-context";
import { PrintButton } from "../orders/[id]/print-button";

export const metadata: Metadata = { title: "ملصقات", robots: { index: false } };

type Format = "a4-shelf" | "a4-barcode" | "roll";

/** ملصقات الرف (اسم وسعر وباركود) أو باركود صغير، على A4 أو رول ملصقات حرارية (50×30 مم) */
export default async function PrintLabels({ searchParams }: { searchParams: Promise<{ ids?: string; format?: string; code?: string; name?: string; copies?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireLineContext("market", "products");
  const format: Format = sp.format === "roll" || sp.format === "a4-barcode" ? sp.format : "a4-shelf";
  const copies = Math.min(50, Math.max(1, Number(sp.copies) || 1));
  const single = sp.code ? [{ variantId: "x", name: sp.name?.slice(0, 80) ?? "", price: null as number | null, perKg: false, code: sp.code.slice(0, 40), shelf: null }] : [];
  const items = single.length ? single : await labelData(ctx.scope, (sp.ids ?? "").split(",").filter(Boolean));
  const labels = items.flatMap((x) => Array.from({ length: copies }, () => x));
  const roll = format === "roll";
  return (
    <div dir="rtl" className="min-h-dvh bg-white p-4 text-black print:p-0" style={{ colorScheme: "light" }}>
      <style>{roll ? "@page { size: 50mm 30mm; margin: 0; }" : "@page { size: A4; margin: 8mm; }"}</style>
      <div className="mx-auto mb-4 flex max-w-[60rem] flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm">{labels.length} ملصق · {format === "roll" ? "رول 50×30 مم" : format === "a4-shelf" ? "ملصق رف على A4" : "باركود صغير على A4"}</p>
        <div className="flex items-center gap-3 text-sm">
          {[1, 2, 5].map((n) => <a key={n} href={`?${new URLSearchParams({ ...(sp.ids ? { ids: sp.ids } : {}), ...(sp.code ? { code: sp.code, name: sp.name ?? "" } : {}), format, copies: String(n) })}`} className={copies === n ? "font-bold" : "underline"}>{n} نسخة</a>)}
          <PrintButton />
        </div>
      </div>
      {labels.length === 0 ? <p className="text-center">ما فيش أصناف مختارة.</p> : (
        <div className={roll ? "" : `mx-auto grid max-w-[60rem] gap-2 ${format === "a4-shelf" ? "grid-cols-3" : "grid-cols-4"}`}>
          {labels.map((l, i) => (
            <div key={i} className={roll ? "flex h-[30mm] w-[50mm] break-after-page flex-col items-center justify-center overflow-hidden px-1" : "flex break-inside-avoid flex-col items-center justify-between gap-1 rounded border border-black/40 p-2"}>
              <p className={`line-clamp-2 text-center font-bold leading-tight ${format === "a4-shelf" ? "text-base" : "text-[10px]"}`}>{l.name}</p>
              {format === "a4-shelf" && l.price !== null && <p className="text-2xl font-extrabold tabular-nums">{formatMoney(l.price)}{l.perKg ? <span className="text-sm font-normal"> /كغ</span> : null}</p>}
              {roll && l.price !== null && <p className="text-sm font-extrabold tabular-nums">{formatMoney(l.price)}{l.perKg ? " /كغ" : ""}</p>}
              {l.code ? <BarcodeSvg code={l.code} height={roll ? 26 : format === "a4-shelf" ? 34 : 30} className={roll ? "h-[14mm] w-[46mm]" : "h-14 w-full"} /> : <p className="text-[10px] text-black/60">{l.perKg ? "موزون (باركود من الميزان)" : "بدون باركود"}</p>}
              {format === "a4-shelf" && l.shelf && <p className="text-[10px] text-black/60">رف {l.shelf}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
