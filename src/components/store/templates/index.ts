import type { StoreTemplate } from "@/lib/constants";
import { CategoryTile as NaqaCategoryTile, Footer as NaqaFooter, Header as NaqaHeader, Hero as NaqaHero, SectionTitle as NaqaSectionTitle } from "./naqa";
import { CategoryTile as MakhmalCategoryTile, Footer as MakhmalFooter, Header as MakhmalHeader, Hero as MakhmalHero, SectionTitle as MakhmalSectionTitle } from "./makhmal";
import { CategoryTile as NabdCategoryTile, Footer as NabdFooter, Header as NabdHeader, Hero as NabdHero, SectionTitle as NabdSectionTitle } from "./nabd";
import { CategoryTile as SouqCategoryTile, Footer as SouqFooter, Header as SouqHeader, Hero as SouqHero, SectionTitle as SouqSectionTitle } from "./souq";
import { CategoryTile as HikayaCategoryTile, Footer as HikayaFooter, Header as HikayaHeader, Hero as HikayaHero, SectionTitle as HikayaSectionTitle } from "./hikaya";
import { CategoryTile as LamsaCategoryTile, Footer as LamsaFooter, Header as LamsaHeader, Hero as LamsaHero, SectionTitle as LamsaSectionTitle } from "./lamsa";
import { hikayaCls, lamsaCls, makhmalCls, nabdCls, naqaCls, souqCls } from "./styles";
import { HikayaQuickCard, LamsaQuickCard, MakhmalQuickCard, NabdQuickCard, NaqaQuickCard, SouqQuickCard } from "./quick-cards";
import type { Kit } from "./types";


// ملاحظة: ملفات القوالب "use client" فمكوناتها مراجع عميل (تنفع كـ JSX في السيرفر)،
// أما الـ classes فمن styles.ts علشان تتقرا على السيرفر. نستورد بالاسم (مش namespace) لنفس السبب.
const kits: Record<StoreTemplate, Kit> = {
  naqa: { Header: NaqaHeader, Footer: NaqaFooter, Hero: NaqaHero, ProductCard: NaqaQuickCard, CategoryTile: NaqaCategoryTile, SectionTitle: NaqaSectionTitle, cls: naqaCls },
  makhmal: { Header: MakhmalHeader, Footer: MakhmalFooter, Hero: MakhmalHero, ProductCard: MakhmalQuickCard, CategoryTile: MakhmalCategoryTile, SectionTitle: MakhmalSectionTitle, cls: makhmalCls },
  nabd: { Header: NabdHeader, Footer: NabdFooter, Hero: NabdHero, ProductCard: NabdQuickCard, CategoryTile: NabdCategoryTile, SectionTitle: NabdSectionTitle, cls: nabdCls },
  souq: { Header: SouqHeader, Footer: SouqFooter, Hero: SouqHero, ProductCard: SouqQuickCard, CategoryTile: SouqCategoryTile, SectionTitle: SouqSectionTitle, cls: souqCls },
  hikaya: { Header: HikayaHeader, Footer: HikayaFooter, Hero: HikayaHero, ProductCard: HikayaQuickCard, CategoryTile: HikayaCategoryTile, SectionTitle: HikayaSectionTitle, cls: hikayaCls },
  lamsa: { Header: LamsaHeader, Footer: LamsaFooter, Hero: LamsaHero, ProductCard: LamsaQuickCard, CategoryTile: LamsaCategoryTile, SectionTitle: LamsaSectionTitle, cls: lamsaCls },
};

export const getKit = (template: StoreTemplate): Kit => kits[template] ?? kits.naqa;
export type { Kit } from "./types";
