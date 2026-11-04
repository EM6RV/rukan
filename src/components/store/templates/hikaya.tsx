"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, SearchLink, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import type { Kit } from "./types";

// «حكاية»: القصة أولاً. للأكل البيتي والصناعة اليدوية والبراندات الصغيرة. هيرو بصورة كبيرة، أقسام تطلع بحركة مع التمرير.

function Header() {
  const { href, categories } = useStore();
  return (
    <header className="sticky top-0 z-30 bg-[#FCF7EF]/92 backdrop-blur">
      <AnnouncementBar className="bg-(--sa) text-(--sa-fg)" />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <MobileMenu />
        <StoreBrand className="flex-1 lg:flex-none" textClass="text-xl font-bold" />
        <nav className="hidden flex-1 items-center justify-center gap-6 lg:flex" aria-label="الأقسام">{categories.slice(0, 5).map((c) => <Link key={c.slug} href={href(`/category/${encodeURIComponent(c.slug)}`)} className="text-sm font-medium hover:text-(--sa-text)">{c.name}</Link>)}</nav>
        <SearchLink /><CartButton />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-20 bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
      <div className="mx-auto max-w-3xl px-6 pt-14 text-center"><StoreBrand className="justify-center" textClass="text-3xl font-bold" /><p className="mt-3 text-sm opacity-80">كل قطعة وراها حكاية… وبنوصّلها لين بابك.</p></div>
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-2"><FooterColumns linkClass="opacity-80 hover:opacity-100 hover:underline" /></div>
      <div className="border-t border-white/15"><Copyright className="mx-auto max-w-6xl px-6 py-4 pb-24 opacity-70 lg:pb-4" /></div>
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="relative isolate -mx-4 overflow-hidden bg-(--sp) text-white md:mx-0 md:rounded-3xl [--focus:#fff] [--focus-halo:transparent]">
    {imageMediaId ? <div className="absolute inset-0 -z-10"><MediaImage id={imageMediaId} alt="" priority sizes="100vw" widths={[960, 1280, 1920]} /></div> : <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-br from-(--sp) to-(--sa)" />}
    <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
    <div className="flex min-h-[24rem] flex-col justify-end gap-3 px-6 pb-10 pt-24 md:min-h-[32rem] md:px-14 md:pb-14">
      <h1 className="max-w-2xl text-balance text-4xl font-extrabold leading-tight md:text-6xl">{title}</h1>
      {subtitle && <p className="max-w-lg text-base opacity-90 md:text-lg">{subtitle}</p>}
      <Link href={ctaHref} className="mt-3 inline-flex h-13 w-fit items-center gap-2 rounded-full bg-white px-8 font-bold text-(--sp) transition-transform hover:scale-[1.03]">{ctaLabel} <ArrowLeft className="size-4" /></Link>
    </div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="sf-reveal group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-(--sa-soft)">
        {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} className="transition-transform duration-700 group-hover:scale-105" />}
        {!p.inStock && <span className="absolute start-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">نفد</span>}
        {p.inStock && p.compareAt && <span className="absolute start-3 top-3 rounded-full bg-(--sa) px-3 py-1 text-xs font-bold text-(--sa-fg)">عرض</span>}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3"><h3 className="line-clamp-1 text-base font-bold">{p.name}</h3><Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="sm" className="shrink-0" /></div>
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="sf-reveal group relative block aspect-[4/5] overflow-hidden rounded-3xl bg-(--sa-soft)">
    {imageMediaId && <MediaImage id={imageMediaId} alt="" sizes="(min-width: 768px) 25vw, 50vw" className="transition-transform duration-700 group-hover:scale-105" />}
    <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
    <span className="absolute inset-x-0 bottom-0 p-4 text-xl font-bold text-white">{name}</span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="sf-reveal mb-7 flex items-end justify-between gap-3">
    <h2 className="text-2xl font-extrabold md:text-4xl">{title}</h2>
    {href && <Link href={href} className="inline-flex min-h-10 items-center border-b-2 border-(--sa) text-sm font-bold hover:text-(--sa-text)">{linkLabel ?? "عرض الكل"}</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
