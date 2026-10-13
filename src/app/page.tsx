import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Banknote, Check, BarChart3, MapPin, MessageCircle, Palette, RotateCcw, ShieldCheck, Smartphone, Store, Truck, Users, Zap, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { MockStore } from "@/components/marketing/mock-store";
import { Pricing } from "@/components/marketing/pricing";
import { ButtonLink } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/motion";
import type { FeatureIcon } from "@/lib/site-content";
import { toWhatsappNumber } from "@/lib/phone";
import { safeJsonLd } from "@/lib/text";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";
import { waLink } from "@/lib/whatsapp";
import { getMarketingData } from "@/server/admin/site-cache";

const ICONS: Record<FeatureIcon, LucideIcon> = { truck: Truck, banknote: Banknote, rotate: RotateCcw, map: MapPin, message: MessageCircle, shield: ShieldCheck, palette: Palette, chart: BarChart3, smartphone: Smartphone, zap: Zap, store: Store, users: Users };

// ديناميكية: الصفحة تقرا القاعدة (محتوى وأسعار)، والقاعدة وقت البناء على Render لسا فاضية (الـ migrations تشتغل عند التشغيل). الكاش داخل getMarketingData.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await getMarketingData();
  return { title: { absolute: content.seo.title }, description: content.seo.description, openGraph: { title: content.seo.title, description: content.seo.description, locale: "ar_LY", type: "website", siteName: "رُكن" }, alternates: { canonical: "/" } };
}

/** عنوان قسم موحّد: عنوان + خط ذهبي قصير + وصف (تصميم فقط) */
function SectionHead({ title, subtitle, light }: { title: string; subtitle?: string; light?: boolean }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center md:mb-12">
      <h2 className={`text-balance text-3xl tracking-tight md:text-4xl ${light ? "text-white" : ""}`}>{title}</h2>
      <span aria-hidden className="mx-auto mt-4 block h-1 w-12 rounded-full bg-gold" />
      {subtitle && <p className={`mt-4 text-lg leading-8 ${light ? "text-white/75" : "text-muted"}`}>{subtitle}</p>}
    </div>
  );
}

export default async function Home() {
  const { content: c, plans, supportWhatsapp, trialDays } = await getMarketingData();
  const support = supportWhatsapp ? toWhatsappNumber(supportWhatsapp) : null;
  const heroImg = c.hero.imageMediaId;
  const demo = c.showcase.items[0];

  return (
    <div data-theme="light" className="min-h-dvh bg-bg text-fg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd([
        { "@context": "https://schema.org", "@type": "Organization", name: "رُكن", url: "/", logo: "/brand/rukn-logo.png", slogan: "ركنك في السوق… أونلاين." },
        { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: c.faq.items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
      ]) }} />

      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" aria-label="رُكن"><Logo className="h-9" priority /></Link>
          <nav aria-label="الموقع" className="hidden items-center gap-6 text-[15px] font-medium text-muted md:flex">
            <a href="#features" className="hover:text-fg">المميزات</a><a href="#pricing" className="hover:text-fg">الأسعار</a><a href="#faq" className="hover:text-fg">أسئلة شائعة</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-semibold hover:bg-surface-2">دخول</Link>
            <ButtonLink href="/register" size="sm">{c.hero.primaryCta}</ButtonLink>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden bg-navy text-white">
          {/* خلفية: توهّج ذهبي وتركوازي + شبكة نقاط خفيفة (زينة فقط) */}
          <div aria-hidden className="pointer-events-none absolute -top-40 -start-40 -z-10 size-[34rem] rounded-full bg-gold/25 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-48 -end-32 -z-10 size-[30rem] rounded-full bg-teal/30 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:py-24 lg:grid-cols-2">
            <div className="space-y-7 text-center lg:text-start">
              <FadeIn><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-gold ring-1 ring-white/15 backdrop-blur"><span aria-hidden className="size-1.5 rounded-full bg-gold" />{c.hero.badge}</span></FadeIn>
              <FadeIn delay={0.06}><h1 className="text-balance text-4xl leading-[1.25] tracking-tight text-white sm:text-5xl lg:text-6xl">{c.hero.title}</h1></FadeIn>
              <FadeIn delay={0.12}><p className="mx-auto max-w-xl text-lg leading-8 text-white/80 lg:mx-0">{c.hero.subtitle}</p></FadeIn>
              <FadeIn delay={0.18} className="flex flex-wrap justify-center gap-3 lg:justify-start">
                <ButtonLink href="/register" size="lg" className="shadow-lift shadow-gold/20">{c.hero.primaryCta}<ArrowLeft className="size-5" aria-hidden /></ButtonLink>
                {c.hero.secondaryCta && <ButtonLink href="#pricing" size="lg" variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/10">{c.hero.secondaryCta}</ButtonLink>}
              </FadeIn>
              <FadeIn delay={0.24}>
                <ul className="flex flex-wrap justify-center gap-2 text-sm text-white/85 lg:justify-start">
                  {[`تجربة مجانية ${trialDays} يوم`, "بدون بطاقة بنكية", "الدفع كاش أو تحويل"].map((t) => (
                    <li key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1 ring-1 ring-white/10"><Check className="size-3.5 text-gold" aria-hidden />{t}</li>
                  ))}
                </ul>
              </FadeIn>
            </div>
            <FadeIn delay={0.14} className="mx-auto w-full max-w-md">
              {heroImg ? (
                <img src={mediaUrl(heroImg, 960)} srcSet={mediaSrcSet(heroImg, [640, 960, 1280])} sizes="(min-width: 1024px) 28rem, 100vw" alt="" className="w-full rounded-3xl shadow-lift ring-1 ring-white/15" fetchPriority="high" />
              ) : demo ? (
                <div className="relative">
                  <div aria-hidden className="absolute inset-4 -z-10 rounded-3xl bg-gold/30 blur-2xl" />
                  <MockStore {...demo} className="rotate-1 ring-1 ring-white/20 shadow-2xl shadow-black/30" />
                  <MockStore {...(c.showcase.items[1] ?? demo)} className="absolute -bottom-8 -start-8 hidden w-44 -rotate-6 ring-1 ring-white/20 shadow-2xl shadow-black/40 sm:block" />
                </div>
              ) : null}
            </FadeIn>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 md:py-20">
          <SectionHead title={c.features.title} subtitle={c.features.subtitle} />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.features.items.map((f, i) => {
              const Icon = ICONS[f.icon];
              return (
                <li key={f.title} className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-soft transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-lift">
                  <span aria-hidden className="absolute inset-x-0 top-0 h-1 origin-center scale-x-0 bg-gradient-to-l from-gold to-teal transition-transform duration-300 group-hover:scale-x-100" />
                  <div className={`mb-5 flex size-12 items-center justify-center rounded-xl shadow-soft ${["bg-navy text-gold", "bg-teal text-white", "bg-gold text-navy"][i % 3]}`}><Icon className="size-6" aria-hidden /></div>
                  <h3 className="text-lg">{f.title}</h3><p className="mt-2 leading-7 text-muted">{f.text}</p>
                </li>
              );
            })}
          </ul>
        </section>

        {c.showcase.items.length > 0 && (
          <section className="relative bg-surface-2 py-16 md:py-20">
            <div className="mx-auto max-w-6xl px-4">
              <SectionHead title={c.showcase.title} subtitle={c.showcase.subtitle} />
              <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {c.showcase.items.map((s) => {
                  const inner = (<><MockStore {...s} /><p className="mt-4 text-center text-lg font-semibold">{s.name}</p><p className="text-center text-sm text-muted">{s.category}</p></>);
                  return <li key={s.name}>{s.href ? (s.href.startsWith("/") ? <Link href={s.href} className="block transition-transform duration-200 ease-out hover:-translate-y-1.5">{inner}</Link> : <a href={s.href} target="_blank" rel="noopener noreferrer" className="block transition-transform duration-200 ease-out hover:-translate-y-1.5">{inner}</a>) : inner}</li>;
                })}
              </ul>
              <p className="mt-8 text-center text-sm text-muted">أمثلة توضيحية لتصاميم القوالب.</p>
            </div>
          </section>
        )}

        <section className="mx-auto max-w-5xl px-4 py-16 md:py-20">
          <SectionHead title={c.steps.title} />
          <ol className="relative grid gap-6 md:grid-cols-3">
            <span aria-hidden className="absolute inset-x-[16%] top-[3.25rem] hidden h-px bg-gradient-to-l from-gold/0 via-gold to-gold/0 md:block" />
            {c.steps.items.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl border border-line bg-surface p-7 text-center shadow-soft">
                <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-gold text-lg font-bold tabular-nums text-navy ring-8 ring-surface">{i + 1}</span>
                <h3 className="text-lg">{s.title}</h3><p className="mt-2 leading-7 text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="pricing" className="scroll-mt-20 bg-surface-2 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHead title={c.pricing.title} subtitle={c.pricing.subtitle} />
            {plans.length > 0 ? <Pricing plans={plans} cta={c.hero.primaryCta} /> : <p className="text-center text-muted">الأسعار قريباً.</p>}
            <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted">{c.pricing.note}</p>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16 md:py-20">
          <SectionHead title={c.faq.title} />
          <div className="space-y-3">
            {c.faq.items.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-line bg-surface p-5 shadow-soft transition-shadow open:border-gold/40 open:shadow-lift">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden">{f.q}<span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy text-lg leading-none text-gold transition-transform duration-200 group-open:rotate-45">+</span></summary>
                <p className="mt-3 leading-7 text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="px-4 pb-16">
          <div className="relative isolate mx-auto max-w-4xl overflow-hidden rounded-3xl bg-navy px-6 py-14 text-center text-white shadow-lift md:py-16">
            <div aria-hidden className="pointer-events-none absolute -top-24 start-1/2 -z-10 size-80 -translate-x-1/2 rounded-full bg-gold/25 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
            <h2 className="text-balance text-3xl tracking-tight text-white md:text-4xl">{c.cta.title}</h2><p className="mx-auto mt-3 max-w-lg text-lg text-white/80">{c.cta.subtitle}</p>
            <ButtonLink href="/register" size="lg" className="mt-8 shadow-lift shadow-gold/20">{c.cta.button}<ArrowLeft className="size-5" aria-hidden /></ButtonLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm">
          <div className="flex items-center gap-3"><Logo className="h-8" /><span className="text-muted">{c.footer.text}</span></div>
          <nav aria-label="روابط" className="flex flex-wrap items-center gap-5 font-medium">
            <Link href="/login" className="hover:underline">تسجيل الدخول</Link><Link href="/register" className="hover:underline">فتح متجر</Link>
            {support && <a href={waLink(support, "السلام عليكم، عندي سؤال عن منصة رُكن")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-success-fg hover:underline"><MessageCircle className="size-4" aria-hidden /> تواصل معانا</a>}
          </nav>
        </div>
      </footer>
    </div>
  );
}
