"use client";

import Link from "next/link";
import { ArrowUpLeft } from "lucide-react";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, SearchLink, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import type { Kit } from "./types";

// «مجلة»: للأزياء والإكسسوارات. خطوط رفيعة، تايبوغرافي ضخم، ترقيم الأقسام، صور حادة بدون ظلال.

function Header() {
  const { href, categories } = useStore();
  return (
    <header className="sticky top-0 z-30 border-b border-(--sp) bg-white/95 backdrop-blur">
      <AnnouncementBar className="bg-(--sp) text-(--sp-fg) text-xs tracking-[0.2em]" />
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-2 px-4 lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center"><MobileMenu />
          <nav className="hidden items-center gap-5 lg:flex" aria-label="الأقسام">
            {categories.slice(0, 4).map((c) => <Link key={c.slug} href={href(`/category/${encodeURIComponent(c.slug)}`)} className="text-sm font-medium tracking-wide hover:underline hover:underline-offset-8">{c.name}</Link>)}
          </nav>
        </div>
        <StoreBrand className="justify-self-center" textClass="text-2xl font-black tracking-tight" />
        <div className="flex items-center justify-self-end"><SearchLink /><CartButton /></div>
      </div>
    </header>
  );
}

function Footer() {
  const { name } = useStore();
  return (
    <footer className="mt-24 border-t border-(--sp)">
      <div className="mx-auto max-w-6xl overflow-hidden px-4 pt-10">
        <p aria-hidden className="select-none text-[clamp(3.5rem,18vw,11rem)] font-black leading-[0.9] tracking-tighter text-(--sp)">{name}</p>
        <div className="mt-8 grid gap-8 border-t border-(--sp) pt-8 sm:grid-cols-2"><FooterColumns linkClass="hover:underline" /></div>
      </div>
      <Copyright className="mx-auto max-w-6xl px-4 py-5 pb-24 text-(--sp-muted) lg:pb-5" />
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="grid items-stretch border border-(--sp) md:grid-cols-[1.3fr_1fr]">
    <div className="flex flex-col justify-between gap-10 p-6 md:p-12">
      <span className="text-xs font-medium tracking-[0.3em] text-(--sp-muted)">NEW — {new Date().getFullYear()}</span>
      <div>
        <h1 className="text-balance text-5xl font-black leading-[0.98] tracking-tight md:text-7xl">{title}</h1>
        {subtitle && <p className="mt-5 max-w-md text-base text-(--sp-muted)">{subtitle}</p>}
      </div>
      <Link href={ctaHref} className="group inline-flex w-fit items-center gap-3 border-b-2 border-(--sa) pb-1 text-lg font-bold">{ctaLabel} <ArrowUpLeft className="size-5 transition-transform group-hover:-translate-x-1 group-hover:-translate-y-1" /></Link>
    </div>
    <div className="relative min-h-72 border-t border-(--sp) bg-(--sa-soft) md:border-s md:border-t-0">
      {imageMediaId ? <MediaImage id={imageMediaId} alt="" priority sizes="(min-width: 768px) 40vw, 100vw" widths={[480, 720, 960]} /> : <span aria-hidden className="absolute inset-0 flex items-center justify-center text-[10rem] font-black text-(--sa)/50">★</span>}
    </div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden bg-(--sp-soft)">
        {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} className="transition-transform duration-700 group-hover:scale-[1.04]" />}
        {!p.inStock && <span className="absolute inset-x-0 bottom-0 bg-white/90 py-1.5 text-center text-xs font-bold tracking-widest">نفد</span>}
        {p.inStock && p.compareAt && <span className="absolute start-0 top-0 bg-(--sa) px-3 py-1 text-xs font-black text-(--sa-fg)">SALE</span>}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3 border-t border-(--sp) pt-2">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">{p.name}</h3>
        <Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="sm" className="shrink-0" />
      </div>
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="group relative block aspect-[3/4] overflow-hidden bg-(--sa-soft)">
    {imageMediaId && <MediaImage id={imageMediaId} alt="" sizes="(min-width: 1024px) 25vw, 50vw" className="transition-transform duration-700 group-hover:scale-105" />}
    <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-white px-3 py-2.5 text-sm font-bold">{name}<ArrowUpLeft className="size-4" aria-hidden /></span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="mb-6 flex items-end justify-between gap-3 border-b border-(--sp) pb-3">
    <h2 className="text-3xl font-black tracking-tight md:text-4xl">{title}</h2>
    {href && <Link href={href} className="inline-flex min-h-10 items-center text-sm font-bold underline underline-offset-8">{linkLabel ?? "عرض الكل"}</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
