"use client";

import Link from "next/link";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, SearchLink, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import type { Kit } from "./types";

// «معرض»: الصورة هي البطل. هيرو بملء العرض، بطاقات بدون إطارات والسعر فوق الصورة، هيدر شفاف ومينيمال.

function Header() {
  const { href, categories } = useStore();
  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md">
      <AnnouncementBar className="bg-(--sp) text-(--sp-fg)" />
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <MobileMenu />
        <StoreBrand className="flex-1 lg:flex-none" textClass="text-lg font-bold tracking-tight" />
        <nav className="hidden flex-1 items-center justify-center gap-6 lg:flex" aria-label="الأقسام">
          {categories.slice(0, 6).map((c) => <Link key={c.slug} href={href(`/category/${encodeURIComponent(c.slug)}`)} className="text-sm text-(--sp-muted) transition-colors hover:text-(--sp)">{c.name}</Link>)}
        </nav>
        <SearchLink /><CartButton />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-(--sp-line)">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3"><div><StoreBrand /></div><FooterColumns linkClass="text-(--sp-muted) hover:text-(--sp)" /></div>
      <Copyright className="mx-auto max-w-6xl px-4 py-4 pb-24 text-(--sp-muted) lg:pb-4" />
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="relative isolate -mx-4 overflow-hidden bg-(--sp) text-(--sp-fg) sm:mx-0 sm:rounded-3xl [--focus:var(--sp-fg)] [--focus-halo:transparent]">
    {imageMediaId && <div className="absolute inset-0 -z-10"><MediaImage id={imageMediaId} alt="" priority sizes="100vw" widths={[640, 960, 1280, 1600]} /></div>}
    <div className="absolute inset-0 -z-10 bg-linear-to-t from-(--sp) via-(--sp)/45 to-transparent" />
    <div className="flex min-h-[26rem] flex-col justify-end px-6 pb-10 pt-32 md:min-h-[34rem] md:px-14 md:pb-14">
      <h1 className="max-w-2xl text-balance text-4xl font-bold leading-[1.1] tracking-tight md:text-6xl">{title}</h1>
      {subtitle && <p className="mt-3 max-w-md text-base opacity-90 md:text-lg">{subtitle}</p>}
      <Link href={ctaHref} className="mt-6 inline-flex h-12 w-fit items-center rounded-full bg-white px-7 font-semibold text-(--sp) transition-transform hover:scale-105 active:scale-95">{ctaLabel}</Link>
    </div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-(--sp-soft)">
      {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} className="transition-transform duration-700 group-hover:scale-105" />}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 space-y-0.5 p-3 text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.4)]">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">{p.name}</h3>
        <Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="sm" className="text-white [&_*]:text-white" />
      </div>
      {!p.inStock && <span className="absolute start-2 top-2 rounded-full bg-black/75 px-2.5 py-1 text-xs font-medium text-white">نفد</span>}
      {p.inStock && p.compareAt && <span className="absolute start-2 top-2 rounded-full bg-(--sa) px-2.5 py-1 text-xs font-bold text-(--sa-fg)">تخفيض</span>}
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-(--sp) text-white">
    {imageMediaId && <MediaImage id={imageMediaId} alt="" sizes="(min-width: 1024px) 25vw, 50vw" className="transition-transform duration-700 group-hover:scale-105" />}
    <span aria-hidden className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
    <span className="absolute inset-x-0 bottom-0 p-4 text-lg font-bold [text-shadow:0_1px_6px_rgb(0_0_0/0.4)]">{name}</span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="mb-5 flex items-baseline justify-between gap-3">
    <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
    {href && <Link href={href} className="inline-flex min-h-10 items-center text-sm font-semibold text-(--sp-muted) hover:text-(--sp)">{linkLabel ?? "عرض الكل"} ←</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
