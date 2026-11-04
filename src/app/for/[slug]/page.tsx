import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { MockStore } from "@/components/marketing/mock-store";
import { SectionHead, SiteFooter, SiteHeader } from "@/components/marketing/site-shell";
import { ButtonLink } from "@/components/ui/button";
import { STORE_TEMPLATE_LABELS } from "@/lib/constants";
import { getMarketingData } from "@/server/admin/site-cache";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { content } = await getMarketingData();
  const n = content.niches.items.find((x) => x.slug === slug);
  if (!n) return { title: "غير موجود", robots: { index: false } };
  const title = `متجر إلكتروني لـ${n.title} في ليبيا | رُكن`;
  return { title: { absolute: title }, description: n.text, alternates: { canonical: `/for/${n.slug}` }, openGraph: { title, description: n.text, locale: "ar_LY", type: "website", siteName: "رُكن", images: [{ url: "/brand/rukn-logo.png", alt: "رُكن" }] } };
}

export default async function NichePage({ params }: Props) {
  const { slug } = await params;
  const { content: c, supportWhatsapp } = await getMarketingData();
  const n = c.niches.items.find((x) => x.slug === slug);
  if (!n) notFound();
  const others = c.niches.items.filter((x) => x.slug !== n.slug);
  return (
    <div data-theme="light" className="min-h-dvh bg-bg text-fg">
      <SiteHeader cta={c.hero.primaryCta} />
      <main id="main-content" tabIndex={-1} className="outline-none">
        <section className="relative isolate overflow-hidden bg-navy text-white [--focus:#e3c487] [--focus-halo:transparent]">
          <div aria-hidden className="pointer-events-none absolute -top-40 -start-40 -z-10 size-[30rem] rounded-full bg-gold/25 blur-3xl" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 md:py-20 lg:grid-cols-2">
            <div className="space-y-6 text-center lg:text-start">
              <p className="text-sm font-semibold text-gold">رُكن لـ{n.title}</p>
              <h1 className="text-balance text-4xl leading-[1.25] text-white md:text-5xl">{n.headline}</h1>
              <p className="mx-auto max-w-xl text-lg leading-8 text-white/80 lg:mx-0">{n.text}</p>
              <ButtonLink href="/register" size="lg" className="shadow-lift shadow-gold/20">{c.hero.primaryCta}<ArrowLeft className="size-5" aria-hidden /></ButtonLink>
            </div>
            <div className="mx-auto w-full max-w-sm"><MockStore name={n.example} category={n.title} primary={n.primary} accent={n.accent} template={n.template} className="ring-1 ring-white/20 shadow-2xl shadow-black/30" /></div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16">
          <SectionHead title="كيف يفيدك رُكن" />
          <ul className="grid gap-4 sm:grid-cols-3">
            {n.benefits.map((b) => (
              <li key={b} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-5 shadow-soft"><Check className="mt-1 size-5 shrink-0 text-success-fg" aria-hidden /><span className="leading-7">{b}</span></li>
            ))}
          </ul>
          <div className="mt-10 rounded-2xl border border-gold/40 bg-gold/10 p-6 text-center">
            <p className="text-lg font-bold">القالب المقترح: {STORE_TEMPLATE_LABELS[n.template]}</p>
            <p className="mt-1 text-muted">يتلون بألوان علامتك ويقبل خط من قائمة خطوط عربية.</p>
            <Link href={`/templates/${n.template}`} className="mt-3 inline-block font-semibold text-link underline underline-offset-4">شوف القالب</Link>
          </div>
        </section>

        {others.length > 0 && (
          <section className="bg-surface-2 py-14">
            <div className="mx-auto max-w-4xl px-4">
              <h2 className="mb-6 text-center text-2xl">أنشطة ثانية</h2>
              <ul className="flex flex-wrap justify-center gap-2">{others.map((o) => <li key={o.slug}><Link href={`/for/${o.slug}`} className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold hover:border-gold">{o.title}</Link></li>)}</ul>
            </div>
          </section>
        )}

        <section className="px-4 py-16 text-center">
          <h2 className="text-balance text-3xl">{c.cta.title}</h2><p className="mx-auto mt-2 max-w-lg text-muted">{c.cta.subtitle}</p>
          <ButtonLink href="/register" size="lg" className="mt-6">{c.cta.button}</ButtonLink>
        </section>
      </main>
      <SiteFooter text={c.footer.text} supportWhatsapp={supportWhatsapp} />
    </div>
  );
}
