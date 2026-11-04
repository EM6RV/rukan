import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MockStore } from "@/components/marketing/mock-store";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-shell";
import { ButtonLink } from "@/components/ui/button";
import { STORE_TEMPLATES, STORE_TEMPLATE_LABELS, type StoreTemplate } from "@/lib/constants";
import { getMarketingData } from "@/server/admin/site-cache";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ key: string }> };
const isTemplate = (k: string): k is StoreTemplate => (STORE_TEMPLATES as readonly string[]).includes(k);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  if (!isTemplate(key)) return { title: "غير موجود", robots: { index: false } };
  const title = `قالب «${STORE_TEMPLATE_LABELS[key]}» لمتجرك | رُكن`;
  return { title: { absolute: title }, alternates: { canonical: `/templates/${key}` }, openGraph: { title, locale: "ar_LY", type: "website", siteName: "رُكن", images: [{ url: "/brand/rukn-logo.png", alt: "رُكن" }] } };
}

/** معاينة قالب بحجم كبير (موبايل وكمبيوتر) بألوان مثال، وزر البدء */
export default async function TemplatePreview({ params }: Props) {
  const { key } = await params;
  if (!isTemplate(key)) notFound();
  const { content: c, supportWhatsapp } = await getMarketingData();
  const item = c.templates.items.find((x) => x.template === key);
  const colors = item ?? { blurb: "", primary: "#0D263E", accent: "#C19E58" };
  const others = (c.templates.items.length ? c.templates.items.map((x) => x.template) : [...STORE_TEMPLATES]).filter((x) => x !== key);
  return (
    <div data-theme="light" className="min-h-dvh bg-bg text-fg">
      <SiteHeader cta={c.hero.primaryCta} />
      <main id="main-content" tabIndex={-1} className="outline-none">
        <section className="mx-auto max-w-6xl space-y-10 px-4 py-12 md:py-16">
          <div className="mx-auto max-w-2xl space-y-3 text-center">
            <p className="text-sm font-semibold text-link">قالب</p>
            <h1 className="text-balance text-4xl">{STORE_TEMPLATE_LABELS[key]}</h1>
            {item?.blurb && <p className="text-lg leading-8 text-muted">{item.blurb}</p>}
            <ButtonLink href="/register" size="lg" className="mt-2">ابدأ بهذا القالب<ArrowLeft className="size-5" aria-hidden /></ButtonLink>
          </div>
          <div className="grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
            <MockStore name="متجرك" category="معاينة على الكمبيوتر" primary={colors.primary} accent={colors.accent} template={key} className="mx-auto w-full max-w-2xl" />
            <MockStore name="متجرك" category="معاينة على الموبايل" primary={colors.primary} accent={colors.accent} template={key} className="mx-auto w-64" />
          </div>
          <p className="text-center text-sm text-muted">رسم توضيحي للقالب. متجرك الحقيقي يظهر بمنتجاتك وصورك وألوانك.</p>
          <ul className="flex flex-wrap justify-center gap-2">{others.map((o) => <li key={o}><Link href={`/templates/${o}`} className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold hover:border-gold">{STORE_TEMPLATE_LABELS[o]}</Link></li>)}</ul>
        </section>
      </main>
      <SiteFooter text={c.footer.text} supportWhatsapp={supportWhatsapp} />
    </div>
  );
}
