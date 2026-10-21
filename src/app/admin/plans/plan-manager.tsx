"use client";

import { useState } from "react";
import { Check, Gift, Plus, X } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Toggle } from "@/components/ui/toggle";
import { DURATIONS, savingsPercent, type DurationKey } from "@/lib/billing";
import { ADDON_KINDS, ADDON_KIND_LABELS, STORE_MODULES, STORE_MODULE_INFO, type AddonKind, type StoreModule } from "@/lib/constants";
import { FEATURES, FEATURE_INFO, type Feature } from "@/lib/entitlements";
import { dirhamToInput, formatMoney, inputToDirham } from "@/lib/money";
import type { DurationPerks, PlanLimits, PlanPrices } from "@/db/schema/platform";
import { saveAddonAction, savePlanAction } from "../actions";

export type AdminPlan = {
  id: string; slug: string; nameAr: string; descriptionAr: string | null; prices: PlanPrices; comparePrices: PlanPrices; durationPerks: DurationPerks;
  isFeatured: boolean; isFree: boolean; sortOrder: number; isActive: boolean; limits: PlanLimits; storeCount: number;
};
export type AdminAddon = { id: string; slug: string; nameAr: string; kind: AddonKind; units: number; monthlyPrice: number; isActive: boolean; sortOrder: number };

const LIMITS: { key: "maxProducts" | "maxStaff" | "maxOrdersPerMonth" | "maxWarehouses"; label: string; unit: string }[] = [
  { key: "maxProducts", label: "حد المنتجات", unit: "منتج" },
  { key: "maxStaff", label: "حد الموظفين", unit: "موظف" },
  { key: "maxOrdersPerMonth", label: "طلبيات في الشهر", unit: "طلبية/شهر" },
  { key: "maxWarehouses", label: "حد المخازن", unit: "مخزن" },
];
const limitText = (n: number | null | undefined, unit: string) => (n == null ? `${unit} بدون حد` : `${n} ${unit}`);
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
const money = (n: number | null | undefined) => (n == null ? "" : dirhamToInput(n) || "0");

function PlanForm({ initial, onClose }: { initial?: AdminPlan; onClose: () => void }) {
  const lim = initial?.limits;
  const [v, setV] = useState({
    slug: initial?.slug ?? "", nameAr: initial?.nameAr ?? "", descriptionAr: initial?.descriptionAr ?? "",
    isFeatured: initial?.isFeatured ?? false, isFree: initial?.isFree ?? false, sortOrder: String(initial?.sortOrder ?? 0), isActive: initial?.isActive ?? true,
    prices: Object.fromEntries(DURATIONS.map((d) => [d.key, money(initial?.prices[d.key])])) as Record<DurationKey, string>,
    compare: Object.fromEntries(DURATIONS.map((d) => [d.key, money(initial?.comparePrices[d.key])])) as Record<DurationKey, string>,
    perkDesigns: Object.fromEntries(DURATIONS.map((d) => [d.key, String(initial?.durationPerks[d.key]?.freeDesigns ?? "")])) as Record<DurationKey, string>,
    perkNote: Object.fromEntries(DURATIONS.map((d) => [d.key, initial?.durationPerks[d.key]?.note ?? ""])) as Record<DurationKey, string>,
    limits: Object.fromEntries(LIMITS.map((l) => [l.key, lim ? (lim[l.key] == null ? "" : String(lim[l.key])) : l.key === "maxWarehouses" ? "1" : ""])) as Record<(typeof LIMITS)[number]["key"], string>,
    freeDesigns: String(lim?.freeDesigns ?? 0),
    features: Object.fromEntries(FEATURES.map((f) => [f, lim?.[f] === true])) as Record<Feature, boolean>,
    modules: Object.fromEntries(STORE_MODULES.map((m) => [m, lim?.modules?.[m] === true])) as Record<StoreModule, boolean>,
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const { act, pending, error } = useAct();
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV({ ...v, [k]: val });

  function submit() {
    setLocalError(null);
    const prices: Record<string, number | null> = {}, comparePrices: Record<string, number | null> = {}, durationPerks: DurationPerks = {};
    for (const d of DURATIONS) {
      const p = v.prices[d.key].trim(), c = v.compare[d.key].trim();
      prices[d.key] = p === "" ? null : (inputToDirham(p) ?? NaN);
      if (c) comparePrices[d.key] = inputToDirham(c) ?? NaN;
      const designs = Number(v.perkDesigns[d.key]) || 0, note = v.perkNote[d.key].trim();
      if (designs || note) durationPerks[d.key] = { ...(designs ? { freeDesigns: designs } : {}), ...(note ? { note } : {}) };
      if (Number.isNaN(prices[d.key]) || Number.isNaN(comparePrices[d.key])) return setLocalError(`سعر «${d.unit}» لازم يكون رقم بالدينار`);
    }
    const limits = {
      ...Object.fromEntries(LIMITS.map((l) => [l.key, numOrNull(v.limits[l.key])])),
      freeDesigns: Number(v.freeDesigns) || 0, ...v.features, modules: v.modules,
    };
    act(() => savePlanAction({
      id: initial?.id, slug: initial ? undefined : v.slug, nameAr: v.nameAr, descriptionAr: v.descriptionAr, prices, comparePrices, durationPerks,
      isFeatured: v.isFeatured, isFree: v.isFree, sortOrder: Number(v.sortOrder) || 0, isActive: v.isActive, limits,
    }), "تم حفظ الباقة", onClose);
  }

  return (
    <Modal open onClose={onClose} title={initial ? `تعديل باقة ${initial.nameAr}` : "باقة جديدة"} className="max-w-2xl"
      footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={submit}>حفظ</Button></>}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {!initial && <Input label="الرمز (إنجليزي)" dir="ltr" className="text-right" value={v.slug} maxLength={24} onChange={(e) => set("slug", e.target.value.toLowerCase())} hint="مثال: pro" />}
          <Input label="الاسم" value={v.nameAr} maxLength={30} onChange={(e) => set("nameAr", e.target.value)} />
          <Input label="الترتيب" inputMode="numeric" value={v.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </div>
        <Textarea label="جملة تعريف (تبان في كرت الباقة)" rows={2} maxLength={160} value={v.descriptionAr} onChange={(e) => set("descriptionAr", e.target.value)} />

        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">السعر لكل مدة</legend>
          <p className="text-xs text-muted">المدة الفاضية ما تطلعش للزبون. «السعر الأصلي» اختياري ويبان مشطوب. نسبة التوفير تتحسب بروحها مقارنة بالشهري.</p>
          {DURATIONS.map((d) => (
            <div key={d.key} className="grid grid-cols-2 gap-2 border-t border-line pt-3 first-of-type:border-0 first-of-type:pt-0 sm:grid-cols-4">
              <Input label={`${d.unit} (د.ل)`} inputMode="decimal" value={v.prices[d.key]} onChange={(e) => set("prices", { ...v.prices, [d.key]: e.target.value })} placeholder="ما تطلعش" />
              <Input label="السعر الأصلي" inputMode="decimal" value={v.compare[d.key]} onChange={(e) => set("compare", { ...v.compare, [d.key]: e.target.value })} placeholder="اختياري" />
              <Input label="تصميم مجاني" inputMode="numeric" value={v.perkDesigns[d.key]} onChange={(e) => set("perkDesigns", { ...v.perkDesigns, [d.key]: e.target.value })} placeholder="0" />
              <Input label="ميزة المدة" value={v.perkNote[d.key]} maxLength={80} onChange={(e) => set("perkNote", { ...v.perkNote, [d.key]: e.target.value })} placeholder="مثلاً: ريل مجاناً" />
            </div>
          ))}
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">الحدود</legend>
          <div className="grid grid-cols-2 gap-3">
            {LIMITS.map((l) => <Input key={l.key} label={l.label} inputMode="numeric" value={v.limits[l.key]} onChange={(e) => set("limits", { ...v.limits, [l.key]: e.target.value })} hint="فاضي = بدون حد" />)}
          </div>
          <Input label="تصاميم مجانية في كل فترة (لكل المدد)" inputMode="numeric" value={v.freeDesigns} onChange={(e) => set("freeDesigns", e.target.value)} hint="0 = ما فيه. لمدة وحدة بس استعمل «تصميم مجاني» فوق" />
        </fieldset>

        <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">المميزات</legend>
          {FEATURES.map((f) => <Toggle key={f} label={FEATURE_INFO[f].title} checked={v.features[f]} onChange={(c) => set("features", { ...v.features, [f]: c })} />)}
        </fieldset>

        <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">الوحدات</legend>
          {STORE_MODULES.map((m) => <Toggle key={m} label={STORE_MODULE_INFO[m].title} checked={v.modules[m]} onChange={(c) => set("modules", { ...v.modules, [m]: c })} />)}
        </fieldset>

        <div className="space-y-3">
          <Toggle label="فعّالة (تظهر في الأسعار)" checked={v.isActive} onChange={(c) => set("isActive", c)} />
          <Toggle label="الأكثر طلباً (شارة في صفحة الأسعار)" checked={v.isFeatured} onChange={(c) => set("isFeatured", c)} />
          <Toggle label="باقة مجانية للأبد" hint="تبان بس لما تطلقها من «إعدادات المنصة»" checked={v.isFree} onChange={(c) => set("isFree", c)} />
        </div>
        {(localError ?? error) && <p role="alert" className={errorClass}>{localError ?? error}</p>}
      </div>
    </Modal>
  );
}

function AddonForm({ initial, onClose }: { initial?: AdminAddon; onClose: () => void }) {
  const [v, setV] = useState({ slug: initial?.slug ?? "", nameAr: initial?.nameAr ?? "", kind: initial?.kind ?? ("staff" as AddonKind), units: String(initial?.units ?? 1), price: money(initial?.monthlyPrice ?? 0), isActive: initial?.isActive ?? true, sortOrder: String(initial?.sortOrder ?? 0) });
  const [localError, setLocalError] = useState<string | null>(null);
  const { act, pending, error } = useAct();
  function submit() {
    const monthlyPrice = inputToDirham(v.price);
    if (monthlyPrice == null) return setLocalError("اكتب السعر بالدينار (أرقام)");
    act(() => saveAddonAction({ id: initial?.id, slug: initial ? undefined : v.slug, nameAr: v.nameAr, kind: v.kind, units: Number(v.units) || 1, monthlyPrice, isActive: v.isActive, sortOrder: Number(v.sortOrder) || 0 }), "تم حفظ الإضافة", onClose);
  }
  return (
    <Modal open onClose={onClose} title={initial ? `تعديل ${initial.nameAr}` : "إضافة جديدة"}
      footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={submit}>حفظ</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {!initial && <Input label="الرمز (إنجليزي)" dir="ltr" className="text-right" value={v.slug} maxLength={24} onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase() })} />}
          <Input label="الاسم" value={v.nameAr} maxLength={40} onChange={(e) => setV({ ...v, nameAr: e.target.value })} />
          <Select label="النوع" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as AddonKind })}>{ADDON_KINDS.map((k) => <option key={k} value={k}>{ADDON_KIND_LABELS[k]}</option>)}</Select>
          {v.kind !== "custom_domain" && <Input label="كم تزيد الوحدة" inputMode="numeric" value={v.units} onChange={(e) => setV({ ...v, units: e.target.value })} hint={v.kind === "products" ? "مثلاً 500 منتج" : "عادة 1"} />}
          <Input label="السعر في الشهر (د.ل)" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
          <Input label="الترتيب" inputMode="numeric" value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: e.target.value })} />
        </div>
        <Toggle label="فعّالة" checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} />
        {(localError ?? error) && <p role="alert" className={errorClass}>{localError ?? error}</p>}
      </div>
    </Modal>
  );
}

export function PlanManager({ plans, addons }: { plans: AdminPlan[]; addons: AdminAddon[] }) {
  const [editing, setEditing] = useState<AdminPlan | "new" | null>(null);
  const [addon, setAddon] = useState<AdminAddon | "new" | null>(null);
  return (
    <div className="space-y-8">
      <section className="space-y-4" aria-labelledby="plans-h">
        <div className="flex items-center justify-between gap-3"><h2 id="plans-h" className="text-lg">الباقات</h2><Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> باقة جديدة</Button></div>
        <ul className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <li key={p.id}>
              <Card className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div><h3 className="text-lg">{p.nameAr}</h3><p dir="ltr" className="text-start text-xs text-muted">{p.slug} · {p.storeCount} متجر</p></div>
                  <div className="flex flex-wrap justify-end gap-1.5">{p.isFeatured && <Badge tone="gold">الأكثر طلباً</Badge>}{p.isFree && <Badge tone="teal">مجانية</Badge>}{!p.isActive && <Badge>موقوفة</Badge>}</div>
                </div>
                {p.descriptionAr && <p className="text-sm text-muted">{p.descriptionAr}</p>}
                <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                  {DURATIONS.map((d) => {
                    const price = p.prices[d.key], cmp = p.comparePrices[d.key], save = savingsPercent(p, d.cycle), perk = p.durationPerks[d.key];
                    return (
                      <li key={d.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span className="text-muted">{d.unit}</span>
                        {price == null ? <span className="text-muted">ما تطلعش</span> : (
                          <span className="flex flex-wrap items-center gap-2">
                            {cmp != null && <s className="text-muted">{formatMoney(cmp)}</s>}
                            <b className="tabular-nums">{p.isFree && price === 0 ? "مجاناً" : formatMoney(price)}</b>
                            {save > 0 && <Badge tone="success">وفّر {save}%</Badge>}
                            {perk && <span className="inline-flex items-center gap-1 text-xs text-link-strong"><Gift className="size-3.5" aria-hidden />{perk.note || `${perk.freeDesigns} تصميم مجاني`}</span>}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <ul className="space-y-1 text-sm">
                  {LIMITS.map((l) => <li key={l.key}>{limitText(p.limits[l.key], l.unit)}</li>)}
                </ul>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {FEATURES.map((f) => <li key={f} className={`flex items-center gap-1 ${p.limits[f] ? "" : "text-muted"}`}>{p.limits[f] ? <Check className="size-3.5 text-success-fg" aria-hidden /> : <X className="size-3.5" aria-hidden />}{FEATURE_INFO[f].title}</li>)}
                  {STORE_MODULES.filter((m) => p.limits.modules?.[m]).map((m) => <li key={m} className="flex items-center gap-1"><Check className="size-3.5 text-success-fg" aria-hidden />{STORE_MODULE_INFO[m].title}</li>)}
                </ul>
                <Button variant="outline" size="sm" className="mt-auto" onClick={() => setEditing(p)}>تعديل</Button>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4" aria-labelledby="addons-h">
        <div className="flex items-center justify-between gap-3">
          <div><h2 id="addons-h" className="text-lg">الإضافات</h2><p className="text-sm text-muted">تنباع فوق الباقة بسعر شهري، وتتسجل مع دفعة الاشتراك. الحد الفعلي = حد الباقة + الإضافات.</p></div>
          <Button variant="outline" onClick={() => setAddon("new")}><Plus className="size-4" aria-hidden /> إضافة</Button>
        </div>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {addons.length === 0 && <li className="p-4 text-center text-sm text-muted">ما فيش إضافات.</li>}
          {addons.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div><p className="font-semibold">{a.nameAr} {!a.isActive && <Badge>موقوفة</Badge>}</p><p className="text-sm text-muted">{ADDON_KIND_LABELS[a.kind]}{a.kind !== "custom_domain" ? ` · +${a.units}` : ""} · {formatMoney(a.monthlyPrice)} / شهر</p></div>
              <Button size="sm" variant="ghost" onClick={() => setAddon(a)}>تعديل</Button>
            </li>
          ))}
        </ul>
      </section>

      {editing && <PlanForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {addon && <AddonForm key={addon === "new" ? "new" : addon.id} initial={addon === "new" ? undefined : addon} onClose={() => setAddon(null)} />}
    </div>
  );
}
