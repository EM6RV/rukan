import type { StoreTemplate } from "@/lib/constants";
import { CategoryTile as BoldCategoryTile, Footer as BoldFooter, Header as BoldHeader, Hero as BoldHero, ProductCard as BoldProductCard, SectionTitle as BoldSectionTitle } from "./bold";
import { CategoryTile as ElegantCategoryTile, Footer as ElegantFooter, Header as ElegantHeader, Hero as ElegantHero, ProductCard as ElegantProductCard, SectionTitle as ElegantSectionTitle } from "./elegant";
import { CategoryTile as SimpleCategoryTile, Footer as SimpleFooter, Header as SimpleHeader, Hero as SimpleHero, ProductCard as SimpleProductCard, SectionTitle as SimpleSectionTitle } from "./simple";
import { boldCls, elegantCls, simpleCls } from "./styles";
import type { Kit } from "./types";

// ملاحظة: ملفات القوالب "use client" فمكوناتها مراجع عميل (تنفع كـ JSX في السيرفر)،
// أما الـ classes فمن styles.ts علشان تتقرا على السيرفر. نستورد بالاسم (مش namespace) لنفس السبب.
const kits: Record<StoreTemplate, Kit> = {
  simple: { Header: SimpleHeader, Footer: SimpleFooter, Hero: SimpleHero, ProductCard: SimpleProductCard, CategoryTile: SimpleCategoryTile, SectionTitle: SimpleSectionTitle, cls: simpleCls },
  elegant: { Header: ElegantHeader, Footer: ElegantFooter, Hero: ElegantHero, ProductCard: ElegantProductCard, CategoryTile: ElegantCategoryTile, SectionTitle: ElegantSectionTitle, cls: elegantCls },
  bold: { Header: BoldHeader, Footer: BoldFooter, Hero: BoldHero, ProductCard: BoldProductCard, CategoryTile: BoldCategoryTile, SectionTitle: BoldSectionTitle, cls: boldCls },
};

export const getKit = (template: StoreTemplate): Kit => kits[template] ?? kits.simple;
export type { Kit } from "./types";
