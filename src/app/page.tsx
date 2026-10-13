import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Banknote, BarChart3, MapPin, MessageCircle, Palette, RotateCcw, ShieldCheck, Smartphone, Store, Truck, Users, Zap, type LucideIcon } from "lucide-react";
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

      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
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
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-gradient-to-b from-gold/15 to-transparent" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:py-20 lg:grid-cols-2">
            <div className="space-y-6 text-center lg:text-start">
              <FadeIn><span className="inline-flex rounded-full bg-gold/20 px-4 py-1.5 text-sm font-semibold ring-1 ring-gold/40">{c.hero.badge}</span></FadeIn>
              <FadeIn delay={0.06}><h1 className="text-balance text-4xl leading-[1.25] sm:text-5xl">{c.hero.title}</h1></FadeIn>
              <FadeIn delay={0.12}><p className="mx-auto max-w-xl text-lg leading-8 text-muted lg:mx-0">{c.hero.subtitle}</p></FadeIn>
              <FadeIn delay={0.18} className="flex flex-wrap justify-center gap-3 lg:justify-start">
                <ButtonLink href="/register" size="lg">{c.hero.primaryCta}<ArrowLeft className="size-5" aria-hidden /></ButtonLink>
                {c.hero.secondaryCta && <ButtonLink href="#pricing" size="lg" variant="outline">{c.hero.secondaryCta}</ButtonLink>}
              </FadeIn>
              <FadeIn delay={0.24}><p className="text-sm text-muted">تجربة مجانية {trialDays} يوم · بدون بطاقة بنكية · الدفع كاش أو تحويل</p></FadeIn>
            </div>
            <FadeIn delay={0.14} className="mx-auto w-full max-w-md">
              {heroImg ? (
                <img src={mediaUrl(heroImg, 960)} srcSet={mediaSrcSet(heroImg, [640, 960, 1280])} sizes="(min-width: 1024px) 28rem, 100vw" alt="" className="w-full rounded-3xl shadow-lift" fetchPriority="high" />
              ) : demo ? (
                <div className="relative"><MockStore {...demo} className="rotate-1" /><MockStore {...(c.showcase.items[1] ?? demo)} className="absolute -bottom-6 -start-6 hidden w-44 -rotate-6 sm:block" /></div>
              ) : null}
            </FadeIn>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
          <div className="mx-auto mb-10 max-w-2xl text-center"><h2 className="text-3xl">{c.features.title}</h2><p className="mt-2 text-lg text-muted">{c.features.subtitle}</p></div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.features.items.map((f) => {
              const Icon = ICONS[f.icon];
              return (
                <li key={f.title} className="rounded-2xl border border-line bg-surface p-6 shadow-soft transition-shadow hover:shadow-lift">
                  <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-navy text-gold"><Icon className="size-6" aria-hidden /></div>
                  <h3 className="text-lg">{f.title}</h3><p className="mt-1.5 leading-7 text-muted">{f.text}</p>
                </li>
              );
            })}
          </ul>
        </section>

        {c.showcase.items.length > 0 && (
          <section className="bg-surface-2 py-14">
            <div className="mx-auto max-w-6xl px-4">
              <div className="mx-auto mb-10 max-w-2xl text-center"><h2 className="text-3xl">{c.showcase.title}</h2><p className="mt-2 text-lg text-muted">{c.showcase.subtitle}</p></div>
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {c.showcase.items.map((s) => {
                  const inner = (<><MockStore {...s} /><p className="mt-3 text-center font-semibold">{s.name}</p><p className="text-center text-sm text-muted">{s.category}</p></>);
                  return <li key={s.name}>{s.href ? (s.href.startsWith("/") ? <Link href={s.href} className="block transition-transform hover:-translate-y-1">{inner}</Link> : <a href={s.href} target="_blank" rel="noopener noreferrer" className="block transition-transform hover:-translate-y-1">{inner}</a>) : inner}</li>;
                })}
              </ul>
              <p className="mt-6 text-center text-xs text-muted">أمثلة توضيحية لتصاميم القوالب.</p>
            </div>
          </section>
        )}

        <section className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="mb-10 text-center text-3xl">{c.steps.title}</h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {c.steps.items.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl border border-line bg-surface p-6 text-center shadow-soft">
                <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-gold text-lg font-bold text-navy">{i + 1}</span>
                <h3 className="text-lg">{s.title}</h3><p className="mt-1.5 text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="pricing" className="scroll-mt-20 bg-surface-2 py-14">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto mb-8 max-w-2xl text-center"><h2 className="text-3xl">{c.pricing.title}</h2><p className="mt-2 text-lg text-muted">{c.pricing.subtitle}</p></div>
            {plans.length > 0 ? <Pricing plans={plans} cta={c.hero.primaryCta} /> : <p className="text-center text-muted">الأسعار قريباً.</p>}
            <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted">{c.pricing.note}</p>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-14">
          <h2 className="mb-8 text-center text-3xl">{c.faq.title}</h2>
          <div className="space-y-3">
            {c.faq.items.map((f) => (
              <details key={f.q} className="group rounded-xl border border-line bg-surface p-5 shadow-soft open:shadow-lift">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden">{f.q}<span aria-hidden className="text-xl text-gold transition-transform group-open:rotate-45">+</span></summary>
                <p className="mt-3 leading-7 text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="px-4 pb-16">
          <div className="mx-auto max-w-4xl rounded-3xl bg-navy px-6 py-12 text-center text-white">
            <h2 className="text-3xl text-white">{c.cta.title}</h2><p className="mx-auto mt-2 max-w-lg text-lg text-white/80">{c.cta.subtitle}</p>
            <ButtonLink href="/register" size="lg" className="mt-6">{c.cta.button}</ButtonLink>
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
