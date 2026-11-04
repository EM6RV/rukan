"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Copy, Flower2, Gem, MessageCircle, Shirt, SprayCan, Store, UtensilsCrossed, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { IdentityPicker } from "@/components/dashboard/identity-picker";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS, type BusinessType, type StoreTemplate } from "@/lib/constants";
import { slugify } from "@/lib/slugify";
import { whatsappShareUrl } from "@/lib/store-url";
import {
  checkSlugAction, finishOnboardingAction, saveBasicsAction, saveDeliveryAction, saveIdentityAction, saveTypeAction,
} from "./actions";

export type WizardProps = {
  initialStep: number; // 2..6
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
  trialDays: number;
};

const STEP_TITLES = ["الحساب", "متجرك", "نشاطك", "الهوية", "التوصيل", "جاهز!"];
const TYPE_ICONS: Record<BusinessType, LucideIcon> = {
  clothing: Shirt, perfume: SprayCan, beauty: Flower2, accessories: Gem, food: UtensilsCrossed, other: Store,
};

export function Wizard(props: WizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(props.initialStep);
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

  const storeLink = props.urlPattern.replace("{slug}", slug || "اسم-متجرك");

  // فحص توفر الرابط فوراً (debounce)
  const seq = useRef(0);
  useEffect(() => {
    if (step !== 2 || !slug) return;
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

  function run(fn: () => Promise<{ ok: boolean; error?: string } | void>, next: number) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r && !r.ok) return setError(r.error ?? "صار خطأ عندنا. جرّب مرة ثانية، ولو تكرر كلمنا.");
      setStep(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const back = () => { setError(null); setStep((s) => Math.max(2, s - 1)); };

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <Progress step={step} />
      <Card>
        <CardBody className="space-y-6 p-5 sm:p-7">
          {step === 2 && (
            <section className="space-y-5">
              <Header title="شن اسم متجرك؟" subtitle="هذا الاسم يظهر لزباينك. وتقدر تغيّره بعدين." />
              <Input label="اسم المتجر" value={name} onChange={(e) => onNameChange(e.target.value)} maxLength={40} autoFocus placeholder="مثال: عطور سارة" />
              <div className="space-y-1.5">
                <label htmlFor="slug" className="block text-sm font-medium">رابط المتجر</label>
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

          {step === 3 && (
            <section className="space-y-5">
              <Header title="شن نوع نشاطك؟" subtitle="نقترحوا لك قالب وألوان تناسبه، وتقدر تعدلها بعد شوية." />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {BUSINESS_TYPES.map((bt) => {
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

          {step === 4 && (
            <section className="space-y-6">
              <Header title="هوية متجرك" subtitle="اللوجو والألوان والقالب." />
              <IdentityPicker
                logo={logo} onLogo={setLogo} template={template} onTemplate={setTemplate}
                primary={primary} accent={accent} onColors={(p, a) => { setPrimary(p); setAccent(a); }} allTemplates={props.allTemplates}
              />
            </section>
          )}

          {step === 5 && (
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

          {step === 6 && (
            <section className="space-y-6 text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success/15 text-success-fg"><Check className="size-8" /></div>
              <Header title="متجرك جاهز! 🎉" subtitle={`عندك ${props.trialDays} يوم تجربة مجانية. ابدا بإضافة منتجاتك.`} />
              <div dir="ltr" className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-3 text-start text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{storeLink}</span>
                <button type="button" aria-label="نسخ الرابط" className="rounded-md p-2 hover:bg-surface"
                  onClick={async () => { try { await navigator.clipboard.writeText(storeLink); toast("تم نسخ الرابط"); } catch { toast("ما قدرنا ننسخ الرابط. انسخه بإيدك.", "error"); } }}>
                  <Copy className="size-4" />
                </button>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <a href={whatsappShareUrl(`افتحت متجري الجديد «${name}» على رُكن 🎉\n${storeLink}`)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#25D366] px-5 text-[15px] font-semibold text-navy hover:brightness-95">
                  <MessageCircle className="size-5" /> شارك على واتساب
                </a>
                <Button size="md" loading={pending} onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const r = await finishOnboardingAction();
                    if (!r.ok) return setError(r.error);
                    router.replace("/dashboard");
                  });
                }}>الذهاب للوحة التحكم</Button>
              </div>
            </section>
          )}

          {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{error}</p>}

          {step < 6 && (
            <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
              {step > 2 ? <Button variant="ghost" onClick={back} disabled={pending}>رجوع</Button> : <span />}
              <Button
                size="lg" loading={pending}
                disabled={(step === 2 && (!name.trim() || slugState.status === "bad" || !slug)) || (step === 3 && !type) || (step === 5 && (!cityId || (bank && (!bankName.trim() || !bankAccount.trim()))))}
                onClick={() => {
                  if (step === 2) run(() => saveBasicsAction({ name, slug }), 3);
                  if (step === 3) run(async () => {
                    const r = await saveTypeAction(type!);
                    if (r.ok) { setTemplate(r.data.template as StoreTemplate); setPrimary(r.data.primary); setAccent(r.data.accent); }
                    return r;
                  }, 4);
                  if (step === 4) run(() => saveIdentityAction({ template, primaryColor: primary, accentColor: accent, logoMediaId: logo?.id ?? null }), 5);
                  if (step === 5) run(() => saveDeliveryAction({ cityId, feeInCity, feeOther, freeDeliveryOver: freeOn ? freeOver : null, bankTransfer: bank, bankName, accountNumber: bankAccount }), 6);
                }}
              >
                {step === 5 ? "إنهاء" : "التالي"}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div className="space-y-2" aria-label={`الخطوة ${step} من 6`}>
      <div className="flex items-center justify-between text-sm text-muted"><span>الخطوة {step} من 6</span><span className="font-medium text-fg">{STEP_TITLES[step - 1]}</span></div>
      <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={6} aria-valuenow={step}>
        {STEP_TITLES.map((_, i) => <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i + 1 <= step ? "bg-gold" : "bg-line")} />)}
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

