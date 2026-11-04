"use client";

import Link from "next/link";
import { Gift } from "lucide-react";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, SearchLink, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import type { Kit } from "./types";

// «لمسة»: ناعم ومرح للهدايا والإكسسوارات والأطفال. حواف دائرية كبيرة، باستيل من لون التمييز، وتغليف هدية.

function Header() {
  const { href, categories } = useStore();
  return (
    <header className="sticky top-0 z-30 bg-(--sa-soft)/90 backdrop-blur">
      <AnnouncementBar className="bg-(--sa) text-(--sa-fg)" />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <MobileMenu />
        <StoreBrand className="flex-1 lg:flex-none" textClass="text-xl font-extrabold" />
        <nav className="hidden flex-1 items-center justify-center gap-2 lg:flex" aria-label="الأقسام">{categories.slice(0, 5).map((c) => <Link key={c.slug} href={href(`/category/${encodeURIComponent(c.slug)}`)} className="rounded-full px-4 py-1.5 text-sm font-semibold hover:bg-white">{c.name}</Link>)}</nav>
        <SearchLink className="rounded-full hover:bg-white" /><CartButton className="rounded-full bg-white" />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-20 rounded-t-[3rem] bg-(--sa-soft)">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-3"><div className="space-y-2"><StoreBrand /><p className="flex items-center gap-1.5 text-sm text-(--sp-muted)"><Gift className="size-4" /> نغلّفها لك هدية لو تبي</p></div><FooterColumns linkClass="text-(--sp-muted) hover:text-(--sp)" /></div>
      <div className="border-t border-(--sp-line)"><Copyright className="mx-auto max-w-6xl px-6 py-4 pb-24 text-(--sp-muted) lg:pb-4" /></div>
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="relative overflow-hidden rounded-[2.5rem] bg-(--sa-soft)">
    <span aria-hidden className="absolute -end-10 -top-10 size-52 rounded-full bg-(--sa)/25" />
    <span aria-hidden className="absolute -bottom-12 start-1/4 size-40 rounded-full bg-white/70" />
    <div className="relative grid items-center gap-6 px-6 py-10 md:grid-cols-2 md:px-14 md:py-14">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-bold shadow-soft"><Gift className="size-3.5" /> جاهزة للإهداء</span>
        <h1 className="mt-4 text-balance text-3xl font-extrabold leading-tight md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-md text-base text-(--sp-muted)">{subtitle}</p>}
        <Link href={ctaHref} className="mt-6 inline-flex h-13 items-center rounded-full bg-(--sp) px-9 font-bold text-(--sp-fg) shadow-lift transition-transform hover:scale-[1.03]">{ctaLabel}</Link>
      </div>
      <div className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-[3rem] border-8 border-white bg-white shadow-lift">{imageMediaId ? <MediaImage id={imageMediaId} alt="" priority sizes="(min-width: 768px) 30vw, 80vw" widths={[480, 720, 960]} /> : <span aria-hidden className="flex size-full items-center justify-center text-8xl">🎁</span>}</div>
    </div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="group block rounded-[2rem] bg-(--sa-soft) p-2.5 transition-transform hover:-translate-y-1">
      <div className="relative aspect-square overflow-hidden rounded-[1.5rem] bg-white">
        {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} className="transition-transform duration-500 group-hover:scale-105" />}
        {!p.inStock && <span className="absolute start-2 top-2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">نفد</span>}
        {p.inStock && p.compareAt && <span className="absolute start-2 top-2 rounded-full bg-(--sa) px-3 py-1 text-xs font-bold text-(--sa-fg)">خصم</span>}
      </div>
      <div className="space-y-0.5 px-2 pb-1.5 pt-3 text-center"><h3 className="line-clamp-1 text-[15px] font-bold">{p.name}</h3><Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="sm" className="justify-center" /></div>
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="group flex flex-col items-center gap-2 text-center">
    <span className="block aspect-square w-full max-w-[8.5rem] overflow-hidden rounded-[2rem] border-4 border-white bg-(--sa-soft) shadow-soft transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105">{imageMediaId ? <MediaImage id={imageMediaId} alt="" sizes="136px" /> : <span aria-hidden className="flex size-full items-center justify-center text-4xl">🎀</span>}</span>
    <span className="text-sm font-bold">{name}</span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="mb-6 flex items-center justify-between gap-3">
    <h2 className="flex items-center gap-2 text-xl font-extrabold md:text-2xl"><span aria-hidden>✿</span>{title}</h2>
    {href && <Link href={href} className="inline-flex min-h-10 items-center rounded-full bg-(--sa-soft) px-4 text-sm font-bold hover:bg-(--sa)/30">{linkLabel ?? "عرض الكل"}</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
