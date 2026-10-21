import { BASE_TEMPLATE } from "@/lib/plan-limits";
import { canUse } from "@/lib/entitlements";
import { SkipLink } from "@/components/ui/skip-link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { ALL_FONT_VARIABLES, storeFontStyle } from "@/components/store/fonts";
import { Pixels } from "@/components/store/pixels";
import { CartProvider } from "@/components/store/cart-context";
import { StoreProvider, type StoreInfo } from "@/components/store/store-context";
import { getKit } from "@/components/store/templates";
import { WhatsAppFloat } from "@/components/store/whatsapp-float";
import { toWhatsappNumber } from "@/lib/phone";
import { storeThemeVars } from "@/lib/store-theme";
import { mediaUrl } from "@/lib/media-url";
import { getRequestContext, isStoreOpen, loadStore } from "@/server/storefront/request";

type Props = { children: React.ReactNode; params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { key } = await params;
  const sf = await loadStore(key);
  if (!sf) return { title: { absolute: "متجر غير موجود" }, robots: { index: false } };
  const { origin } = await getRequestContext(key);
  const title = sf.settings.seoTitle || sf.name;
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: `%s | ${sf.name}` },
    description: sf.settings.seoDescription ?? undefined,
    applicationName: sf.name,
    robots: isStoreOpen(sf) ? undefined : { index: false, follow: false },
    openGraph: {
      type: "website", siteName: sf.name, locale: "ar_LY", title,
      description: sf.settings.seoDescription ?? undefined,
      images: sf.settings.ogMediaId ? [mediaUrl(sf.settings.ogMediaId, 1280)] : sf.logoMediaId ? [mediaUrl(sf.logoMediaId, 640)] : undefined,
    },
    // أيقونة التبويب: شعار المتجر لو موجود (بدل أيقونة رُكن)
    icons: sf.logoMediaId ? { icon: mediaUrl(sf.logoMediaId, 160) } : undefined,
  };
}

export default async function StoreLayout({ children, params }: Props) {
  const { key } = await params;
  const sf = await loadStore(key);
  if (!sf) notFound();

  const vars = storeThemeVars(sf.settings.primaryColor, sf.settings.accentColor) as React.CSSProperties;

  if (!isStoreOpen(sf)) {
    return (
      <div data-theme="light" style={vars} className="flex min-h-dvh items-center justify-center bg-white px-4 text-center text-(--sp)">
        <div className="max-w-sm space-y-3">
          <Store className="mx-auto size-12 text-(--sp-muted)" />
          <h1 className="text-2xl font-bold">{sf.name}</h1>
          <p className="text-(--sp-muted)">هذا المتجر غير متاح حالياً. رجّع زيارتنا قريب بإذن الله.</p>
        </div>
      </div>
    );
  }

  const { base } = await getRequestContext(key);
  const template = canUse(sf.limits, "allTemplates") ? sf.template : BASE_TEMPLATE; // لو نزلت الباقة، القوالب الإضافية ترجع للبسيط
  const kit = getKit(template);
  const s = sf.settings;
  const info: StoreInfo = {
    id: sf.id, key: sf.slug, name: sf.name, template, logoMediaId: sf.logoMediaId, base,
    whatsapp: s.whatsapp ? toWhatsappNumber(s.whatsapp) : null,
    currency: "د.ل", announcementBar: s.announcementBar,
    categories: sf.categories.map((c) => ({ slug: c.slug, name: c.name })),
    pages: sf.pages,
    social: { instagram: s.instagram, tiktok: s.tiktok, facebook: s.facebook, snapchat: s.snapchat },
    contact: { phone: s.contactPhone, email: s.email, address: s.address },
    footerText: s.footerText, showBranding: !canUse(sf.limits, "removeBranding"),
    pixels: { meta: canUse(sf.limits, "pixels") ? s.metaPixelId : null, tiktok: canUse(sf.limits, "pixels") ? s.tiktokPixelId : null },
    freeDeliveryOver: s.freeDeliveryOver,
  };

  return (
    <div data-theme="light" style={{ ...vars, ...storeFontStyle(s.fontKey) }} className={`min-h-dvh ${ALL_FONT_VARIABLES} ${kit.cls.page}`}>
      <StoreProvider info={info}>
        <CartProvider storeId={sf.id}>
          <SkipLink />
          <kit.Header />
          <main id="main-content" tabIndex={-1} className="outline-none">{children}</main>
          <kit.Footer />
          <WhatsAppFloat />
        </CartProvider>
        <Pixels meta={info.pixels.meta} tiktok={info.pixels.tiktok} />
      </StoreProvider>
    </div>
  );
}
