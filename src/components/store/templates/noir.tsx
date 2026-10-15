"use client";

import Link from "next/link";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, SearchLink, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import type { Kit } from "./types";

// «فخم»: للعطور والذهب والماركات الراقية. هيدر وهيرو وفوتر داكنة بلون المتجر، خطوط ذهبية رفيعة، صور بقوس.

function Header() {
  const { href, categories } = useStore();
  return (
    <header className="sticky top-0 z-30 border-b border-(--sa)/50 bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
      <AnnouncementBar className="border-b border-(--sa)/30 bg-black/25 text-(--sp-fg)" />
      <div className="mx-auto flex h-18 max-w-6xl items-center gap-2 px-4">
        <MobileMenu />
        <nav className="hidden flex-1 items-center gap-6 lg:flex" aria-label="الأقسام">
          {categories.slice(0, 4).map((c) => <Link key={c.slug} href={href(`/category/${encodeURIComponent(c.slug)}`)} className="text-sm tracking-widest opacity-85 hover:text-(--sa) hover:opacity-100">{c.name}</Link>)}
        </nav>
        <StoreBrand className="flex-1 justify-center" textClass="text-2xl font-light tracking-[0.3em]" />
        <div className="flex flex-1 items-center justify-end"><SearchLink className="hover:text-(--sa)" /><CartButton className="hover:text-(--sa)" /></div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-(--sa)/50 bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 pt-12 text-center"><StoreBrand textClass="text-3xl font-light tracking-[0.35em]" /><span aria-hidden className="h-px w-24 bg-(--sa)" /></div>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2"><FooterColumns linkClass="opacity-80 hover:text-(--sa) hover:opacity-100" /></div>
      <div className="border-t border-white/10"><Copyright className="mx-auto max-w-6xl px-4 py-4 pb-24 opacity-70 lg:pb-4" /></div>
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="relative overflow-hidden bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
    <span aria-hidden className="absolute inset-3 border border-(--sa)/50" />
    <div className="relative grid items-center gap-8 px-8 py-14 md:grid-cols-2 md:px-16 md:py-20">
      <div className="text-center md:text-start">
        <span className="text-xs tracking-[0.4em] text-(--sa)">COLLECTION</span>
        <h1 className="mt-4 text-balance text-4xl font-light leading-tight tracking-wide md:text-6xl">{title}</h1>
        {subtitle && <p className="mx-auto mt-4 max-w-md text-base opacity-80 md:mx-0">{subtitle}</p>}
        <Link href={ctaHref} className="mt-8 inline-flex h-13 items-center border border-(--sa) px-10 text-sm tracking-[0.25em] text-(--sa) transition-colors hover:bg-(--sa) hover:text-(--sa-fg)">{ctaLabel}</Link>
      </div>
      <div className="mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-t-full border border-(--sa)/60 bg-black/20 p-2">
        <div className="size-full overflow-hidden rounded-t-full">{imageMediaId ? <MediaImage id={imageMediaId} alt="" priority sizes="320px" widths={[480, 720]} /> : <span aria-hidden className="flex size-full items-center justify-center text-6xl text-(--sa)">✦</span>}</div>
      </div>
    </div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="group block text-center">
      <div className="relative aspect-[4/5] overflow-hidden rounded-t-full bg-white ring-1 ring-(--sp-line) transition-shadow group-hover:ring-(--sa)">
        {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} className="transition-transform duration-700 group-hover:scale-105" />}
        {!p.inStock && <span className="absolute inset-x-0 bottom-3 mx-auto w-fit bg-(--sp) px-3 py-1 text-xs tracking-widest text-(--sp-fg)">نفد</span>}
        {p.inStock && p.compareAt && <span className="absolute inset-x-0 bottom-3 mx-auto w-fit bg-(--sa) px-3 py-1 text-xs font-bold tracking-widest text-(--sa-fg)">تخفيض</span>}
      </div>
      <h3 className="mt-4 line-clamp-2 text-[15px] font-light tracking-wide">{p.name}</h3>
      <Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="sm" className="mt-1 justify-center" />
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="group block text-center">
    <span className="block aspect-[3/4] overflow-hidden rounded-t-full bg-(--sp-soft) ring-1 ring-(--sp-line) transition-shadow group-hover:ring-(--sa)">
      {imageMediaId ? <MediaImage id={imageMediaId} alt="" sizes="(min-width: 1024px) 20vw, 40vw" className="transition-transform duration-700 group-hover:scale-105" /> : <span aria-hidden className="flex size-full items-center justify-center text-4xl font-light text-(--sp-muted)">{name.slice(0, 1)}</span>}
    </span>
    <span className="mt-3 block text-sm tracking-[0.2em]">{name}</span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="mb-8 flex flex-col items-center gap-2 text-center">
    <h2 className="text-2xl font-light tracking-[0.25em] md:text-3xl">{title}</h2>
    <span aria-hidden className="h-px w-16 bg-(--sa)" />
    {href && <Link href={href} className="inline-flex min-h-10 items-center text-sm tracking-widest text-(--sa-text) hover:underline">{linkLabel ?? "عرض الكل"}</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
