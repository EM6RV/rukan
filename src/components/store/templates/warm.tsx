"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, SearchLink, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import type { Kit } from "./types";

// «دافئ»: للأكل البيتي والحلويات والهدايا. كريمي، حواف كبيرة جداً، أزرار كبسولة، أقسام دائرية زي القصص.

function Header() {
  const { href, categories } = useStore();
  return (
    <header className="sticky top-0 z-30 bg-(--sa-soft)/90 backdrop-blur">
      <AnnouncementBar className="bg-(--sp) text-(--sp-fg)" />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <MobileMenu />
        <StoreBrand className="flex-1 lg:flex-none" textClass="text-xl font-extrabold" />
        <nav className="hidden flex-1 items-center justify-center gap-1.5 lg:flex" aria-label="الأقسام">
          {categories.slice(0, 6).map((c) => <Link key={c.slug} href={href(`/category/${encodeURIComponent(c.slug)}`)} className="rounded-full px-4 py-2 text-sm font-semibold transition-colors hover:bg-white">{c.name}</Link>)}
        </nav>
        <SearchLink className="rounded-full hover:bg-white" />
        <CartButton className="rounded-full bg-white hover:bg-white/80" />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-20 rounded-t-[2.5rem] bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-3"><StoreBrand /><p className="max-w-xs text-sm opacity-80">صُنع بحب… وبيوصلك لين الباب 🤍</p></div>
        <FooterColumns linkClass="opacity-85 hover:opacity-100 hover:underline" />
      </div>
      <div className="border-t border-white/15"><Copyright className="mx-auto max-w-6xl px-6 py-4 pb-24 opacity-80 lg:pb-4" /></div>
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="relative overflow-hidden rounded-[2.5rem] bg-(--sa-soft)">
    <span aria-hidden className="absolute -start-16 -top-16 size-56 rounded-full bg-(--sa)/30" />
    <span aria-hidden className="absolute -bottom-20 end-1/3 size-48 rounded-full bg-(--sp)/10" />
    <div className="relative grid items-center gap-6 px-6 py-10 md:grid-cols-[1.1fr_1fr] md:px-14 md:py-16">
      <div>
        <h1 className="text-balance text-3xl font-extrabold leading-tight md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-md text-base text-(--sp-muted) md:text-lg">{subtitle}</p>}
        <Link href={ctaHref} className="mt-7 inline-flex h-13 items-center gap-2 rounded-full bg-(--sp) px-8 font-bold text-(--sp-fg) shadow-lift transition-transform hover:scale-[1.03] active:scale-95">{ctaLabel} <ArrowLeft className="size-4" /></Link>
      </div>
      <div className="relative mx-auto aspect-square w-full max-w-sm">
        <div className="absolute inset-0 rotate-6 rounded-[3rem] bg-(--sa)/40" />
        <div className="absolute inset-0 -rotate-3 overflow-hidden rounded-[3rem] border-4 border-white bg-white shadow-lift">
          {imageMediaId ? <MediaImage id={imageMediaId} alt="" priority sizes="(min-width: 768px) 30vw, 80vw" widths={[480, 720, 960]} /> : <span aria-hidden className="flex size-full items-center justify-center text-8xl">🛍️</span>}
        </div>
      </div>
    </div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="group block rounded-[1.75rem] bg-white p-2.5 shadow-soft ring-1 ring-(--sp-line) transition-all hover:-translate-y-1 hover:shadow-lift">
      <div className="relative aspect-square overflow-hidden rounded-[1.4rem] bg-(--sa-soft)">
        {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} className="transition-transform duration-500 group-hover:scale-105" />}
        {!p.inStock && <span className="absolute start-2 top-2 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">نفد</span>}
        {p.inStock && p.compareAt && <span className="absolute start-2 top-2 rounded-full bg-(--sa) px-3 py-1 text-xs font-bold text-(--sa-fg)">عرض</span>}
      </div>
      <div className="space-y-1 px-2 pb-2 pt-3">
        <h3 className="line-clamp-2 min-h-[2.75rem] text-[15px] font-bold leading-snug">{p.name}</h3>
        <Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="sm" />
      </div>
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="group flex flex-col items-center gap-2.5 text-center">
    <span className="block aspect-square w-full max-w-[9rem] overflow-hidden rounded-full border-4 border-white bg-(--sa-soft) shadow-soft ring-2 ring-(--sa) ring-offset-2 ring-offset-transparent transition-transform duration-300 group-hover:scale-105">
      {imageMediaId ? <MediaImage id={imageMediaId} alt="" sizes="144px" /> : <span aria-hidden className="flex size-full items-center justify-center text-4xl font-extrabold text-(--sp-muted)">{name.slice(0, 1)}</span>}
    </span>
    <span className="text-sm font-bold">{name}</span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="mb-6 flex items-center justify-between gap-3">
    <h2 className="flex items-center gap-3 text-xl font-extrabold md:text-2xl"><span aria-hidden className="size-3 rounded-full bg-(--sa)" />{title}</h2>
    {href && <Link href={href} className="inline-flex min-h-10 items-center rounded-full bg-(--sa-soft) px-4 text-sm font-bold hover:bg-(--sa)/30">{linkLabel ?? "عرض الكل"}</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
