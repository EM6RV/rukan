"use client";

import Link from "next/link";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, SearchLink, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import type { Kit } from "./types";

// «نقاء»: بساطة كاملة. أبيض ومساحات فاضية، خطوط رفيعة، تركيز على الصورة والسعر. الأسرع والأخف.

function Header() {
  const { href, categories } = useStore();
  return (
    <header className="sticky top-0 z-30 border-b border-(--sp-line) bg-white/95 backdrop-blur">
      <AnnouncementBar className="bg-(--sp) text-(--sp-fg)" />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <MobileMenu />
        <StoreBrand className="flex-1 lg:flex-none" textClass="text-lg font-semibold" />
        <nav className="hidden flex-1 items-center gap-6 ps-8 lg:flex" aria-label="الأقسام">
          {categories.slice(0, 6).map((c) => <Link key={c.slug} href={href(`/category/${encodeURIComponent(c.slug)}`)} className="text-sm text-(--sp-muted) transition-colors hover:text-(--sp)">{c.name}</Link>)}
        </nav>
        <SearchLink /><CartButton />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-(--sp-line)">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3"><div><StoreBrand /></div><FooterColumns linkClass="text-(--sp-muted) hover:text-(--sp)" /></div>
      <div className="border-t border-(--sp-line)"><Copyright className="mx-auto max-w-6xl px-4 py-4 pb-24 text-(--sp-muted) lg:pb-4" /></div>
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="grid items-center gap-8 py-10 md:grid-cols-2 md:py-16">
    <div className="space-y-5">
      <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight md:text-6xl">{title}</h1>
      {subtitle && <p className="max-w-md text-lg leading-8 text-(--sp-muted)">{subtitle}</p>}
      <Link href={ctaHref} className="inline-flex h-12 items-center rounded-md bg-(--sp) px-8 text-[15px] font-medium text-(--sp-fg) transition-opacity hover:opacity-90">{ctaLabel}</Link>
    </div>
    <div className="aspect-[4/3] overflow-hidden rounded-xl bg-(--sp-soft)">{imageMediaId && <MediaImage id={imageMediaId} alt="" priority sizes="(min-width: 768px) 50vw, 100vw" widths={[640, 960, 1280]} />}</div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-(--sp-soft)">
        {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} className="transition-opacity duration-300 group-hover:opacity-90" />}
        {!p.inStock && <span className="absolute start-2 top-2 rounded bg-white px-2 py-0.5 text-xs">نفد</span>}
        {p.inStock && p.compareAt && <span className="absolute start-2 top-2 rounded bg-(--sa) px-2 py-0.5 text-xs font-semibold text-(--sa-fg)">تخفيض</span>}
      </div>
      <h3 className="mt-3 line-clamp-1 text-[15px]">{p.name}</h3>
      <Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="sm" className="mt-0.5" />
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="group block">
    <span className="block aspect-[4/3] overflow-hidden rounded-lg bg-(--sp-soft)">{imageMediaId && <MediaImage id={imageMediaId} alt="" sizes="(min-width: 768px) 25vw, 50vw" className="transition-transform duration-500 group-hover:scale-[1.03]" />}</span>
    <span className="mt-2 block text-sm font-medium">{name}</span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="mb-6 flex items-end justify-between gap-3 border-b border-(--sp-line) pb-3">
    <h2 className="text-xl font-semibold md:text-2xl">{title}</h2>
    {href && <Link href={href} className="inline-flex min-h-10 items-center text-sm text-(--sp-muted) hover:text-(--sp)">{linkLabel ?? "عرض الكل"} ←</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
