import type { ComponentType } from "react";
import type { CardProduct } from "@/server/storefront/types";

export type HeroProps = { title: string; subtitle?: string; ctaHref: string; ctaLabel: string; imageMediaId?: string | null };

/** كل قالب يوفر نفس المجموعة من المكونات والـ classes، والصفحات تستعملها بدون ما تعرف أي قالب. */
export type Kit = {
  Header: ComponentType;
  Footer: ComponentType;
  Hero: ComponentType<HeroProps>;
  ProductCard: ComponentType<{ product: CardProduct; priority?: boolean }>;
  CategoryTile: ComponentType<{ name: string; href: string; imageMediaId: string | null }>;
  SectionTitle: ComponentType<{ title: string; href?: string; linkLabel?: string }>;
  cls: {
    page: string;
    container: string;
    btn: string; // زر رئيسي
    btnOutline: string;
    chip: string;
    chipOn: string;
    input: string;
    panel: string;
    productGrid: string;
    heading: string; // عنوان الصفحة
    badge: string;
    imageFrame: string; // إطار صور المنتج في صفحة المنتج
  };
};
