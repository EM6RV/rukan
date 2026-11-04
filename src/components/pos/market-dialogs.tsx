"use client";

// نوافذ الماركت في الكاشير: الوزن (مكتوب أو من الميزان)، مستوى السعر (تجزئة/نص جملة/جملة)، ووحدات الصنف.
import { useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PRICE_LEVEL_LABELS, PRICE_LEVELS, unitPrice, type PriceLevel } from "@/lib/market-pricing";
import { formatMoney } from "@/lib/money";
import type { PosProduct, PosUnit } from "@/server/pos/bootstrap";
import { connectScale, readWeight, reconnectScale, scaleConnected, scaleSupported } from "./scale";
import type { PosApi } from "./use-pos";

const m = (n: number) => formatMoney(n);
export const fmtKg = (grams: number) => `${(grams / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })} كغ`;

/** الوزن: من الميزان المربوط (Web Serial) أو يتكتب بالكيلو */
export function WeighDialog({ product, pricePerKg, hardware, initialGrams, onAdd, onClose }: {
  product: PosProduct; pricePerKg: number; hardware: boolean; initialGrams?: number; onAdd: (grams: number) => void; onClose: () => void;
}) {
  const [kg, setKg] = useState(initialGrams ? String(initialGrams / 1000) : "");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const canScale = hardware && scaleSupported();
  const grams = Math.round(Number(kg.replace(",", ".")) * 1000);
  const valid = Number.isFinite(grams) && grams > 0 && grams <= 1_000_000;

  async function fromScale() {
    setError(null); setReading(true);
    try {
      if (!scaleConnected() && !(await reconnectScale())) await connectScale();
      const g = await readWeight();
      if (g) setKg(String(g / 1000)); else setError("ما وصلش وزن من الميزان. حط الصنف وجرّب.");
    } catch { setError("ما قدرناش نوصلوا للميزان."); } finally { setReading(false); }
  }
  useEffect(() => { if (canScale && !initialGrams) void reconnectScale().then((ok) => { if (ok) void fromScale(); }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal open onClose={onClose} title={`وزن «${product.name}»`}
      footer={<><Button variant="ghost" onClick={onClose}>رجوع</Button><Button disabled={!valid} onClick={() => onAdd(grams)}>زيد {valid ? m(Math.round((pricePerKg * grams) / 1000)) : ""}</Button></>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) onAdd(grams); }}>
        <Input label="الوزن (كغ)" inputMode="decimal" autoFocus dir="ltr" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="0.500" hint={`السعر ${m(pricePerKg)} للكيلو`} />
        {canScale && <Button type="button" variant="outline" onClick={() => void fromScale()} loading={reading}><Scale className="size-4" /> اقرا من الميزان</Button>}
        {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
      </form>
    </Modal>
  );
}

/** تبديل مستوى السعر: مستوى الزبون يمشي مباشرة، وغيره يحتاج موافقة مشرف */
export function LevelDialog({ pos, onPick, onClose }: { pos: PosApi; onPick: (level: PriceLevel | null) => void; onClose: () => void }) {
  const own = (pos.customer?.priceLevel ?? "retail") as PriceLevel;
  return (
    <Modal open onClose={onClose} title="مستوى السعر">
      <div className="space-y-2">
        {PRICE_LEVELS.map((l) => (
          <button key={l} type="button" onClick={() => onPick(l === own ? null : l)} aria-pressed={pos.level === l}
            className={`flex min-h-12 w-full items-center justify-between rounded-lg border px-4 text-start ${pos.level === l ? "border-gold bg-gold/10" : "border-line hover:bg-surface-2"}`}>
            <span className="font-semibold">{PRICE_LEVEL_LABELS[l]}</span>
            <span className="text-xs text-muted">{l === own ? (pos.customer ? "مستوى الزبون" : "الافتراضي") : "يحتاج موافقة مشرف"}</span>
          </button>
        ))}
        <p className="text-xs text-muted">زبون الجملة يتحدد من صفحة الزبون في اللوحة، والسعر يتبدل وحده لما تختاره.</p>
      </div>
    </Modal>
  );
}

/** أزرار الوحدات تحت الصنف (حبة / كرتونة…) */
export function UnitButtons({ product, units, level, onPick }: { product: PosProduct; units: PosUnit[]; level: PriceLevel; onPick: (u: PosUnit) => void }) {
  if (!units.length) return null;
  const prices = { retail: product.price, semi: product.semi, wholesale: product.wholesale };
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {units.slice(0, 2).map((u) => (
        <span key={u.id} role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onPick(u); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onPick(u); } }}
          className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs font-medium hover:border-gold">
          {u.name} · {m(unitPrice(prices, u, level))}
        </span>
      ))}
    </span>
  );
}
