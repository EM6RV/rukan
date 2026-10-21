"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, SearchLink, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import { discountPercent } from "@/lib/pricing";
import type { Kit } from "./types";

// «نبض»: جريء للملابس والشباب والعروض. خط عريض، شريط عروض بلون التمييز، شارات تخفيض قوية، أقسام كحبوب.

function Header() {
  const { href, categories } = useStore();
  return (
    <header className="sticky top-0 z-30 bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
      <AnnouncementBar className="bg-(--sa) font-bold text-(--sa-fg)" />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <MobileMenu />
        <StoreBrand className="flex-1 lg:flex-none" textClass="text-2xl font-black" />
        <nav className="hidden flex-1 items-center gap-2 ps-6 lg:flex" aria-label="الأقسام">{categories.slice(0, 6).map((c) => <Link key={c.slug} href={href(`/category/${encodeURIComponent(c.slug)}`)} className="rounded-full px-3.5 py-1.5 text-sm font-bold hover:bg-(--sa) hover:text-(--sa-fg)">{c.name}</Link>)}</nav>
        <SearchLink /><CartButton />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-20 bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
      <div className="bg-(--sa) py-3 text-center text-sm font-black text-(--sa-fg)">توصيل لكل ليبيا · الدفع عند الاستلام</div>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3"><div><StoreBrand textClass="text-3xl font-black" /></div><FooterColumns linkClass="font-medium opacity-85 hover:text-(--sa) hover:opacity-100" /></div>
      <div className="border-t border-white/15"><Copyright className="mx-auto max-w-6xl px-4 py-4 pb-24 opacity-70 lg:pb-4" /></div>
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="relative isolate overflow-hidden bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
    <span aria-hidden className="absolute -start-20 top-0 -z-10 h-full w-1/2 -skew-x-12 bg-(--sa)" />
    <div className="grid items-center gap-6 px-6 py-12 md:grid-cols-[1.2fr_1fr] md:px-14 md:py-20">
      <div>
        <h1 className="text-balance text-5xl font-black leading-[1.05] md:text-7xl">{title}</h1>
        {subtitle && <p className="mt-4 max-w-md text-lg font-semibold opacity-90">{subtitle}</p>}
        <Link href={ctaHref} className="mt-8 inline-flex h-14 items-center gap-2 bg-(--sa) px-10 text-lg font-black text-(--sa-fg) shadow-[6px_6px_0_var(--sp-fg)] transition-transform hover:translate-x-1 hover:translate-y-1 hover:shadow-[2px_2px_0_var(--sp-fg)]">{ctaLabel} <ArrowLeft className="size-5" /></Link>
      </div>
      <div className="mx-auto aspect-[4/5] w-full max-w-sm rotate-2 overflow-hidden border-4 border-(--sp-fg) bg-(--sa-soft)">{imageMediaId && <MediaImage id={imageMediaId} alt="" priority sizes="(min-width: 768px) 30vw, 80vw" widths={[480, 720, 960]} />}</div>
    </div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  const pct = p.inStock ? (discountPercent(p.price, p.compareAt ?? null) ?? 0) : 0;
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="group block border-2 border-(--sp) bg-white transition-shadow hover:shadow-[5px_5px_0_var(--sa)]">
      <div className="relative aspect-[3/4] overflow-hidden bg-(--sp-soft)">
        {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} className="transition-transform duration-500 group-hover:scale-105" />}
        {pct > 0 && <span className="absolute start-0 top-3 bg-(--sa) px-3 py-1 text-sm font-black text-(--sa-fg)">-{pct}%</span>}
        {!p.inStock && <span className="absolute inset-x-0 bottom-0 bg-(--sp) py-1.5 text-center text-sm font-bold text-(--sp-fg)">نفد</span>}
      </div>
      <div className="border-t-2 border-(--sp) p-3"><h3 className="line-clamp-1 text-[15px] font-extrabold">{p.name}</h3><Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="sm" /></div>
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="group relative block aspect-square overflow-hidden border-2 border-(--sp) bg-(--sa-soft)">
    {imageMediaId && <MediaImage id={imageMediaId} alt="" sizes="(min-width: 768px) 25vw, 50vw" className="transition-transform duration-500 group-hover:scale-105" />}
    <span className="absolute inset-x-0 bottom-0 bg-(--sp) px-3 py-2 text-base font-black text-(--sp-fg)">{name}</span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="mb-6 flex items-center justify-between gap-3">
    <h2 className="inline-block bg-(--sa) px-4 py-1 text-2xl font-black text-(--sa-fg) md:text-3xl">{title}</h2>
    {href && <Link href={href} className="inline-flex min-h-10 items-center border-b-2 border-(--sp) text-sm font-black hover:bg-(--sa-soft)">{linkLabel ?? "عرض الكل"}</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
