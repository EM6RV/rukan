import type { StoreTemplate } from "@/lib/constants";
import { CategoryTile as BoldCategoryTile, Footer as BoldFooter, Header as BoldHeader, Hero as BoldHero, ProductCard as BoldProductCard, SectionTitle as BoldSectionTitle } from "./bold";
import { CategoryTile as ElegantCategoryTile, Footer as ElegantFooter, Header as ElegantHeader, Hero as ElegantHero, ProductCard as ElegantProductCard, SectionTitle as ElegantSectionTitle } from "./elegant";
import { CategoryTile as SimpleCategoryTile, Footer as SimpleFooter, Header as SimpleHeader, Hero as SimpleHero, ProductCard as SimpleProductCard, SectionTitle as SimpleSectionTitle } from "./simple";
import { CategoryTile as WarmCategoryTile, Footer as WarmFooter, Header as WarmHeader, Hero as WarmHero, ProductCard as WarmProductCard, SectionTitle as WarmSectionTitle } from "./warm";
import { CategoryTile as EditorialCategoryTile, Footer as EditorialFooter, Header as EditorialHeader, Hero as EditorialHero, ProductCard as EditorialProductCard, SectionTitle as EditorialSectionTitle } from "./editorial";
import { CategoryTile as NoirCategoryTile, Footer as NoirFooter, Header as NoirHeader, Hero as NoirHero, ProductCard as NoirProductCard, SectionTitle as NoirSectionTitle } from "./noir";
import { CategoryTile as PopCategoryTile, Footer as PopFooter, Header as PopHeader, Hero as PopHero, ProductCard as PopProductCard, SectionTitle as PopSectionTitle } from "./pop";
import { CategoryTile as GalleryCategoryTile, Footer as GalleryFooter, Header as GalleryHeader, Hero as GalleryHero, ProductCard as GalleryProductCard, SectionTitle as GallerySectionTitle } from "./gallery";
import { CategoryTile as NaqaCategoryTile, Footer as NaqaFooter, Header as NaqaHeader, Hero as NaqaHero, ProductCard as NaqaProductCard, SectionTitle as NaqaSectionTitle } from "./naqa";
import { CategoryTile as MakhmalCategoryTile, Footer as MakhmalFooter, Header as MakhmalHeader, Hero as MakhmalHero, ProductCard as MakhmalProductCard, SectionTitle as MakhmalSectionTitle } from "./makhmal";
import { CategoryTile as NabdCategoryTile, Footer as NabdFooter, Header as NabdHeader, Hero as NabdHero, ProductCard as NabdProductCard, SectionTitle as NabdSectionTitle } from "./nabd";
import { CategoryTile as SouqCategoryTile, Footer as SouqFooter, Header as SouqHeader, Hero as SouqHero, ProductCard as SouqProductCard, SectionTitle as SouqSectionTitle } from "./souq";
import { CategoryTile as HikayaCategoryTile, Footer as HikayaFooter, Header as HikayaHeader, Hero as HikayaHero, ProductCard as HikayaProductCard, SectionTitle as HikayaSectionTitle } from "./hikaya";
import { CategoryTile as LamsaCategoryTile, Footer as LamsaFooter, Header as LamsaHeader, Hero as LamsaHero, ProductCard as LamsaProductCard, SectionTitle as LamsaSectionTitle } from "./lamsa";
import { boldCls, editorialCls, elegantCls, galleryCls, hikayaCls, lamsaCls, makhmalCls, nabdCls, naqaCls, noirCls, souqCls, popCls, simpleCls, warmCls } from "./styles";
import type { Kit } from "./types";

// ملاحظة: ملفات القوالب "use client" فمكوناتها مراجع عميل (تنفع كـ JSX في السيرفر)،
// أما الـ classes فمن styles.ts علشان تتقرا على السيرفر. نستورد بالاسم (مش namespace) لنفس السبب.
const kits: Record<StoreTemplate, Kit> = {
  simple: { Header: SimpleHeader, Footer: SimpleFooter, Hero: SimpleHero, ProductCard: SimpleProductCard, CategoryTile: SimpleCategoryTile, SectionTitle: SimpleSectionTitle, cls: simpleCls },
  elegant: { Header: ElegantHeader, Footer: ElegantFooter, Hero: ElegantHero, ProductCard: ElegantProductCard, CategoryTile: ElegantCategoryTile, SectionTitle: ElegantSectionTitle, cls: elegantCls },
  bold: { Header: BoldHeader, Footer: BoldFooter, Hero: BoldHero, ProductCard: BoldProductCard, CategoryTile: BoldCategoryTile, SectionTitle: BoldSectionTitle, cls: boldCls },
  warm: { Header: WarmHeader, Footer: WarmFooter, Hero: WarmHero, ProductCard: WarmProductCard, CategoryTile: WarmCategoryTile, SectionTitle: WarmSectionTitle, cls: warmCls },
  editorial: { Header: EditorialHeader, Footer: EditorialFooter, Hero: EditorialHero, ProductCard: EditorialProductCard, CategoryTile: EditorialCategoryTile, SectionTitle: EditorialSectionTitle, cls: editorialCls },
  noir: { Header: NoirHeader, Footer: NoirFooter, Hero: NoirHero, ProductCard: NoirProductCard, CategoryTile: NoirCategoryTile, SectionTitle: NoirSectionTitle, cls: noirCls },
  pop: { Header: PopHeader, Footer: PopFooter, Hero: PopHero, ProductCard: PopProductCard, CategoryTile: PopCategoryTile, SectionTitle: PopSectionTitle, cls: popCls },
  naqa: { Header: NaqaHeader, Footer: NaqaFooter, Hero: NaqaHero, ProductCard: NaqaProductCard, CategoryTile: NaqaCategoryTile, SectionTitle: NaqaSectionTitle, cls: naqaCls },
  makhmal: { Header: MakhmalHeader, Footer: MakhmalFooter, Hero: MakhmalHero, ProductCard: MakhmalProductCard, CategoryTile: MakhmalCategoryTile, SectionTitle: MakhmalSectionTitle, cls: makhmalCls },
  nabd: { Header: NabdHeader, Footer: NabdFooter, Hero: NabdHero, ProductCard: NabdProductCard, CategoryTile: NabdCategoryTile, SectionTitle: NabdSectionTitle, cls: nabdCls },
  souq: { Header: SouqHeader, Footer: SouqFooter, Hero: SouqHero, ProductCard: SouqProductCard, CategoryTile: SouqCategoryTile, SectionTitle: SouqSectionTitle, cls: souqCls },
  hikaya: { Header: HikayaHeader, Footer: HikayaFooter, Hero: HikayaHero, ProductCard: HikayaProductCard, CategoryTile: HikayaCategoryTile, SectionTitle: HikayaSectionTitle, cls: hikayaCls },
  lamsa: { Header: LamsaHeader, Footer: LamsaFooter, Hero: LamsaHero, ProductCard: LamsaProductCard, CategoryTile: LamsaCategoryTile, SectionTitle: LamsaSectionTitle, cls: lamsaCls },
  gallery: { Header: GalleryHeader, Footer: GalleryFooter, Hero: GalleryHero, ProductCard: GalleryProductCard, CategoryTile: GalleryCategoryTile, SectionTitle: GallerySectionTitle, cls: galleryCls },
};

export const getKit = (template: StoreTemplate): Kit => kits[template] ?? kits.simple;
export type { Kit } from "./types";
