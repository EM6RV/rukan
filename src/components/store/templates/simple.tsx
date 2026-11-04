"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, SearchLink, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import type { Kit } from "./types";

// «بسيط»: نظيف وعملي. هيدر أبيض ثابت، بطاقات مدورة، شبكة 2/3/4، هيرو مدور بلون المتجر.

function Header() {
  const { href, categories } = useStore();
  return (
    <header className="sticky top-0 z-30 border-b border-(--sp-line) bg-white/95 backdrop-blur">
      <AnnouncementBar className="bg-(--sp) text-(--sp-fg)" />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <MobileMenu />
        <StoreBrand className="flex-1 lg:flex-none" />
        <nav className="hidden flex-1 items-center gap-1 ps-6 lg:flex" aria-label="الأقسام">
          {categories.slice(0, 7).map((c) => <Link key={c.slug} href={href(`/category/${encodeURIComponent(c.slug)}`)} className="rounded-full px-3.5 py-2 text-sm font-medium hover:bg-(--sp-soft)">{c.name}</Link>)}
        </nav>
        <SearchLink className="rounded-full hover:bg-(--sp-soft)" />
        <CartButton className="rounded-full hover:bg-(--sp-soft)" />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-(--sp-line) bg-(--sp-soft)">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-3"><StoreBrand /></div>
        <FooterColumns linkClass="hover:underline" />
      </div>
      <div className="border-t border-(--sp-line)"><Copyright className="mx-auto max-w-6xl px-4 py-4 pb-24 text-(--sp-muted) lg:pb-4" /></div>
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="relative overflow-hidden rounded-3xl bg-(--sp) text-(--sp-fg)">
    {imageMediaId && <div className="absolute inset-0 opacity-35"><MediaImage id={imageMediaId} alt="" priority sizes="100vw" widths={[640, 960, 1280]} /></div>}
    <div className="relative px-6 py-12 md:px-14 md:py-20">
      <h1 className="max-w-xl text-balance text-3xl font-bold leading-tight md:text-5xl">{title}</h1>
      {subtitle && <p className="mt-3 max-w-md text-base opacity-85 md:text-lg">{subtitle}</p>}
      <Link href={ctaHref} className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-(--sa) px-7 font-semibold text-(--sa-fg) transition-transform hover:scale-[1.03] active:scale-95">{ctaLabel} <ArrowLeft className="size-4" /></Link>
    </div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="group block overflow-hidden rounded-2xl border border-(--sp-line) bg-white transition-shadow hover:shadow-lift">
      <div className="relative aspect-square bg-(--sp-soft)">
        {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} className="transition-transform duration-300 group-hover:scale-105" />}
        {!p.inStock && <span className="absolute start-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">نفد</span>}
        {p.inStock && p.compareAt && <span className="absolute start-2 top-2 rounded-full bg-(--sa) px-2.5 py-1 text-xs font-bold text-(--sa-fg)">تخفيض</span>}
      </div>
      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 min-h-[2.75rem] text-[15px] font-medium leading-snug">{p.name}</h3>
        <Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="sm" />
      </div>
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="group flex flex-col items-center gap-2 text-center">
    <span className="block aspect-square w-full overflow-hidden rounded-2xl bg-(--sp-soft) ring-1 ring-(--sp-line)">
      {imageMediaId ? <MediaImage id={imageMediaId} alt="" className="transition-transform duration-300 group-hover:scale-105" sizes="(min-width: 1024px) 15vw, 30vw" /> : <span className="flex size-full items-center justify-center text-3xl font-bold text-(--sp-muted)">{name.slice(0, 1)}</span>}
    </span>
    <span className="text-sm font-semibold">{name}</span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="mb-5 flex items-end justify-between gap-3">
    <h2 className="text-xl font-bold md:text-2xl">{title}</h2>
    {href && <Link href={href} className="inline-flex min-h-10 items-center text-sm font-semibold text-(--sa-text) hover:underline">{linkLabel ?? "عرض الكل"}</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
