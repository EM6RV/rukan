"use client";

import Link from "next/link";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, SearchLink, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import type { Kit } from "./types";

// «مخمل»: فخامة تحريرية للعطور والعناية والمجوهرات. كريمي، خط رفيع بتباعد، صور طويلة، تفاصيل بلون التمييز.

function Header() {
  const { href, categories } = useStore();
  return (
    <header className="sticky top-0 z-30 bg-[#FBF8F3]/95 backdrop-blur">
      <AnnouncementBar className="bg-(--sp) text-xs tracking-[0.2em] text-(--sp-fg)" />
      <div className="mx-auto grid h-20 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4">
        <div className="flex items-center"><MobileMenu /><nav className="hidden items-center gap-6 lg:flex" aria-label="الأقسام">{categories.slice(0, 3).map((c) => <Link key={c.slug} href={href(`/category/${encodeURIComponent(c.slug)}`)} className="text-sm tracking-[0.15em] text-(--sp-muted) hover:text-(--sa-text)">{c.name}</Link>)}</nav></div>
        <StoreBrand className="justify-center" textClass="text-2xl font-light tracking-[0.25em]" />
        <div className="flex items-center justify-end"><SearchLink /><CartButton /></div>
      </div>
      <div aria-hidden className="mx-auto h-px max-w-6xl bg-(--sa)/50" />
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-28 bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 pt-14 text-center"><StoreBrand textClass="text-3xl font-light tracking-[0.35em]" /><span aria-hidden className="h-px w-20 bg-(--sa)" /></div>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2"><FooterColumns linkClass="opacity-75 hover:text-(--sa) hover:opacity-100" /></div>
      <div className="border-t border-white/10"><Copyright className="mx-auto max-w-6xl px-4 py-4 pb-24 opacity-60 lg:pb-4" /></div>
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="relative isolate overflow-hidden bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
    {imageMediaId && <div className="absolute inset-0 -z-10 opacity-45"><MediaImage id={imageMediaId} alt="" priority sizes="100vw" widths={[960, 1280, 1920]} /></div>}
    <div className="mx-auto flex min-h-[26rem] max-w-3xl flex-col items-center justify-center gap-5 px-6 py-20 text-center md:min-h-[34rem]">
      <span className="text-xs tracking-[0.5em] text-(--sa)">✦ ✦ ✦</span>
      <h1 className="text-balance text-4xl font-extralight leading-snug tracking-[0.08em] md:text-6xl">{title}</h1>
      {subtitle && <p className="max-w-lg text-base font-light leading-8 opacity-85 md:text-lg">{subtitle}</p>}
      <Link href={ctaHref} className="mt-4 inline-flex h-13 items-center border border-(--sa) px-12 text-sm tracking-[0.3em] text-(--sa) transition-colors hover:bg-(--sa) hover:text-(--sa-fg)">{ctaLabel}</Link>
    </div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="group block text-center">
      <div className="relative aspect-[4/5] overflow-hidden bg-white ring-1 ring-(--sa)/30">
        {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} className="transition-transform duration-700 group-hover:scale-105" />}
        {!p.inStock && <span className="absolute inset-x-0 bottom-0 bg-(--sp)/85 py-1.5 text-xs tracking-widest text-(--sp-fg)">نفد</span>}
        {p.inStock && p.compareAt && <span className="absolute start-0 top-3 bg-(--sa) px-3 py-1 text-xs tracking-wider text-(--sa-fg)">SALE</span>}
      </div>
      <h3 className="mt-4 line-clamp-1 text-[15px] font-light tracking-wide">{p.name}</h3>
      <Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="sm" className="mt-1 justify-center text-(--sa-text)" />
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="group relative block aspect-[3/4] overflow-hidden bg-(--sp-soft)">
    {imageMediaId && <MediaImage id={imageMediaId} alt="" sizes="(min-width: 768px) 25vw, 50vw" className="transition-transform duration-700 group-hover:scale-105" />}
    <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
    <span className="absolute inset-x-0 bottom-0 p-4 text-center text-lg font-light tracking-[0.2em] text-white">{name}</span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="mb-10 flex flex-col items-center gap-3 text-center">
    <h2 className="text-2xl font-light tracking-[0.2em] md:text-3xl">{title}</h2>
    <span aria-hidden className="h-px w-16 bg-(--sa)" />
    {href && <Link href={href} className="inline-flex min-h-10 items-center text-sm tracking-widest text-(--sa-text) hover:underline">{linkLabel ?? "عرض الكل"}</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
