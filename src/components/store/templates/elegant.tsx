"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { AnnouncementBar, CartButton, Copyright, FooterColumns, SearchLink, StoreBrand } from "../shared";
import { MobileMenu } from "../mobile-menu";
import { useStore } from "../store-context";
import { MediaImage, Price } from "../ui";
import type { Kit } from "./types";

// «أنيق»: هادي وراقي للعطور والعناية. شعار في الوسط، خطوط رفيعة، صور طولية 3:4 بدون حواف، تبديل الصورة عند المرور.

function Header() {
  const { href, categories } = useStore();
  return (
    <header className="sticky top-0 z-30 bg-[#FBF8F3]/95 backdrop-blur">
      <AnnouncementBar className="bg-(--sp) text-xs tracking-wide text-(--sp-fg)" />
      <div className="relative mx-auto flex h-20 max-w-6xl items-center justify-center px-4">
        <div className="absolute start-2 flex"><MobileMenu /><SearchLink className="hidden lg:flex" /></div>
        <StoreBrand className="justify-center" textClass="font-light text-2xl tracking-[0.18em] md:text-3xl" imgClass="h-12" />
        <div className="absolute end-2 flex"><SearchLink className="lg:hidden" /><CartButton /></div>
      </div>
      <nav className="hidden border-y border-(--sa)/40 lg:block" aria-label="الأقسام">
        <ul className="mx-auto flex max-w-6xl justify-center gap-9 px-4 py-3 text-sm tracking-wide">
          {categories.slice(0, 8).map((c) => (
            <li key={c.slug}><Link href={href(`/category/${encodeURIComponent(c.slug)}`)} className="border-b border-transparent pb-0.5 transition-colors hover:border-(--sa)">{c.name}</Link></li>
          ))}
        </ul>
      </nav>
      <div className="border-b border-(--sa)/40 lg:hidden" />
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-24 bg-(--sp) text-(--sp-fg) [--focus:var(--sp-fg)] [--focus-halo:transparent]">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="mb-10 flex justify-center"><StoreBrand className="justify-center" textClass="text-2xl font-light tracking-[0.2em]" /></div>
        <div className="mx-auto grid max-w-3xl gap-10 text-center sm:grid-cols-2 sm:text-start [&_li]:justify-center sm:[&_li]:justify-start [&_a]:justify-center sm:[&_a]:justify-start">
          <FooterColumns linkClass="opacity-85 hover:opacity-100" headingClass="font-light tracking-[0.15em]" />
        </div>
      </div>
      <div className="border-t border-white/15"><Copyright className="mx-auto max-w-6xl px-4 py-5 pb-24 opacity-75 lg:pb-5" /></div>
    </footer>
  );
}

const Hero: Kit["Hero"] = ({ title, subtitle, ctaHref, ctaLabel, imageMediaId }) => (
  <section className="relative isolate overflow-hidden bg-(--sp) text-(--sp-fg)">
    {imageMediaId && <div className="absolute inset-0 -z-10 opacity-45"><MediaImage id={imageMediaId} alt="" priority sizes="100vw" widths={[640, 960, 1280]} /></div>}
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-10">
      <div className="flex min-h-[22rem] flex-col items-center justify-center gap-5 px-6 py-14 text-center outline outline-1 -outline-offset-[12px] outline-(--sa) md:min-h-[30rem]">
        <p className="text-xs tracking-[0.4em] text-(--sa)">مجموعة جديدة</p>
        <h1 className="max-w-2xl text-balance text-4xl font-light leading-snug md:text-6xl">{title}</h1>
        {subtitle && <p className="max-w-md font-light opacity-85 md:text-lg">{subtitle}</p>}
        <Link href={ctaHref} className="mt-2 inline-flex h-12 items-center border border-(--sa) px-9 text-sm tracking-[0.2em] transition-colors hover:bg-(--sa) hover:text-(--sa-fg)">{ctaLabel}</Link>
      </div>
    </div>
  </section>
);

const ProductCard: Kit["ProductCard"] = ({ product: p, priority }) => {
  const { href } = useStore();
  return (
    <Link href={href(`/product/${encodeURIComponent(p.slug)}`)} className="group block text-center">
      <div className="relative aspect-[3/4] overflow-hidden bg-white">
        {p.thumb && <MediaImage id={p.thumb} alt={p.name} priority={priority} className={cn("transition-opacity duration-500", p.thumb2 && "group-hover:opacity-0")} sizes="(min-width: 1024px) 30vw, 50vw" />}
        {p.thumb2 && <MediaImage id={p.thumb2} alt="" className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" sizes="(min-width: 1024px) 30vw, 50vw" />}
        {!p.inStock && <span className="absolute inset-x-0 bottom-0 bg-white/90 py-1.5 text-xs tracking-[0.2em]">نفد</span>}
      </div>
      <div className="space-y-1.5 pt-4">
        <h3 className="line-clamp-2 text-[15px] font-light leading-snug">{p.name}</h3>
        <Price price={p.price} maxPrice={p.maxPrice} compareAt={p.compareAt} size="sm" className="justify-center text-(--sa-text)" />
        <span className="mx-auto block h-px w-8 bg-(--sa) transition-all duration-300 group-hover:w-16" />
      </div>
    </Link>
  );
};

const CategoryTile: Kit["CategoryTile"] = ({ name, href, imageMediaId }) => (
  <Link href={href} className="group relative block aspect-[4/5] overflow-hidden bg-(--sp-soft)">
    {imageMediaId ? <MediaImage id={imageMediaId} alt="" className="transition-transform duration-700 group-hover:scale-105" sizes="(min-width: 1024px) 25vw, 50vw" /> : <span aria-hidden className="flex size-full items-center justify-center bg-gradient-to-br from-(--sa-soft) to-(--sp-soft) text-7xl font-light text-(--sa)">{name.slice(0, 1)}</span>}
    <span className="absolute inset-x-4 bottom-4 flex h-12 items-center justify-center bg-white/90 text-sm tracking-[0.15em] transition-colors group-hover:bg-(--sp) group-hover:text-(--sp-fg)">{name}</span>
  </Link>
);

const SectionTitle: Kit["SectionTitle"] = ({ title, href, linkLabel }) => (
  <div className="mb-10 text-center">
    <h2 className="text-2xl font-light tracking-[0.15em] md:text-3xl">{title}</h2>
    <span className="mx-auto mt-3 block h-px w-14 bg-(--sa)" />
    {href && <Link href={href} className="mt-1 inline-flex min-h-10 items-center text-sm tracking-[0.2em] text-(--sa-text) hover:underline">{linkLabel ?? "عرض الكل"}</Link>}
  </div>
);

export { Header, Footer, Hero, ProductCard, CategoryTile, SectionTitle };
