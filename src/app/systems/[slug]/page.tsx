import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { SectionHead, SiteFooter, SiteHeader } from "@/components/marketing/site-shell";
import { LinePricingTabs, type LineTab } from "@/components/pricing/line-pricing";
import { ButtonLink } from "@/components/ui/button";
import { SYSTEM_LINE } from "@/lib/site-content";
import { getMarketingData } from "@/server/admin/site-cache";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { content } = await getMarketingData();
  const x = content.systems.items.find((s) => s.slug === slug);
  if (!x) return { title: "غير موجود", robots: { index: false } };
  const title = `${x.name} — ${x.tagline} | رُكن`;
  return { title: { absolute: title }, description: x.text, alternates: { canonical: `/systems/${x.slug}` }, openGraph: { title, description: x.text, locale: "ar_LY", type: "website", siteName: "رُكن" } };
}

export default async function SystemPage({ params }: Props) {
  const { slug } = await params;
  const { content: c, linePlans, supportWhatsapp } = await getMarketingData();
  const x = c.systems.items.find((s) => s.slug === slug);
  if (!x) notFound();
  const line = SYSTEM_LINE[x.slug] as Exclude<LineTab, "store">;
  const others = c.systems.items.filter((s) => s.slug !== x.slug);
  return (
    <div data-theme="light" className="min-h-dvh bg-bg text-fg">
      <SiteHeader cta={c.hero.primaryCta} />
      <main id="main-content" tabIndex={-1} className="outline-none">
        <section className="relative isolate overflow-hidden bg-navy text-white [--focus:#e3c487] [--focus-halo:transparent]">
          <div aria-hidden className="pointer-events-none absolute -top-40 -start-40 -z-10 size-[30rem] rounded-full bg-gold/25 blur-3xl" />
          <div className="mx-auto max-w-4xl space-y-6 px-4 py-14 text-center md:py-20">
            <p className="text-sm font-semibold text-gold">{x.name}</p>
            <h1 className="text-balance text-4xl leading-[1.25] text-white md:text-5xl">{x.tagline}</h1>
            <p className="mx-auto max-w-2xl text-lg leading-8 text-white/80">{x.text}</p>
            <ButtonLink href={`/register`} size="lg" className="shadow-lift shadow-gold/20">{x.cta}<ArrowLeft className="size-5" aria-hidden /></ButtonLink>
          </div>
        </section>
        <section className="mx-auto max-w-4xl px-4 py-16">
          <SectionHead title="شن تلقى فيه" />
          <ul className="grid gap-4 sm:grid-cols-2">{x.points.map((b) => <li key={b} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-5 shadow-soft"><Check className="mt-1 size-5 shrink-0 text-success-fg" aria-hidden /><span className="leading-7">{b}</span></li>)}</ul>
        </section>
        <section className="bg-surface-2 py-16"><div className="mx-auto max-w-6xl px-4"><SectionHead title="الأسعار" subtitle={c.pricing.subtitle} />
          {linePlans[line].length > 0 ? <LinePricingTabs store={[]} lines={{ market: line === "market" ? linePlans.market : [], lounge: line === "lounge" ? linePlans.lounge : [], gym: line === "gym" ? linePlans.gym : [] }} cta={x.cta} labels={{ popularBadge: c.pricing.popularBadge, rows: c.pricing.rows }} /> : <p className="text-center text-muted">الأسعار قريباً.</p>}
        </div></section>
        <section className="mx-auto max-w-4xl px-4 py-12 text-center">
          <p className="text-muted">وفي رُكن أيضاً:</p>
          <p className="mt-2 flex flex-wrap justify-center gap-3">{others.map((o) => <Link key={o.slug} href={`/systems/${o.slug}`} className="rounded-full border border-line bg-surface px-4 py-2 font-semibold hover:border-gold">{o.name}</Link>)}<Link href="/" className="rounded-full border border-line bg-surface px-4 py-2 font-semibold hover:border-gold">المتجر الأونلاين</Link></p>
        </section>
      </main>
      <SiteFooter text={c.footer.text} supportWhatsapp={supportWhatsapp} />
    </div>
  );
}
