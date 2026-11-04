"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import { discountPercent } from "@/lib/pricing";
import type { Kit } from "./types";

// «سوق»: للكتالوجات الكبيرة والإلكترونيات والمحلات العامة. بحث بارز في الهيدر، شريط أقسام كامل، كروت كثيفة وعملية.

function Header() {
  const { href, categories } = useStore();
  return (
    <header className="sticky top-0 z-30 border-b border-(--sp-line) bg-white">
      <AnnouncementBar className="bg-(--sp) text-(--sp-fg)" />
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <MobileMenu />
        <StoreBrand className="shrink-0" textClass="text-xl font-extrabold" />
        <Link href={href("/search")} aria-label="بحث" className="hidden h-11 flex-1 items-center gap-2 rounded-lg border border-(--sp-line) bg-(--sp-soft) px-4 text-sm text-(--sp-muted) hover:border-(--sp) md:flex"><Search className="size-4" />ابحث عن منتج…</Link>
        <span className="flex-1 md:hidden" />
        <Link href={href("/search")} aria-label="بحث" className="flex size-11 items-center justify-center md:hidden"><Search className="size-6" /></Link>
        <CartButton />
      </div>
      {categories.length > 0 && (
        <nav aria-label="الأقسام" className="hidden border-t border-(--sp-line) bg-(--sp-soft) lg:block">
          <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">{categories.map((c) => <li key={c.slug}><Link href={href(`/category/${encodeURIComponent(c.slug)}`)} className="inline-flex h-11 items-center whitespace-nowrap px-4 text-sm font-semibold hover:bg-white hover:text-(--sa-text)">{c.name}</Link></li>)}</ul>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-(--sp-line) bg-(--sp-soft)">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-3"><div><StoreBrand /></div><FooterColumns linkClass="text-(--sp-muted) hover:text-(--sp)" /></div>
      <div className="border-t border-(--sp-line)"><Copyright className="mx-auto max-w-7xl px-4 py-4 pb-24 text-(--sp-muted) lg:pb-4" /></div>
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="relative isolate overflow-hidden rounded-xl bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
    {imageMediaId && <div className="absolute inset-0 -z-10 opacity-40"><MediaImage id={imageMediaId} alt="" priority sizes="100vw" widths={[960, 1280, 1920]} /></div>}
    <div className="flex min-h-[13rem] flex-col justify-center gap-2 px-6 py-8 md:min-h-[16rem] md:px-12">
      <h1 className="max-w-xl text-balance text-2xl font-extrabold md:text-4xl">{title}</h1>
      {subtitle && <p className="max-w-md text-sm opacity-90 md:text-base">{subtitle}</p>}
      <Link href={ctaHref} className="mt-3 inline-flex h-11 w-fit items-center rounded-lg bg-(--sa) px-7 text-sm font-bold text-(--sa-fg) hover:brightness-95">{ctaLabel}</Link>
    </div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  const pct = p.inStock ? (discountPercent(p.price, p.compareAt ?? null) ?? 0) : 0;
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="group flex h-full flex-col rounded-lg border border-(--sp-line) bg-white p-2 transition-shadow hover:shadow-soft">
      <div className="relative aspect-square overflow-hidden rounded-md bg-(--sp-soft)">
        {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} className="object-contain p-1 transition-transform duration-300 group-hover:scale-105" />}
        {pct > 0 && <span className="absolute start-1 top-1 rounded bg-(--sa) px-1.5 py-0.5 text-[11px] font-bold text-(--sa-fg)">-{pct}%</span>}
        {!p.inStock && <span className="absolute start-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">نفد</span>}
      </div>
      <h3 className="mt-2 line-clamp-2 min-h-[2.5rem] px-0.5 text-sm leading-5">{p.name}</h3>
      <Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="sm" className="mt-auto px-0.5 pt-1" />
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="group flex items-center gap-3 rounded-lg border border-(--sp-line) bg-white p-2 hover:border-(--sp)">
    <span className="size-14 shrink-0 overflow-hidden rounded-md bg-(--sp-soft)">{imageMediaId && <MediaImage id={imageMediaId} alt="" sizes="56px" widths={[160]} />}</span>
    <span className="text-sm font-semibold">{name}</span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="mb-4 flex items-center justify-between gap-3 border-s-4 border-(--sa) ps-3">
    <h2 className="text-lg font-extrabold md:text-xl">{title}</h2>
    {href && <Link href={href} className="inline-flex min-h-10 items-center text-sm font-semibold text-(--sa-text) hover:underline">{linkLabel ?? "عرض الكل"}</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
