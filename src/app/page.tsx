import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Banknote, Check, BarChart3, Clapperboard, Gift, PenTool, MapPin, MessageCircle, Palette, RotateCcw, ShieldCheck, Smartphone, Store, Truck, Users, Zap, type LucideIcon } from "lucide-react";
import { HeroDemo } from "@/components/marketing/hero-demo";
import { MockStore } from "@/components/marketing/mock-store";
import { SectionHead, SiteFooter, SiteHeader } from "@/components/marketing/site-shell";
import { daysText } from "@/lib/billing";
import { CompareTable } from "@/components/pricing/compare-table";
import { LinePricingTabs } from "@/components/pricing/line-pricing";
import { promoActive } from "@/server/admin/settings";
import { ButtonLink } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/motion";
import { STORE_TEMPLATE_LABELS } from "@/lib/constants";
import type { FeatureIcon } from "@/lib/site-content";
import { safeJsonLd } from "@/lib/text";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";
import { getMarketingData } from "@/server/admin/site-cache";

const ICONS: Record<FeatureIcon, LucideIcon> = { truck: Truck, banknote: Banknote, rotate: RotateCcw, map: MapPin, message: MessageCircle, shield: ShieldCheck, palette: Palette, chart: BarChart3, smartphone: Smartphone, zap: Zap, store: Store, users: Users };

// ديناميكية: الصفحة تقرا القاعدة (محتوى وأسعار)، والقاعدة وقت البناء على Render لسا فاضية (الـ migrations تشتغل عند التشغيل). الكاش داخل getMarketingData.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await getMarketingData();
  const images = [{ url: "/brand/rukn-logo.png", alt: "رُكن" }];
  return { title: { absolute: content.seo.title }, description: content.seo.description, openGraph: { title: content.seo.title, description: content.seo.description, locale: "ar_LY", type: "website", siteName: "رُكن", images }, twitter: { card: "summary", title: content.seo.title, description: content.seo.description, images: images.map((i) => i.url) }, alternates: { canonical: "/" } };
}

export default async function Home() {
  const { content: c, plans, linePlans, supportWhatsapp, trialDays, promo } = await getMarketingData();
  const heroImg = c.hero.imageMediaId;
  const demo = c.showcase.items[0] ?? { name: "عطور الندى", category: "عطور", primary: "#2B1B3D", accent: "#C19E58", template: "makhmal" as const };

  return (
    <div data-theme="light" className="min-h-dvh bg-bg text-fg">
      {promoActive(promo) && (
        <div role="region" aria-label="عرض" className="bg-gold px-4 py-2 text-center text-sm font-semibold text-navy">
          {promo.text}{promo.linkLabel && <> <a href="/register" className="underline underline-offset-4">{promo.linkLabel}</a></>}
        </div>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd([
        { "@context": "https://schema.org", "@type": "Organization", name: "رُكن", url: "/", logo: "/brand/rukn-logo.png", slogan: "ركنك في السوق… أونلاين." },
        { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: c.faq.items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
      ]) }} />

      <SiteHeader cta={c.hero.primaryCta} />

      <main id="main-content" tabIndex={-1} className="outline-none">
        {/* الهيرو */}
        <section className="relative isolate overflow-hidden bg-navy text-white [--focus:#e3c487] [--focus-halo:transparent]">
          <div aria-hidden className="pointer-events-none absolute -top-40 -start-40 -z-10 size-[34rem] rounded-full bg-gold/25 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute top-[28rem] -end-32 -z-10 size-[30rem] rounded-full bg-teal/30 blur-3xl lg:top-[18rem]" />
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 md:py-24 lg:grid-cols-2">
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
                  {[`تجربة مجانية ${daysText(trialDays)}`, "بدون بطاقة بنكية", "الدفع كاش أو تحويل"].map((t) => (
                    <li key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1 ring-1 ring-white/10"><Check className="size-3.5 text-gold" aria-hidden />{t}</li>
                  ))}
                </ul>
              </FadeIn>
            </div>
            <div className="pb-10">
              {heroImg ? (
                <img src={mediaUrl(heroImg, 960)} srcSet={mediaSrcSet(heroImg, [640, 960, 1280])} sizes="(min-width: 1024px) 28rem, 100vw" alt="" className="mx-auto w-full max-w-md rounded-3xl shadow-lift ring-1 ring-white/15" fetchPriority="high" />
              ) : <HeroDemo store={demo} />}
            </div>
          </div>
        </section>

        {/* شريط الثقة */}
        <section aria-label="ليش رُكن" className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-6">
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold">
              {c.trust.items.map((t) => <li key={t} className="inline-flex items-center gap-2"><Check className="size-4 text-success-fg" aria-hidden />{t}</li>)}
            </ul>
            {c.trust.partners.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted">
                <span>{c.trust.partnersTitle}:</span>
                {c.trust.partners.map((p) => <span key={p.name} className="rounded-full border border-line bg-surface-2 px-3 py-1 font-semibold text-fg">{p.name}</span>)}
              </div>
            )}
          </div>
        </section>

        {/* رُكن مش بس متجر */}
        {c.systems.items.length > 0 && (
          <section id="systems" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 md:py-20">
            <SectionHead title={c.systems.title} subtitle={c.systems.subtitle} />
            <ul className="grid gap-5 md:grid-cols-3">
              {c.systems.items.map((x) => (
                <li key={x.slug}>
                  <Link href={`/systems/${x.slug}`} className="group flex h-full flex-col rounded-3xl border border-line bg-surface p-7 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/60 hover:shadow-lift">
                    <span className="text-2xl font-bold">{x.name}</span>
                    <span className="mt-1 text-sm font-semibold text-link-strong">{x.tagline}</span>
                    <span className="mt-3 flex-1 text-sm leading-7 text-muted">{x.text}</span>
                    <span className="mt-5 inline-flex items-center gap-1.5 font-semibold">{x.cta}<ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* شن نشاطك؟ */}
        {c.niches.items.length > 0 && (
          <section id="niches" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 md:py-20">
            <SectionHead title={c.niches.title} subtitle={c.niches.subtitle} />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {c.niches.items.map((n) => (
                <li key={n.slug}>
                  <Link href={`/for/${n.slug}`} className="group flex h-full items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/60 hover:shadow-lift">
                    <span aria-hidden className="size-14 shrink-0 rounded-2xl" style={{ background: `linear-gradient(135deg, ${n.primary} 55%, ${n.accent})` }} />
                    <span className="min-w-0 flex-1"><span className="block text-lg font-bold">{n.title}</span><span className="mt-0.5 line-clamp-2 block text-sm text-muted">{n.headline}</span></span>
                    <ArrowLeft className="size-5 shrink-0 text-muted transition-transform group-hover:-translate-x-1" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* معرض القوالب */}
        {c.templates.items.length > 0 && (
          <section id="templates" className="scroll-mt-20 bg-surface-2 py-16 md:py-20">
            <div className="mx-auto max-w-6xl px-4">
              <SectionHead title={c.templates.title} subtitle={c.templates.subtitle} />
              <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {c.templates.items.map((tp) => (
                  <li key={tp.template} className="flex flex-col">
                    <MockStore name={STORE_TEMPLATE_LABELS[tp.template]} category="متجرك هنا" primary={tp.primary} accent={tp.accent} template={tp.template} />
                    <p className="mt-4 text-center text-lg font-bold">{STORE_TEMPLATE_LABELS[tp.template]}</p>
                    <p className="mt-1 flex-1 text-center text-sm leading-6 text-muted">{tp.blurb}</p>
                    <Link href={`/templates/${tp.template}`} className="mx-auto mt-3 inline-flex h-10 items-center rounded-md border border-line bg-surface px-5 text-sm font-semibold hover:border-gold hover:bg-gold/10">{c.templates.button}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* مميزات كقصص */}
        {c.stories.items.length > 0 && (
          <section id="stories" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 md:py-20">
            <SectionHead title={c.stories.title} subtitle={c.stories.subtitle} />
            <ul className="grid gap-5 md:grid-cols-2">
              {c.stories.items.map((s, i) => {
                const Icon = ICONS[s.icon];
                return (
                  <li key={s.title} className="relative overflow-hidden rounded-3xl border border-line bg-surface p-7 shadow-soft">
                    <div className={`mb-5 flex size-12 items-center justify-center rounded-xl shadow-soft ${["bg-navy text-gold", "bg-teal text-white", "bg-gold text-navy", "bg-navy text-gold"][i % 4]}`}><Icon className="size-6" aria-hidden /></div>
                    <h3 className="text-xl">{s.title}</h3><p className="mt-3 leading-8 text-muted">{s.text}</p>
                    {s.points.length > 0 && <ul className="mt-4 space-y-1.5 text-sm font-medium">{s.points.map((p) => <li key={p} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden />{p}</li>)}</ul>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* مميزات سريعة */}
        <section id="features" className="bg-surface-2 py-14">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHead title={c.features.title} subtitle={c.features.subtitle} />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {c.features.items.map((f, i) => {
                const Icon = ICONS[f.icon];
                return (
                  <li key={f.title} className="rounded-2xl border border-line bg-surface p-5">
                    <div className={`mb-3 flex size-10 items-center justify-center rounded-lg ${["bg-navy text-gold", "bg-teal text-white", "bg-gold text-navy"][i % 3]}`}><Icon className="size-5" aria-hidden /></div>
                    <h3 className="text-base">{f.title}</h3><p className="mt-1.5 text-sm leading-7 text-muted">{f.text}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* خدمات التصميم */}
        <section id="design" className="relative overflow-hidden bg-navy py-16 text-white md:py-20">
          <div aria-hidden className="pointer-events-none absolute -top-24 -start-24 size-72 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-4">
            <div className="mx-auto mb-10 max-w-2xl text-center"><h2 className="text-3xl text-white md:text-4xl">{c.design.title}</h2><p className="mt-3 text-white/75">{c.design.subtitle}</p></div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {c.design.items.map((d, i) => {
                const Icon = [Clapperboard, PenTool, Palette, Gift][i % 4]!;
                return (
                  <li key={d.title} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-colors hover:border-gold/50">
                    <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-gold text-navy"><Icon className="size-5" aria-hidden /></div>
                    <h3 className="text-lg text-white">{d.title}</h3><p className="mt-2 text-sm leading-7 text-white/75">{d.text}</p>
                  </li>
                );
              })}
            </ul>
            <div className="mt-8 text-center"><Link href="/register" className="inline-flex h-12 items-center rounded-md bg-gold px-7 font-semibold text-navy shadow-soft transition-all hover:brightness-95">{c.design.button}</Link></div>
          </div>
        </section>

        {/* أمثلة متاجر */}
        {c.showcase.items.length > 0 && (
          <section className="relative py-16 md:py-20">
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
            {plans.length > 0 || Object.values(linePlans).some((x) => x.length > 0) ? <LinePricingTabs store={plans} lines={linePlans} cta={c.hero.primaryCta} labels={{ popularBadge: c.pricing.popularBadge, rows: c.pricing.rows }} /> : <p className="text-center text-muted">الأسعار قريباً.</p>}
            <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted">{c.pricing.note}</p>
            {plans.length > 0 && (
              <div className="mt-16">
                <SectionHead title={c.pricing.compareTitle} subtitle={c.pricing.compareSubtitle} />
                <CompareTable plans={plans} rows={c.pricing.rows} />
              </div>
            )}
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
          <div className="relative isolate mx-auto max-w-4xl overflow-hidden rounded-3xl bg-navy px-6 py-14 text-center text-white shadow-lift [--focus:#e3c487] [--focus-halo:transparent] md:py-16">
            <div aria-hidden className="pointer-events-none absolute -top-24 start-1/2 -z-10 size-80 -translate-x-1/2 rounded-full bg-gold/25 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
            <h2 className="text-balance text-3xl tracking-tight text-white md:text-4xl">{c.cta.title}</h2><p className="mx-auto mt-3 max-w-lg text-lg text-white/80">{c.cta.subtitle}</p>
            <ButtonLink href="/register" size="lg" className="mt-8 shadow-lift shadow-gold/20">{c.cta.button}<ArrowLeft className="size-5" aria-hidden /></ButtonLink>
          </div>
        </section>
      </main>

      <SiteFooter text={c.footer.text} supportWhatsapp={supportWhatsapp} />
    </div>
  );
}
