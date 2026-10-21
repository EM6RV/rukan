import { BASE_TEMPLATE } from "@/lib/plan-limits";
import { canUse } from "@/lib/entitlements";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";
import { getKit } from "@/components/store/templates";
import { excerpt } from "@/lib/text";
import { toWhatsappNumber } from "@/lib/phone";
import { getPage } from "@/server/storefront/data";
import { decodeKey, loadStore } from "@/server/storefront/request";

type Props = { params: Promise<{ key: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key, slug } = await params;
  const sf = await loadStore(key);
  const page = sf ? await getPage(sf.id, decodeKey(slug)) : null;
  return page ? { title: page.title, description: excerpt(page.body) } : { title: "الصفحة غير موجودة", robots: { index: false } };
}

export default async function ContentPage({ params }: Props) {
  const { key, slug } = await params;
  const sf = await loadStore(key);
  if (!sf) notFound();
  const page = await getPage(sf.id, decodeKey(slug));
  if (!page) notFound();
  const kit = getKit(canUse(sf.limits, "allTemplates") ? sf.template : BASE_TEMPLATE);
  const wa = sf.settings.whatsapp ? toWhatsappNumber(sf.settings.whatsapp) : null;

  return (
    <article className={`${kit.cls.container} max-w-3xl space-y-6 py-8 md:py-14`}>
      <h1 className={kit.cls.heading}>{page.title}</h1>
      {/* نص عادي (ما نعرضش HTML): React يهرب المحتوى، والسطور الجديدة تتحفظ */}
      <div className="whitespace-pre-line text-[17px] leading-8">{page.body}</div>
      {page.slug === "contact" && (
        <div className={`${kit.cls.panel} space-y-3`}>
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 font-semibold"><MessageCircle className="size-5" /> واتساب</a>}
          {sf.settings.contactPhone && <a dir="ltr" href={`tel:${sf.settings.contactPhone}`} className="flex items-center gap-3 font-semibold"><Phone className="size-5" /> {sf.settings.contactPhone}</a>}
          {sf.settings.email && <p>{sf.settings.email}</p>}
          {sf.settings.address && <p>{sf.settings.address}</p>}
        </div>
      )}
    </article>
  );
}
