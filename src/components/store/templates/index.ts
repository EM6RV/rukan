import type { StoreTemplate } from "@/lib/constants";
import { CategoryTile as NaqaCategoryTile, Footer as NaqaFooter, Header as NaqaHeader, Hero as NaqaHero, ProductCard as NaqaProductCard, SectionTitle as NaqaSectionTitle } from "./naqa";
import { CategoryTile as MakhmalCategoryTile, Footer as MakhmalFooter, Header as MakhmalHeader, Hero as MakhmalHero, ProductCard as MakhmalProductCard, SectionTitle as MakhmalSectionTitle } from "./makhmal";
import { CategoryTile as NabdCategoryTile, Footer as NabdFooter, Header as NabdHeader, Hero as NabdHero, ProductCard as NabdProductCard, SectionTitle as NabdSectionTitle } from "./nabd";
import { CategoryTile as SouqCategoryTile, Footer as SouqFooter, Header as SouqHeader, Hero as SouqHero, ProductCard as SouqProductCard, SectionTitle as SouqSectionTitle } from "./souq";
import { CategoryTile as HikayaCategoryTile, Footer as HikayaFooter, Header as HikayaHeader, Hero as HikayaHero, ProductCard as HikayaProductCard, SectionTitle as HikayaSectionTitle } from "./hikaya";
import { CategoryTile as LamsaCategoryTile, Footer as LamsaFooter, Header as LamsaHeader, Hero as LamsaHero, ProductCard as LamsaProductCard, SectionTitle as LamsaSectionTitle } from "./lamsa";
import { hikayaCls, lamsaCls, makhmalCls, nabdCls, naqaCls, souqCls } from "./styles";
import type { Kit } from "./types";

// ملاحظة: ملفات القوالب "use client" فمكوناتها مراجع عميل (تنفع كـ JSX في السيرفر)،
// أما الـ classes فمن styles.ts علشان تتقرا على السيرفر. نستورد بالاسم (مش namespace) لنفس السبب.
const kits: Record<StoreTemplate, Kit> = {
  naqa: { Header: NaqaHeader, Footer: NaqaFooter, Hero: NaqaHero, ProductCard: NaqaProductCard, CategoryTile: NaqaCategoryTile, SectionTitle: NaqaSectionTitle, cls: naqaCls },
  makhmal: { Header: MakhmalHeader, Footer: MakhmalFooter, Hero: MakhmalHero, ProductCard: MakhmalProductCard, CategoryTile: MakhmalCategoryTile, SectionTitle: MakhmalSectionTitle, cls: makhmalCls },
  nabd: { Header: NabdHeader, Footer: NabdFooter, Hero: NabdHero, ProductCard: NabdProductCard, CategoryTile: NabdCategoryTile, SectionTitle: NabdSectionTitle, cls: nabdCls },
  souq: { Header: SouqHeader, Footer: SouqFooter, Hero: SouqHero, ProductCard: SouqProductCard, CategoryTile: SouqCategoryTile, SectionTitle: SouqSectionTitle, cls: souqCls },
  hikaya: { Header: HikayaHeader, Footer: HikayaFooter, Hero: HikayaHero, ProductCard: HikayaProductCard, CategoryTile: HikayaCategoryTile, SectionTitle: HikayaSectionTitle, cls: hikayaCls },
  lamsa: { Header: LamsaHeader, Footer: LamsaFooter, Hero: LamsaHero, ProductCard: LamsaProductCard, CategoryTile: LamsaCategoryTile, SectionTitle: LamsaSectionTitle, cls: lamsaCls },
};

export const getKit = (template: StoreTemplate): Kit => kits[template] ?? kits.naqa;
export type { Kit } from "./types";
