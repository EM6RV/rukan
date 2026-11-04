"use client";

import { daysText } from "@/lib/billing";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Copy, Dumbbell, Flower2, Gamepad2, Gem, MessageCircle, Minus, Plus, Shirt, ShoppingBasket, SprayCan, Store, Trash2, UtensilsCrossed, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { IdentityPicker } from "@/components/dashboard/identity-picker";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { BUSINESS_TYPE_LABELS, STORE_BUSINESS_TYPES, type BusinessType, type StoreTemplate } from "@/lib/constants";
import type { LineSetup } from "@/db/schema/platform";
import { GYM_SECTIONS, GYM_SECTION_LABELS, STATION_KINDS, STATION_KIND_LABELS, type GymSection, type StationKind } from "@/lib/line-setup";
import { LINE_INFO, PRODUCT_LINES, type LineIcon, type ProductLine } from "@/lib/product-lines";
import { slugify } from "@/lib/slugify";
import { whatsappShareUrl } from "@/lib/store-url";
import {
  checkSlugAction, finishOnboardingAction, saveBasicsAction, saveDeliveryAction, saveIdentityAction, saveLineSetupAction, saveTypeAction,
} from "./actions";

export type StepId = "lines" | "basics" | "type" | "identity" | "delivery" | "market" | "lounge" | "gym" | "done";
const STEP_TITLE: Record<StepId, string> = {
  lines: "نوع النشاط", basics: "الاسم والرابط", type: "نشاط المتجر", identity: "الهوية", delivery: "التوصيل",
  market: "رُكن ماركت", lounge: "رُكن بلاي", gym: "رُكن فِت", done: "جاهز!",
};

/** خطوات المعالج حسب المنظومات المختارة */
function stepsFor(lines: ProductLine[], withLines: boolean): StepId[] {
  return [
    ...(withLines ? (["lines"] as const) : []), "basics",
    ...(lines.includes("store") ? (["type", "identity", "delivery"] as const) : []),
    ...(["market", "lounge", "gym"] as const).filter((l) => lines.includes(l)), "done",
  ];
}

export const LINE_ICONS: Record<LineIcon, LucideIcon> = { store: Store, market: ShoppingBasket, lounge: Gamepad2, gym: Dumbbell };

export type WizardProps = {
  initialStep: StepId;
  /** المنظومات المتاحة للاختيار (المطلقة + تجربة الأدمن) */
  available: ProductLine[];
  /** المنظومات المختارة (لو النشاط موجود) */
  lines: ProductLine[];
  setups: Partial<Record<ProductLine, LineSetup>>;
  name: string;
  slug: string;
  businessType: BusinessType | null;
  template: StoreTemplate;
  primary: string;
  accent: string;
  logo: { id: string; url: string } | null;
  cityId: string;
  cities: { id: string; name: string }[];
  allTemplates: boolean;
  urlPattern: string; // مثال: https://{slug}.rukn.ly
  rootDomainLabel: string; // مثال: rukn.ly
  trialDays: Record<ProductLine, number>;
};

const TYPE_ICONS: Record<(typeof STORE_BUSINESS_TYPES)[number], LucideIcon> = {
  clothing: Shirt, perfume: SprayCan, beauty: Flower2, accessories: Gem, food: UtensilsCrossed, other: Store,
};

export function Wizard(props: WizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<StepId>(props.initialStep);
  const [lines, setLines] = useState<ProductLine[]>(props.lines);
  const steps = stepsFor(lines, props.available.length > 1);
  const next = (from: StepId): StepId => steps[steps.indexOf(from) + 1] ?? "done";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // الحالة
  const [name, setName] = useState(props.name);
  const [slug, setSlug] = useState(props.slug);
  const [slugTouched, setSlugTouched] = useState(!!props.slug);
  const [slugState, setSlugState] = useState<{ status: "idle" | "checking" | "ok" | "bad"; message?: string }>({ status: "idle" });
  const [type, setType] = useState<BusinessType | null>(props.businessType);
  const [template, setTemplate] = useState(props.template);
  const [primary, setPrimary] = useState(props.primary);
  const [accent, setAccent] = useState(props.accent);
  const [logo, setLogo] = useState(props.logo);
  const [cityId, setCityId] = useState(props.cityId);
  const [feeInCity, setFeeInCity] = useState("10");
  const [feeOther, setFeeOther] = useState("25");
  const [freeOn, setFreeOn] = useState(false);
  const [freeOver, setFreeOver] = useState("300");
  const [bank, setBank] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  // المعالجات القصيرة
  const ms = props.setups.market?.market;
  const [market, setMarket] = useState({ shopName: ms?.shopName ?? props.name, registers: ms?.registers ?? 1, wholesale: ms?.wholesale ?? false, scale: ms?.scale ?? false });
  const ls = props.setups.lounge?.lounge;
  const [stations, setStations] = useState<Record<StationKind, number>>(() => Object.fromEntries(STATION_KINDS.map((k) => [k, ls?.stations?.find((x) => x.type === k)?.count ?? 0])) as Record<StationKind, number>);
  const [hourly, setHourly] = useState(ls?.hourlyPrice ? String(ls.hourlyPrice / 1000) : "5");
  const gs = props.setups.gym?.gym;
  const [sections, setSections] = useState<GymSection[]>(gs?.sections ?? ["men"]);
  const [memberships, setMemberships] = useState(gs?.membershipTypes?.map((m) => ({ name: m.name, months: m.months, price: String(m.price / 1000) })) ?? [
    { name: "شهر", months: 1, price: "100" }, { name: "3 شهور", months: 3, price: "270" }, { name: "سنة", months: 12, price: "900" },
  ]);
  const [trainers, setTrainers] = useState((gs?.trainers ?? []).join("\n"));

  const storeLink = props.urlPattern.replace("{slug}", slug || "اسم-متجرك");

  // فحص توفر الرابط فوراً (debounce)
  const seq = useRef(0);
  useEffect(() => {
    if (step !== "basics" || !slug) return;
    const my = ++seq.current;
    const timer = setTimeout(async () => {
      setSlugState({ status: "checking" });
      const r = await checkSlugAction(slug);
      if (my !== seq.current) return;
      setSlugState(r.ok ? { status: "ok" } : { status: "bad", message: r.error });
    }, 450);
    return () => clearTimeout(timer);
  }, [slug, step]);

  function onNameChange(v: string) {
    setName(v);
    // نقترح الرابط تلقائياً لو الاسم فيه حروف إنجليزية ولسا ما عدّل المستخدم الرابط
    if (!slugTouched) {
      const latin = slugify(v.replace(/[^\x00-\x7F]+/g, " "), 30);
      setSlug(latin);
      if (!latin) setSlugState({ status: "idle" });
    }
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string } | void>, to: StepId) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r && !r.ok) return setError(r.error ?? "صار خطأ عندنا. جرّب مرة ثانية، ولو تكرر كلمنا.");
      setStep(to);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const back = () => { setError(null); setStep((s) => steps[Math.max(0, steps.indexOf(s) - 1)]!); };
  const toggleLine = (l: ProductLine) => setLines((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : PRODUCT_LINES.filter((x) => x === l || cur.includes(x))));
  const stationTotal = Object.values(stations).reduce((a, b) => a + b, 0);

  function onNext() {
    if (step === "lines") return run(async () => undefined, next("lines"));
    if (step === "basics") return run(async () => {
      const r = await saveBasicsAction({ name, slug, lines });
      if (r.ok && !market.shopName.trim()) setMarket((m) => ({ ...m, shopName: name.trim() })); // اسم المحل الافتراضي = اسم النشاط
      return r;
    }, next("basics"));
    if (step === "type") return run(async () => {
      const r = await saveTypeAction(type!);
      if (r.ok) { setTemplate(r.data.template as StoreTemplate); setPrimary(r.data.primary); setAccent(r.data.accent); }
      return r;
    }, next("type"));
    if (step === "identity") return run(() => saveIdentityAction({ template, primaryColor: primary, accentColor: accent, logoMediaId: logo?.id ?? null }), next("identity"));
    if (step === "delivery") return run(() => saveDeliveryAction({ cityId, feeInCity, feeOther, freeDeliveryOver: freeOn ? freeOver : null, bankTransfer: bank, bankName, accountNumber: bankAccount }), next("delivery"));
    if (step === "market") return run(() => saveLineSetupAction("market", market), next("market"));
    if (step === "lounge") return run(() => saveLineSetupAction("lounge", { stations: STATION_KINDS.map((k) => ({ type: k, count: stations[k] })), hourlyPrice: hourly }), next("lounge"));
    if (step === "gym") return run(() => saveLineSetupAction("gym", {
      sections, membershipTypes: memberships.map((m) => ({ ...m, months: Number(m.months) })), trainers: trainers.split(/\n|،|,/).map((x) => x.trim()).filter(Boolean),
    }), next("gym"));
  }

  const nextDisabled =
    (step === "lines" && !lines.length) ||
    (step === "basics" && (!name.trim() || slugState.status === "bad" || !slug)) || (step === "type" && !type) ||
    (step === "delivery" && (!cityId || (bank && (!bankName.trim() || !bankAccount.trim())))) ||
    (step === "market" && !market.shopName.trim()) || (step === "lounge" && stationTotal === 0) ||
    (step === "gym" && (!sections.length || !memberships.length));
  const isLastInput = next(step) === "done";

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <Progress steps={steps} step={step} />
      <Card>
        <CardBody className="space-y-6 p-5 sm:p-7">
          {step === "lines" && (
            <section className="space-y-5">
              <Header title="شن نوع نشاطك؟" subtitle="اختار وحدة أو أكثر. كل منظومة لها تجربة مجانية واشتراك لحالها، وكلهم في نفس الحساب." />
              <div className="grid gap-3 sm:grid-cols-2">
                {PRODUCT_LINES.map((l) => {
                  const info = LINE_INFO[l];
                  const Icon = LINE_ICONS[info.icon];
                  const on = lines.includes(l);
                  const soon = !props.available.includes(l);
                  return (
                    <button
                      key={l} type="button" disabled={soon} onClick={() => toggleLine(l)} aria-pressed={on}
                      className={cn("relative flex min-h-36 flex-col items-start gap-2 rounded-xl border p-4 text-start transition-all disabled:cursor-not-allowed disabled:opacity-55",
                        on ? "border-gold bg-gold/10 ring-2 ring-gold/40" : "border-line bg-surface hover:border-gold/60")}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <Icon className="size-8" aria-hidden />
                        {soon ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">قريباً</span>
                          : on && <span className="flex size-6 items-center justify-center rounded-full bg-gold text-navy"><Check className="size-4" aria-hidden /></span>}
                      </span>
                      <span className="text-lg font-semibold">{info.card}</span>
                      <span className="text-xs font-medium text-muted">{info.brand}</span>
                      <span className="text-sm text-muted">{info.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {step === "basics" && (
            <section className="space-y-5">
              <Header title={lines.length === 1 && lines[0] === "store" ? "شن اسم متجرك؟" : "شن اسم نشاطك؟"} subtitle="هذا الاسم يظهر لزباينك. وتقدر تغيّره بعدين." />
              <Input label={lines.length === 1 && lines[0] === "store" ? "اسم المتجر" : "اسم النشاط"} value={name} onChange={(e) => onNameChange(e.target.value)} maxLength={40} autoFocus placeholder="مثال: عطور سارة" />
              <div className="space-y-1.5">
                <label htmlFor="slug" className="block text-sm font-medium">{lines.includes("store") ? "رابط المتجر" : "رابط صفحتك"}</label>
                <div dir="ltr" className="flex items-center overflow-hidden rounded-md border border-line bg-surface focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/30">
                  <input
                    id="slug" value={slug} dir="ltr" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }}
                    placeholder="sara-perfume" maxLength={30}
                    className="h-11 min-w-0 flex-1 bg-transparent px-3.5 text-[15px] outline-none"
                  />
                  <span className="bg-surface-2 px-3 py-3 text-sm text-muted">.{props.rootDomainLabel}</span>
                </div>
                <SlugStatus state={slugState} slug={slug} />
              </div>
            </section>
          )}

          {step === "type" && (
            <section className="space-y-5">
              <Header title="شن تبيع في متجرك؟" subtitle="نقترحوا لك قالب وألوان تناسبه، وتقدر تعدلها بعد شوية." />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {STORE_BUSINESS_TYPES.map((bt) => {
                  const Icon = TYPE_ICONS[bt];
                  const on = type === bt;
                  return (
                    <button
                      key={bt} type="button" onClick={() => setType(bt)} aria-pressed={on}
                      className={cn("flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all", on ? "border-gold bg-gold/10 ring-2 ring-gold/40" : "border-line bg-surface hover:border-gold/60")}
                    >
                      <Icon className="size-7" aria-hidden />
                      {BUSINESS_TYPE_LABELS[bt]}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {step === "identity" && (
            <section className="space-y-6">
              <Header title="هوية متجرك" subtitle="اللوجو والألوان والقالب." />
              <IdentityPicker
                logo={logo} onLogo={setLogo} template={template} onTemplate={setTemplate}
                primary={primary} accent={accent} onColors={(p, a) => { setPrimary(p); setAccent(a); }} allTemplates={props.allTemplates}
              />
            </section>
          )}

          {step === "delivery" && (
            <section className="space-y-5">
              <Header title="المدينة والتوصيل" subtitle="نحسبوا سعر التوصيل حسب مدينة الزبون. تقدر تعدل أسعار كل مدينة بعدين." />
              <Select label="مدينتك" value={cityId} onChange={(e) => setCityId(e.target.value)}>
                <option value="">اختار المدينة</option>
                {props.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="التوصيل داخل مدينتك (د.ل)" inputMode="decimal" value={feeInCity} onChange={(e) => setFeeInCity(e.target.value)} />
                <Input label="التوصيل لباقي المدن (د.ل)" inputMode="decimal" value={feeOther} onChange={(e) => setFeeOther(e.target.value)} />
              </div>
              <Toggle checked={freeOn} onChange={setFreeOn} label="توصيل مجاني فوق مبلغ معين" />
              {freeOn && <Input label="التوصيل مجاني للطلبيات فوق (د.ل)" inputMode="decimal" value={freeOver} onChange={(e) => setFreeOver(e.target.value)} />}
              <div className="space-y-3 border-t border-line pt-4">
                <span className="block text-sm font-medium">طرق الدفع</span>
                <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-sm"><CheckCircle2 className="size-4 text-success-fg" /> الدفع عند الاستلام (مفعّل دايماً)</div>
                <Toggle checked={bank} onChange={setBank} label="تحويل مصرفي (الزبون يرفع إيصال)" />
                {bank && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="اسم المصرف" value={bankName} maxLength={60} onChange={(e) => setBankName(e.target.value)} />
                    <Input label="رقم الحساب / IBAN" dir="ltr" className="text-right" value={bankAccount} maxLength={60} onChange={(e) => setBankAccount(e.target.value)} />
                  </div>
                )}
              </div>
            </section>
          )}

          {step === "market" && (
            <section className="space-y-5">
              <Header title="رُكن ماركت" subtitle="كم سؤال سريع باش نجهزوا لك الكاشير. تقدر تعدّل كل شي بعدين." />
              <Input label="اسم المحل (يطلع في الفاتورة)" value={market.shopName} maxLength={60} onChange={(e) => setMarket({ ...market, shopName: e.target.value })} />
              <Counter label="عدد الكاشيرات" value={market.registers} min={1} max={50} onChange={(v) => setMarket({ ...market, registers: v })} />
              <Toggle checked={market.wholesale} onChange={(v) => setMarket({ ...market, wholesale: v })} label="نبيع جملة كمان" hint="أسعار جملة ونص جملة لزباين معينين." />
              <Toggle checked={market.scale} onChange={(v) => setMarket({ ...market, scale: v })} label="عندي ميزان" hint="خضرة، لحم، أجبان بالوزن، وباركود الميزان." />
            </section>
          )}

          {step === "lounge" && (
            <section className="space-y-5">
              <Header title="رُكن بلاي" subtitle="شن الأجهزة اللي عندك؟ وكم سعر الساعة المبدئي؟" />
              <div className="grid gap-3 sm:grid-cols-2">
                {STATION_KINDS.map((k) => (
                  <Counter key={k} label={STATION_KIND_LABELS[k]} value={stations[k]} min={0} max={200} onChange={(v) => setStations({ ...stations, [k]: v })} />
                ))}
              </div>
              <p className="text-sm text-muted">المجموع: {stationTotal} جهاز</p>
              <Input label="سعر الساعة المبدئي (د.ل)" inputMode="decimal" value={hourly} onChange={(e) => setHourly(e.target.value)} hint="تقدر تحط أسعار حسب عدد اليدات والوقت بعدين." />
            </section>
          )}

          {step === "gym" && (
            <section className="space-y-5">
              <Header title="رُكن فِت" subtitle="الأقسام وأنواع الاشتراكات المبدئية والمدربين." />
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">الأقسام</legend>
                <div className="flex flex-wrap gap-2">
                  {GYM_SECTIONS.map((g) => {
                    const on = sections.includes(g);
                    return (
                      <button key={g} type="button" aria-pressed={on} onClick={() => setSections((c) => (on ? c.filter((x) => x !== g) : [...c, g]))}
                        className={cn("min-h-11 rounded-full border px-4 text-sm font-medium", on ? "border-gold bg-gold/15" : "border-line bg-surface")}>
                        {GYM_SECTION_LABELS[g]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">أنواع الاشتراكات</legend>
                {memberships.map((m, i) => (
                  <div key={i} className="grid grid-cols-[1fr_5rem_6rem_auto] items-end gap-2">
                    <Input label={i === 0 ? "الاسم" : undefined} aria-label="اسم الاشتراك" value={m.name} maxLength={40} onChange={(e) => setMemberships(memberships.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <Input label={i === 0 ? "الشهور" : undefined} aria-label="عدد الشهور" inputMode="numeric" value={String(m.months)} onChange={(e) => setMemberships(memberships.map((x, j) => (j === i ? { ...x, months: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))} />
                    <Input label={i === 0 ? "السعر (د.ل)" : undefined} aria-label="السعر بالدينار" inputMode="decimal" value={m.price} onChange={(e) => setMemberships(memberships.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                    <button type="button" aria-label={`حذف ${m.name || "الاشتراك"}`} onClick={() => setMemberships(memberships.filter((_, j) => j !== i))} className="flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2"><Trash2 className="size-4" /></button>
                  </div>
                ))}
                {memberships.length < 12 && <Button variant="outline" size="sm" onClick={() => setMemberships([...memberships, { name: "", months: 1, price: "" }])}><Plus className="size-4" /> زيد نوع</Button>}
              </fieldset>
              <div className="space-y-1.5">
                <label htmlFor="trainers" className="block text-sm font-medium">المدربين (اختياري، كل اسم في سطر)</label>
                <textarea id="trainers" rows={3} value={trainers} onChange={(e) => setTrainers(e.target.value)} className="w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-[15px] outline-none focus:border-gold focus:ring-2 focus:ring-gold/30" />
              </div>
            </section>
          )}

          {step === "done" && (
            <section className="space-y-6 text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success/15 text-success-fg"><Check className="size-8" /></div>
              <Header title={lines.length === 1 && lines[0] === "store" ? "متجرك جاهز! 🎉" : "منظومتك جاهزة! 🎉"} subtitle="كل منظومة فيها تجربة مجانية. ابدا الحين." />
              <ul className="space-y-2 text-start">
                {lines.map((l) => {
                  const Icon = LINE_ICONS[LINE_INFO[l].icon];
                  return (
                    <li key={l} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-3">
                      <Icon className="size-6 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{LINE_INFO[l].brand}</span>
                        <span className="block text-sm text-muted">تجربة مجانية {daysText(props.trialDays[l])} · {l === "store" ? "متجرك الأونلاين ولوحة التحكم" : LINE_INFO[l].opsLabel}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {lines.includes("store") && (
                <div dir="ltr" className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-3 text-start text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{storeLink}</span>
                  <button type="button" aria-label="نسخ الرابط" className="rounded-md p-2 hover:bg-surface"
                    onClick={async () => { try { await navigator.clipboard.writeText(storeLink); toast("تم نسخ الرابط"); } catch { toast("ما قدرنا ننسخ الرابط. انسخه بإيدك.", "error"); } }}>
                    <Copy className="size-4" />
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <a href={whatsappShareUrl(lines.includes("store") ? `افتحت متجري الجديد «${name}» على رُكن 🎉\n${storeLink}` : `بديت نستعمل ${lines.map((l) => LINE_INFO[l].brand).join(" و")} لـ «${name}» 🎉`)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#25D366] px-5 text-[15px] font-semibold text-navy hover:brightness-95">
                  <MessageCircle className="size-5" /> شارك على واتساب
                </a>
                <Button size="md" loading={pending} onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const r = await finishOnboardingAction();
                    if (!r.ok) return setError(r.error);
                    const first = lines.find((l) => l !== "store");
                    router.replace(lines.includes("store") || !first ? "/dashboard" : LINE_INFO[first].home);
                  });
                }}>الذهاب للوحة التحكم</Button>
              </div>
            </section>
          )}

          {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{error}</p>}

          {step !== "done" && (
            <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
              {steps.indexOf(step) > 0 ? <Button variant="ghost" onClick={back} disabled={pending}>رجوع</Button> : <span />}
              <Button size="lg" loading={pending} disabled={nextDisabled} onClick={onNext}>
                {isLastInput ? "إنهاء" : "التالي"}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Progress({ steps, step }: { steps: StepId[]; step: StepId }) {
  const i = steps.indexOf(step) + 1;
  return (
    <div className="space-y-2" aria-label={`الخطوة ${i} من ${steps.length}`}>
      <div className="flex items-center justify-between text-sm text-muted"><span>الخطوة {i} من {steps.length}</span><span className="font-medium text-fg">{STEP_TITLE[step]}</span></div>
      <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i}>
        {steps.map((s, j) => <div key={s} className={cn("h-1.5 flex-1 rounded-full transition-colors", j + 1 <= i ? "bg-gold" : "bg-line")} />)}
      </div>
    </div>
  );
}

function Counter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-1" role="group" aria-label={label}>
        <button type="button" aria-label={`نقص ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className="flex size-10 items-center justify-center rounded-md hover:bg-surface-2 disabled:opacity-30"><Minus className="size-4" /></button>
        <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{value}</span>
        <button type="button" aria-label={`زيد ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className="flex size-10 items-center justify-center rounded-md hover:bg-surface-2 disabled:opacity-30"><Plus className="size-4" /></button>
      </div>
    </div>
  );
}

const Header = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="space-y-1"><h1 className="text-2xl">{title}</h1>{subtitle && <p className="text-muted">{subtitle}</p>}</div>
);

function SlugStatus({ state, slug }: { state: { status: string; message?: string }; slug: string }) {
  if (!slug) return <p className="text-sm text-muted">حروف إنجليزية صغيرة وأرقام وشرطات (3 إلى 30 حرف).</p>;
  if (state.status === "checking") return <p className="text-sm text-muted">جاري الفحص…</p>;
  if (state.status === "ok") return <p className="flex items-center gap-1 text-sm text-success-fg"><CheckCircle2 className="size-4" /> الرابط متاح</p>;
  if (state.status === "bad") return <p role="alert" className="flex items-center gap-1 text-sm text-danger-fg"><XCircle className="size-4" /> {state.message}</p>;
  return null;
}

