"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { dateInputToMs, msToDateInput } from "@/lib/date-input";
import { formatMoney, inputToDirham } from "@/lib/money";
import { PROMO_KIND_LABELS, PROMO_KINDS, type PromoKind } from "@/lib/promotions";
import { deletePromotionAction, savePromotionAction, togglePromotionAction } from "../actions";

type Option = { variantId: string; name: string; price: number };
type Promo = { id: string; name: string; kind: PromoKind; config: unknown; startsAt: number | null; endsAt: number | null; isActive: boolean; productNames: Record<string, string> };
const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (v: string) => { const [h, m] = v.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };

function describe(p: Promo): string {
  const c = p.config as Record<string, unknown>;
  const names = (ids: unknown) => (Array.isArray(ids) ? ids.map((i) => p.productNames[i as string] ?? "؟").join("، ") : "");
  if (p.kind === "buy_x_get_y") return `اشتري ${c.buy} وخذ ${c.get} مجاناً: ${names(c.variantIds)}`;
  if (p.kind === "nth_discount") return `الحبة رقم ${c.nth} بخصم ${c.percent}%: ${names(c.variantIds)}`;
  if (p.kind === "time_price") return `خصم ${c.percent}% من ${hhmm(c.fromMinute as number)} لـ ${hhmm(c.toMinute as number)}${(c.days as number[])?.length ? ` (${(c.days as number[]).map((d) => DAYS[d]).join("، ")})` : ""}: ${names(c.variantIds)}`;
  const items = (c.items as { variantId: string; qty: number }[]) ?? [];
  return `${items.map((i) => `${i.qty} × ${p.productNames[i.variantId] ?? "؟"}`).join(" + ")} بـ ${formatMoney(c.price as number)}`;
}

export function PromotionManager({ promos, options, writable, now }: { promos: Promo[]; options: Option[]; writable: boolean; now: number }) {
  const [editing, setEditing] = useState<Promo | "new" | null>(null);
  const act = useAct();
  return (
    <div className="space-y-4">
      {writable && !editing && <Button onClick={() => setEditing("new")}><Plus className="size-4" /> عرض جديد</Button>}
      {editing && <PromoForm initial={editing === "new" ? null : editing} options={options} onDone={() => setEditing(null)} />}
      {act.error && <p role="alert" className={errorClass}>{act.error}</p>}
      <Card>
        <CardHeader title="العروض" />
        {promos.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش عروض. ابدا بـ «الحبة الثانية بنص السعر» على صنف يتباع كثير.</p> : (
          <ul className="divide-y divide-line">
            {promos.map((p) => {
              const live = p.isActive && (p.startsAt === null || p.startsAt <= now) && (p.endsAt === null || p.endsAt > now);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1"><b>{p.name}</b> <Badge tone={live ? "success" : "neutral"}>{live ? "شغّال" : p.isActive ? (p.endsAt && p.endsAt <= now ? "خلص" : "ما بداش") : "موقوف"}</Badge><br /><span className="text-muted">{PROMO_KIND_LABELS[p.kind]} · {describe(p)}</span></span>
                  {writable && <>
                    <Button size="sm" variant="outline" onClick={() => act.act(() => togglePromotionAction(p.id, !p.isActive), p.isActive ? "تم إيقاف العرض" : "تم تشغيل العرض")}>{p.isActive ? "أوقف" : "شغّل"}</Button>
                    <Button size="sm" variant="ghost" aria-label={`تعديل ${p.name}`} onClick={() => setEditing(p)}><Pencil className="size-4" /></Button>
                    <Button size="sm" variant="ghost" aria-label={`حذف ${p.name}`} onClick={() => { if (confirm(`نحذفوا العرض «${p.name}»؟`)) act.act(() => deletePromotionAction(p.id), "تم حذف العرض"); }}><Trash2 className="size-4" /></Button>
                  </>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function PromoForm({ initial, options, onDone }: { initial: Promo | null; options: Option[]; onDone: () => void }) {
  const c = (initial?.config ?? {}) as Record<string, unknown>;
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<PromoKind>(initial?.kind ?? "nth_discount");
  const [ids, setIds] = useState<string[]>((c.variantIds as string[]) ?? []);
  const [items, setItems] = useState<{ variantId: string; qty: string }[]>(((c.items as { variantId: string; qty: number }[]) ?? []).map((i) => ({ variantId: i.variantId, qty: String(i.qty) })));
  const [buy, setBuy] = useState(String(c.buy ?? 2));
  const [get, setGet] = useState(String(c.get ?? 1));
  const [nth, setNth] = useState(String(c.nth ?? 2));
  const [percent, setPercent] = useState(String(c.percent ?? 50));
  const [days, setDays] = useState<number[]>((c.days as number[]) ?? []);
  const [from, setFrom] = useState(hhmm((c.fromMinute as number) ?? 14 * 60));
  const [to, setTo] = useState(hhmm((c.toMinute as number) ?? 17 * 60));
  const [price, setPrice] = useState(c.price ? String((c.price as number) / 1000) : "");
  const [starts, setStarts] = useState(msToDateInput(initial?.startsAt ?? null));
  const [ends, setEnds] = useState(initial?.endsAt ? msToDateInput(initial.endsAt - 1) : "");
  const [pick, setPick] = useState("");
  const { act, pending, error } = useAct();
  const nameOf = (id: string) => options.find((o) => o.variantId === id)?.name ?? "؟";
  const addPick = () => {
    const o = options.find((x) => x.name === pick);
    if (!o) return;
    if (kind === "bundle_price") setItems((l) => (l.some((x) => x.variantId === o.variantId) ? l : [...l, { variantId: o.variantId, qty: "1" }]));
    else setIds((l) => (l.includes(o.variantId) ? l : [...l, o.variantId]));
    setPick("");
  };
  const config = () => {
    if (kind === "buy_x_get_y") return { variantIds: ids, buy: Number(buy), get: Number(get) };
    if (kind === "nth_discount") return { variantIds: ids, nth: Number(nth), percent: Number(percent) };
    if (kind === "time_price") return { variantIds: ids, percent: Number(percent), days, fromMinute: toMin(from), toMinute: to === "00:00" ? 1440 : toMin(to) };
    return { items: items.map((i) => ({ variantId: i.variantId, qty: Number(i.qty) })), price: inputToDirham(price) ?? 0 };
  };
  const bundleValue = items.reduce((s, i) => s + (options.find((o) => o.variantId === i.variantId)?.price ?? 0) * (Number(i.qty) || 0), 0);
  return (
    <Card>
      <CardHeader title={initial ? `تعديل «${initial.name}»` : "عرض جديد"} action={<Button size="sm" variant="ghost" aria-label="إغلاق" onClick={onDone}><X className="size-4" /></Button>} />
      <CardBody>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(() => savePromotionAction({ id: initial?.id, name, kind, config: config(), startsAt: dateInputToMs(starts, "start"), endsAt: ends ? dateInputToMs(ends, "end")! + 1 : null, isActive: initial?.isActive ?? true }), "تم حفظ العرض", onDone); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="اسم العرض" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: الثانية بنص السعر" />
            <Select label="النوع" value={kind} onChange={(e) => setKind(e.target.value as PromoKind)}>{PROMO_KINDS.map((k) => <option key={k} value={k}>{PROMO_KIND_LABELS[k]}</option>)}</Select>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1"><Input label="زيد صنف" list="promo-products" value={pick} onChange={(e) => setPick(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPick(); } }} placeholder="اكتب اسم الصنف" autoComplete="off" /></div>
            <Button type="button" variant="outline" onClick={addPick}>زيد</Button>
            <datalist id="promo-products">{options.slice(0, 2000).map((o) => <option key={o.variantId} value={o.name} />)}</datalist>
          </div>
          {kind !== "bundle_price" ? (
            <ul className="flex flex-wrap gap-2">{ids.map((id) => <li key={id}><Badge tone="teal">{nameOf(id)} <button type="button" aria-label={`شيل ${nameOf(id)}`} onClick={() => setIds(ids.filter((x) => x !== id))}><X className="size-3" /></button></Badge></li>)}</ul>
          ) : (
            <ul className="space-y-2">{items.map((i, k) => <li key={i.variantId} className="flex items-center gap-2 text-sm"><span className="flex-1">{nameOf(i.variantId)}</span><input aria-label={`كمية ${nameOf(i.variantId)}`} inputMode="numeric" value={i.qty} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, qty: e.target.value.replace(/\D/g, "") } : x)))} className="h-10 w-16 rounded-md border border-line bg-surface px-2 text-center" /><Button type="button" size="sm" variant="ghost" aria-label="شيل" onClick={() => setItems(items.filter((_, j) => j !== k))}><X className="size-4" /></Button></li>)}</ul>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {kind === "buy_x_get_y" && <><Input label="اشتري" inputMode="numeric" value={buy} onChange={(e) => setBuy(e.target.value.replace(/\D/g, ""))} /><Input label="وخذ مجاناً" inputMode="numeric" value={get} onChange={(e) => setGet(e.target.value.replace(/\D/g, ""))} /></>}
            {kind === "nth_discount" && <><Input label="الحبة رقم" inputMode="numeric" value={nth} onChange={(e) => setNth(e.target.value.replace(/\D/g, ""))} /><Input label="بخصم %" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value.replace(/\D/g, ""))} /></>}
            {kind === "time_price" && <><Input label="خصم %" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value.replace(/\D/g, ""))} /><Input label="من الساعة" type="time" value={from} onChange={(e) => setFrom(e.target.value)} /><Input label="للساعة" type="time" value={to} onChange={(e) => setTo(e.target.value)} /></>}
            {kind === "bundle_price" && <Input label="سعر الباقة (د.ل)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} hint={bundleValue ? `سعرهم العادي ${formatMoney(bundleValue)}` : undefined} />}
          </div>
          {kind === "time_price" && (
            <fieldset><legend className="mb-1.5 text-sm font-medium">الأيام (فاضي = كل يوم)</legend>
              <div className="flex flex-wrap gap-2">{DAYS.map((d, i) => <label key={d} className={`flex h-10 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm ${days.includes(i) ? "border-gold bg-gold/15" : "border-line"}`}><input type="checkbox" className="sr-only" checked={days.includes(i)} onChange={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])} />{d}</label>)}</div>
            </fieldset>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="يبدا (اختياري)" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} />
            <Input label="ينتهي (اختياري)" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
          </div>
          {error && <p role="alert" className={errorClass}>{error}</p>}
          <Button type="submit" loading={pending}>حفظ العرض</Button>
        </form>
      </CardBody>
    </Card>
  );
}
