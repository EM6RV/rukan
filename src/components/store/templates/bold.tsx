"use client";

import Link from "next/link";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, SearchLink, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import type { Kit } from "./types";

// «جريء»: للملابس والشباب. هيدر ملون بخط سميك، حواف قوية وظلال صلبة، عناوين ضخمة، شريط متحرك.

function Header() {
  const { href, categories, announcementBar } = useStore();
  return (
    <header className="sticky top-0 z-30 border-b-4 border-(--sa) bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
      {announcementBar && (
        <div className="overflow-hidden border-b-2 border-(--sp-fg)/20 bg-(--sa) py-1.5 text-(--sa-fg)">
          <p className="sr-only">{announcementBar}</p>
          <div className="flex w-max animate-[marquee_28s_linear_infinite] gap-10 motion-reduce:animate-none hover:[animation-play-state:paused] active:[animation-play-state:paused] whitespace-nowrap text-sm font-black" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => <span key={i}>★ {announcementBar}</span>)}
          </div>
        </div>
      )}
      <AnnouncementBar className="hidden" />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-1 px-4">
        <MobileMenu buttonClass="-ms-2" panelClass="border-e-4 border-(--sa)" />
        <StoreBrand className="flex-1 lg:flex-none" textClass="text-2xl font-black" />
        <nav className="hidden flex-1 items-center gap-1 ps-8 lg:flex" aria-label="الأقسام">
          {categories.slice(0, 7).map((c) => <Link key={c.slug} href={href(`/category/${encodeURIComponent(c.slug)}`)} className="px-3 py-2 text-sm font-extrabold transition-colors hover:bg-(--sa) hover:text-(--sa-fg)">{c.name}</Link>)}
        </nav>
        <SearchLink className="hover:bg-(--sa) hover:text-(--sa-fg)" />
        <CartButton className="hover:bg-(--sa) hover:text-(--sa-fg)" />
      </div>
    </header>
  );
}

function Footer() {
  const { name } = useStore();
  return (
    <footer className="mt-20 border-t-4 border-(--sa) bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
      <div className="mx-auto max-w-6xl overflow-hidden px-4 pt-12">
        <p aria-hidden className="select-none text-center text-[clamp(3rem,16vw,9rem)] font-black leading-none text-(--sa)/90">{name}</p>
        <div className="mt-10 grid gap-8 sm:grid-cols-2 [&_h2]:font-black">
          <FooterColumns linkClass="font-medium opacity-90 hover:text-(--sa) hover:opacity-100" />
        </div>
      </div>
      <div className="mt-8 border-t-2 border-white/15"><Copyright className="mx-auto max-w-6xl px-4 py-4 pb-24 font-medium opacity-80 lg:pb-4" /></div>
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="relative overflow-hidden border-4 border-(--sp) bg-(--sa) text-(--sa-fg) shadow-[8px_8px_0_var(--sp)]">
    {imageMediaId && <div className="absolute inset-y-0 start-0 hidden w-1/2 border-e-4 border-(--sp) md:block"><MediaImage id={imageMediaId} alt="" priority sizes="50vw" widths={[640, 960]} /></div>}
    <div className="relative px-6 py-12 md:py-20 md:ps-[55%] md:pe-12">
      <h1 className="text-balance text-4xl font-black leading-[1.05] md:text-6xl">{title}</h1>
      {subtitle && <p className="mt-4 max-w-md text-lg font-bold opacity-90">{subtitle}</p>}
      <Link href={ctaHref} className="mt-8 inline-flex h-13 items-center border-4 border-(--sp) bg-(--sp) px-8 text-lg font-black text-(--sp-fg) shadow-[5px_5px_0_var(--sp-fg)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0_var(--sp-fg)]">{ctaLabel}</Link>
    </div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="group relative block border-2 border-(--sp) bg-white shadow-[4px_4px_0_var(--sp)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_var(--sp)]">
      <div className="relative aspect-square border-b-2 border-(--sp) bg-(--sp-soft)">
        {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} />}
        {p.inStock && p.compareAt && <span className="absolute -start-2 top-3 -rotate-3 border-2 border-(--sp) bg-(--sa) px-2.5 py-0.5 text-sm font-black text-(--sa-fg)">تخفيض!</span>}
        {!p.inStock && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-xl font-black">نفد</span>}
      </div>
      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 min-h-[2.6rem] text-[15px] font-extrabold leading-snug">{p.name}</h3>
        <Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="md" className="font-black" />
      </div>
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="group relative block aspect-[4/3] overflow-hidden border-2 border-(--sp) bg-(--sa) shadow-[4px_4px_0_var(--sp)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_var(--sp)]">
    {imageMediaId ? <MediaImage id={imageMediaId} alt="" sizes="(min-width: 1024px) 25vw, 50vw" /> : <span aria-hidden className="flex size-full items-center justify-center text-8xl font-black text-(--sp)/20">{name.slice(0, 1)}</span>}
    <span className="absolute bottom-0 start-0 border-e-2 border-t-2 border-(--sp) bg-(--sp) px-4 py-2 text-lg font-black text-(--sp-fg)">{name}</span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="mb-6 flex items-end justify-between gap-3 border-b-4 border-(--sp) pb-2">
    <h2 className="text-3xl font-black md:text-4xl">{title}</h2>
    {href && <Link href={href} className="inline-flex min-h-10 items-center border-2 border-(--sp) px-3 text-sm font-black transition-colors hover:bg-(--sp) hover:text-(--sp-fg)">{linkLabel ?? "الكل"} ←</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
