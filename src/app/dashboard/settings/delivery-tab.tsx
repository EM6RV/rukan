"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { REGION_LABELS } from "@/lib/constants";
import { dirhamToInput, inputToDirham } from "@/lib/money";
import { saveDeliveryAction } from "./actions";
import { Footer, useSave } from "./settings-shared";

export type DeliveryProps = {
  freeDeliveryOver: number | null;
  rows: { cityId: string; cityName: string; region: string; fee: number; etaText: string; isActive: boolean }[];
};

export function DeliveryTab({ rows, freeDeliveryOver, writable }: DeliveryProps & { writable: boolean }) {
  const [list, setList] = useState(() => rows.map((r) => ({ ...r, fee: dirhamToInput(r.fee) })));
  const [free, setFree] = useState(dirhamToInput(freeDeliveryOver));
  const [bulk, setBulk] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const { save, pending, error } = useSave(saveDeliveryAction);
  const patch = (id: string, p: Partial<(typeof list)[number]>) => setList((l) => l.map((r) => (r.cityId === id ? { ...r, ...p } : r)));

  function submit() {
    setLocalError(null);
    const freeValue = inputToDirham(free);
    if (freeValue === undefined) return setLocalError("حد التوصيل المجاني مش رقم صحيح");
    const rates = [];
    for (const r of list) {
      const fee = inputToDirham(r.fee) ?? 0;
      if (r.fee.trim() !== "" && inputToDirham(r.fee) === undefined) return setLocalError(`سعر ${r.cityName} مش رقم صحيح`);
      rates.push({ cityId: r.cityId, fee, etaText: r.etaText, isActive: r.isActive });
    }
    save({ freeDeliveryOver: freeValue, rates });
  }

  const regions = [...new Set(list.map((r) => r.region))];
  return (
    <Card><CardBody>
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="توصيل مجاني فوق مبلغ (د.ل)" inputMode="decimal" value={free} onChange={(e) => setFree(e.target.value)} hint="اتركه فاضي لو ما تبيش توصيل مجاني" />
          <div className="flex items-end gap-2">
            <Input label="سعر موحّد لكل المدن (د.ل)" inputMode="decimal" value={bulk} onChange={(e) => setBulk(e.target.value)} />
            <Button variant="outline" disabled={!bulk.trim()} onClick={() => setList((l) => l.map((r) => (r.isActive ? { ...r, fee: bulk } : r)))}>طبّق</Button>
          </div>
        </div>
        {regions.map((region) => (
          <section key={region} className="space-y-2">
            <h3 className="text-base">{REGION_LABELS[region as keyof typeof REGION_LABELS] ?? region}</h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {list.filter((r) => r.region === region).map((r) => (
                <li key={r.cityId} className="grid grid-cols-[1fr_auto] items-center gap-3 p-3 sm:grid-cols-[10rem_8rem_1fr_auto]">
                  <span className="font-medium">{r.cityName}</span>
                  <div className="sm:order-last"><Toggle checked={r.isActive} onChange={(v) => patch(r.cityId, { isActive: v })} label={r.isActive ? "نوصّل" : "ما نوصّلش"} disabled={!writable} /></div>
                  <Input aria-label={`سعر التوصيل إلى ${r.cityName}`} inputMode="decimal" placeholder="السعر د.ل" value={r.fee} disabled={!r.isActive} onChange={(e) => patch(r.cityId, { fee: e.target.value })} />
                  <Input aria-label={`مدة التوصيل إلى ${r.cityName}`} placeholder="المدة (مثال: يوم)" maxLength={40} value={r.etaText} disabled={!r.isActive} onChange={(e) => patch(r.cityId, { etaText: e.target.value })} className="col-span-2 sm:col-span-1" />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <Footer pending={pending} error={localError ?? error} disabled={!writable} />
      </form>
    </CardBody></Card>
  );
}
