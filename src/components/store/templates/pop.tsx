"use client";

import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, SearchLink, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import type { Kit } from "./types";

// «مرح»: للهدايا والأطفال والإكسسوارات الملونة. ألوان لعوبة، ستيكرز مائلة، أشكال ناعمة، حركة خفيفة.

function Header() {
  const { href, categories } = useStore();
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur">
      <AnnouncementBar className="bg-(--sa) text-(--sa-fg) font-bold" />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <MobileMenu />
        <StoreBrand className="flex-1 lg:flex-none" textClass="text-xl font-black" />
        <nav className="hidden flex-1 items-center gap-2 ps-6 lg:flex" aria-label="الأقسام">
          {categories.slice(0, 6).map((c, i) => <Link key={c.slug} href={href(`/category/${encodeURIComponent(c.slug)}`)} className={`rounded-full px-4 py-1.5 text-sm font-bold transition-transform hover:-rotate-2 hover:scale-105 ${i % 2 ? "bg-(--sa-soft)" : "bg-(--sp-soft)"}`}>{c.name}</Link>)}
        </nav>
        <SearchLink className="rounded-2xl bg-(--sp-soft) hover:bg-(--sa-soft)" />
        <CartButton className="rounded-2xl bg-(--sa) text-(--sa-fg) hover:opacity-90" />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-20 bg-(--sa-soft)">
      <svg aria-hidden viewBox="0 0 1200 40" preserveAspectRatio="none" className="block h-6 w-full -translate-y-px fill-white"><path d="M0 0h1200v10c-50 30-100 30-150 0s-100-30-150 0-100 30-150 0-100-30-150 0-100 30-150 0-100-30-150 0-100 30-150 0V0z" /></svg>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-3"><StoreBrand /><p className="inline-flex items-center gap-1.5 text-sm font-bold"><Sparkles className="size-4" aria-hidden /> سعادة تبدأ من هنا</p></div>
        <FooterColumns linkClass="font-medium hover:underline" />
      </div>
      <div className="border-t border-(--sp)/10"><Copyright className="mx-auto max-w-6xl px-4 py-4 pb-24 text-(--sp-muted) lg:pb-4" /></div>
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="relative overflow-hidden rounded-[2rem] bg-(--sp) text-(--sp-fg)">
    <span aria-hidden className="absolute -end-10 -top-10 size-52 rounded-full bg-(--sa)" />
    <span aria-hidden className="absolute -bottom-14 start-1/4 size-40 rounded-[2.5rem] rotate-12 bg-(--sa)/40" />
    <span aria-hidden className="absolute start-6 top-6 size-5 rounded-full border-4 border-(--sa)" />
    <div className="relative grid items-center gap-6 px-6 py-10 md:grid-cols-[1.2fr_1fr] md:px-12 md:py-16">
      <div>
        <span className="inline-flex -rotate-2 items-center gap-1.5 rounded-full bg-(--sa) px-4 py-1.5 text-sm font-black text-(--sa-fg)"><Sparkles className="size-4" aria-hidden /> جديد عندنا</span>
        <h1 className="mt-4 text-balance text-4xl font-black leading-[1.1] md:text-6xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-md text-base opacity-90 md:text-lg">{subtitle}</p>}
        <Link href={ctaHref} className="mt-7 inline-flex h-13 items-center gap-2 rounded-full bg-white px-8 text-lg font-black text-(--sp) transition-transform hover:-rotate-1 hover:scale-105 active:scale-95">{ctaLabel} <ArrowLeft className="size-5" /></Link>
      </div>
      <div className="relative mx-auto aspect-square w-full max-w-xs rotate-3 overflow-hidden rounded-[2.5rem] border-[6px] border-white bg-white/10 shadow-lift">
        {imageMediaId ? <MediaImage id={imageMediaId} alt="" priority sizes="320px" widths={[480, 720]} /> : <span aria-hidden className="flex size-full items-center justify-center text-8xl">🎁</span>}
      </div>
    </div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="group block rounded-[1.5rem] bg-(--sp-soft) p-2 transition-all hover:-translate-y-1 hover:-rotate-1 hover:bg-(--sa-soft)">
      <div className="relative aspect-square overflow-hidden rounded-[1.2rem] bg-white">
        {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} className="transition-transform duration-500 group-hover:scale-110" />}
        {p.inStock && p.compareAt && <span className="absolute -start-1 top-3 -rotate-6 rounded-full bg-(--sa) px-3 py-1 text-xs font-black text-(--sa-fg) shadow-soft">وفّر!</span>}
        {!p.inStock && <span className="absolute inset-0 flex items-center justify-center bg-white/75 text-lg font-black">نفد 😢</span>}
      </div>
      <div className="space-y-1 px-1.5 pb-1.5 pt-2.5">
        <h3 className="line-clamp-2 min-h-[2.75rem] text-[15px] font-bold leading-snug">{p.name}</h3>
        <Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="sm" />
      </div>
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="group relative block aspect-square overflow-hidden rounded-[1.75rem] bg-(--sa-soft) transition-transform hover:-rotate-2 hover:scale-[1.03]">
    {imageMediaId ? <MediaImage id={imageMediaId} alt="" sizes="(min-width: 1024px) 20vw, 45vw" /> : <span aria-hidden className="flex size-full items-center justify-center text-7xl font-black text-(--sa)">{name.slice(0, 1)}</span>}
    <span className="absolute inset-x-2 bottom-2 rounded-full bg-white px-3 py-1.5 text-center text-sm font-black shadow-soft">{name}</span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="mb-6 flex items-center justify-between gap-3">
    <h2 className="relative text-2xl font-black md:text-3xl"><span aria-hidden className="absolute -bottom-1 inset-x-0 -z-10 h-3 -rotate-1 rounded-full bg-(--sa)/50" />{title}</h2>
    {href && <Link href={href} className="inline-flex min-h-10 items-center rounded-full bg-(--sp) px-4 text-sm font-bold text-(--sp-fg) hover:opacity-90">{linkLabel ?? "الكل"}</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
