"use client";

import { useState } from "react";
import { Plus, Printer, Trash2, Wand2 } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { formatMoney, inputToDirham } from "@/lib/money";
import type { getMarketProduct } from "@/server/market/catalog";
import { generateBarcodeAction, saveMarketProductAction } from "../../actions";

type Data = NonNullable<Awaited<ReturnType<typeof getMarketProduct>>>;
const dinar = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n / 1000));
const money = (s: string) => (s.trim() === "" ? null : inputToDirham(s) ?? null);
const COLORS = ["#C19E58", "#087C86", "#276B4D", "#A8441F", "#0D263E", "#7B4FA0"];

export function MarketProductEditor({ data, wholesale, writable }: { data: Data; wholesale: boolean; writable: boolean }) {
  const p = data.product;
  const [soldBy, setSoldBy] = useState(p.soldBy);
  const [plu, setPlu] = useState(p.pluCode ?? "");
  const [shelf, setShelf] = useState(p.shelf ?? "");
  const [quick, setQuick] = useState(p.quickPosition === null ? "" : String(p.quickPosition));
  const [color, setColor] = useState(p.quickColor ?? "");
  const [units, setUnits] = useState(data.units.map((u) => ({ id: u.id as string | null, name: u.name, factor: String(u.factor), price: dinar(u.price), semi: dinar(u.semiPrice), wholesale: dinar(u.wholesalePrice) })));
  const [codes, setCodes] = useState(data.barcodes.map((b) => ({ variantId: b.variantId, unit: b.unit ?? "", code: b.code })));
  const [levels, setLevels] = useState(data.levelPrices.map((l) => ({ variantId: l.variantId, semi: dinar(l.semi), wholesale: dinar(l.wholesale) })));
  const save = useAct();
  const gen = useAct();
  const vName = (id: string) => (data.variants.length > 1 ? `${data.variants.findIndex((v) => v.id === id) + 1}` : "");

  const submit = () => save.act(() => saveMarketProductAction({
    productId: p.id, soldBy, pluCode: plu || null, shelf: shelf || null, quickPosition: quick === "" ? null : Number(quick), quickColor: color || null,
    units: units.filter((u) => u.name.trim()).map((u) => ({ id: u.id, name: u.name.trim(), factor: Number(u.factor), price: money(u.price), semiPrice: money(u.semi), wholesalePrice: money(u.wholesale) })),
    barcodes: codes.filter((c) => c.code.trim()).map((c) => ({ variantId: c.variantId, unit: c.unit || null, code: c.code.trim() })),
    levelPrices: levels.map((l) => ({ variantId: l.variantId, semi: money(l.semi), wholesale: money(l.wholesale) })),
  }), "تم الحفظ");

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <Card>
        <CardHeader title="البيع" description="الموزون يتباع بالكيلو (السعر للكيلو والمخزون بالجرام)، ويقرا من باركود الميزان برقم الصنف." />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="يتباع" value={soldBy} onChange={(e) => setSoldBy(e.target.value as typeof soldBy)} disabled={data.variants.length > 1}>
            <option value="unit">بالحبة</option><option value="weight">بالوزن (كغ)</option>
          </Select>
          <Input label="رقم الصنف في الميزان (PLU)" inputMode="numeric" dir="ltr" value={plu} onChange={(e) => setPlu(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={soldBy !== "weight"} hint="نفس الرقم المبرمج في الميزان" />
          <Input label="الرف / المكان" value={shelf} maxLength={30} onChange={(e) => setShelf(e.target.value)} placeholder="مثلاً A3" hint="للجرد الجزئي والتجهيز" />
          <Input label="ترتيبه في الأزرار السريعة" inputMode="numeric" value={quick} onChange={(e) => setQuick(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="فاضي = مش سريع" hint="صورة الزر = أول صورة للمنتج" />
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="mb-1.5 text-sm font-medium">لون الزر السريع</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="لون الزر">
              <button type="button" role="radio" aria-checked={!color} onClick={() => setColor("")} className={`h-9 rounded-md border px-3 text-sm ${!color ? "border-fg" : "border-line"}`}>بدون</button>
              {COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={`size-9 rounded-md border-2 ${color === c ? "border-fg" : "border-transparent"}`} style={{ backgroundColor: c }} />)}
            </div>
          </div>
        </CardBody>
      </Card>

      {soldBy === "unit" && (
        <Card>
          <CardHeader title="الوحدات" description="الكرتونة أو الشدّة: كم حبة فيها وسعرها (فاضي = عدد الحبات × سعر الحبة). المخزون دايماً بالحبة." />
          <CardBody className="space-y-2">
            {units.map((u, i) => (
              <div key={i} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_6rem_1fr_1fr_1fr_auto]">
                <Input label="الاسم" value={u.name} maxLength={30} onChange={(e) => setUnits(units.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="كرتونة" />
                <Input label="فيها (حبة)" inputMode="numeric" value={u.factor} onChange={(e) => setUnits(units.map((x, j) => (j === i ? { ...x, factor: e.target.value.replace(/\D/g, "") } : x)))} />
                <Input label="سعرها (د.ل)" inputMode="decimal" value={u.price} onChange={(e) => setUnits(units.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} placeholder={formatMoney(p.price * (Number(u.factor) || 1))} />
                <Input label="نص جملة" inputMode="decimal" disabled={!wholesale} value={u.semi} onChange={(e) => setUnits(units.map((x, j) => (j === i ? { ...x, semi: e.target.value } : x)))} />
                <Input label="جملة" inputMode="decimal" disabled={!wholesale} value={u.wholesale} onChange={(e) => setUnits(units.map((x, j) => (j === i ? { ...x, wholesale: e.target.value } : x)))} />
                <Button type="button" variant="ghost" aria-label={`حذف ${u.name || "الوحدة"}`} onClick={() => setUnits(units.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            {units.length < 5 && <Button type="button" variant="outline" size="sm" onClick={() => setUnits([...units, { id: null, name: units.length ? "شدّة" : "كرتونة", factor: "24", price: "", semi: "", wholesale: "" }])}><Plus className="size-4" /> وحدة</Button>}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="الباركودات" description="أكثر من باركود لنفس الصنف (من موردين مختلفين)، وباركود خاص للكرتونة. الباركود ما يتكررش في محلك." />
        <CardBody className="space-y-2">
          {codes.map((c, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_10rem_auto_auto]">
              <Input label={`الباركود${vName(c.variantId) ? ` (متغير ${vName(c.variantId)})` : ""}`} dir="ltr" value={c.code} maxLength={40} onChange={(e) => setCodes(codes.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} />
              <Select label="الوحدة" value={c.unit} onChange={(e) => setCodes(codes.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}>
                <option value="">حبة</option>{units.filter((u) => u.name.trim()).map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
              </Select>
              <a href={c.code ? `/print/labels?format=a4-barcode&code=${encodeURIComponent(c.code)}&name=${encodeURIComponent(p.name)}` : undefined} target="_blank" rel="noopener" aria-label="اطبع الباركود" className="flex size-11 items-center justify-center rounded-md border border-line hover:bg-surface-2"><Printer className="size-4" /></a>
              <Button type="button" variant="ghost" aria-label="حذف الباركود" onClick={() => setCodes(codes.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setCodes([...codes, { variantId: data.variants[0]!.id, unit: "", code: "" }])}><Plus className="size-4" /> باركود</Button>
            {writable && (
              <Button type="button" variant="outline" size="sm" loading={gen.pending} onClick={() => gen.act(async () => {
                const r = await generateBarcodeAction(data.variants[0]!.id, null);
                if (r.ok) setCodes((list) => [...list, { variantId: data.variants[0]!.id, unit: "", code: r.data.code }]);
                return r;
              }, "تم توليد باركود داخلي")}><Wand2 className="size-4" /> ولّد باركود داخلي</Button>
            )}
          </div>
          {gen.error && <p role="alert" className={errorClass}>{gen.error}</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="أسعار الجملة" description={wholesale ? "سعر الحبة (أو الكيلو) لزبائن نص الجملة والجملة. فاضي = نفس سعر المستوى الأقل." : "أسعار الجملة متاحة في باقة «نمو» وأعلى لرُكن ماركت."} />
        <CardBody className="space-y-2">
          {levels.map((l, i) => {
            const v = data.variants.find((x) => x.id === l.variantId)!;
            return (
              <div key={l.variantId} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr]">
                <p className="pb-3 text-sm">تجزئة{vName(l.variantId) ? ` (متغير ${vName(l.variantId)})` : ""}: <b className="tabular-nums">{formatMoney(v.price)}</b></p>
                <Input label="نص جملة (د.ل)" inputMode="decimal" disabled={!wholesale} value={l.semi} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? { ...x, semi: e.target.value } : x)))} />
                <Input label="جملة (د.ل)" inputMode="decimal" disabled={!wholesale} value={l.wholesale} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? { ...x, wholesale: e.target.value } : x)))} />
              </div>
            );
          })}
        </CardBody>
      </Card>

      {save.error && <p role="alert" className={errorClass}>{save.error}</p>}
      <div className="sticky bottom-0 z-10 flex justify-end border-t border-line bg-bg/95 py-3 backdrop-blur"><Button type="submit" size="lg" loading={save.pending} disabled={!writable}>حفظ</Button></div>
    </form>
  );
}
