"use client";

import Link from "next/link";
import { Link2, Mail, MapPin, Phone, Search, ShoppingBag } from "lucide-react";
import { socialUrl } from "@/lib/social";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media-url";
import { useCart } from "./cart-context";
import { useStore } from "./store-context";

/** شعار المتجر أو اسمه */
export function StoreBrand({ className, imgClass, textClass }: { className?: string; imgClass?: string; textClass?: string }) {
  const { href, name, logoMediaId } = useStore();
  return (
    <Link href={href("/")} className={cn("flex min-w-0 items-center gap-2.5", className)} aria-label={name}>
      {logoMediaId &&   <img src={mediaUrl(logoMediaId, 320)} alt="" className={cn("h-10 w-auto max-w-[8rem] object-contain", imgClass)} />}
      <span className={cn("truncate font-heading text-lg font-bold", textClass)}>{name}</span>
    </Link>
  );
}

export function CartButton({ className }: { className?: string }) {
  const { href } = useStore();
  const { count, ready } = useCart();
  return (
    <Link href={href("/cart")} aria-label={`السلة${ready && count ? ` (${count})` : ""}`} className={cn("relative flex size-11 items-center justify-center", className)}>
      <ShoppingBag className="size-6" />
      {ready && count > 0 && (
        <span className="absolute -end-0.5 top-0.5 flex min-w-5 items-center justify-center rounded-full bg-(--sa) px-1 text-[11px] font-bold leading-5 text-(--sa-fg)">{count}</span>
      )}
    </Link>
  );
}

export function SearchLink({ className }: { className?: string }) {
  const { href } = useStore();
  return <Link href={href("/search")} aria-label="بحث" className={cn("flex size-11 items-center justify-center", className)}><Search className="size-6" /></Link>;
}

export function AnnouncementBar({ className }: { className?: string }) {
  const { announcementBar } = useStore();
  if (!announcementBar) return null;
  return <div className={cn("px-4 py-2 text-center text-sm font-medium", className)}>{announcementBar}</div>;
}


/** روابط التواصل والصفحات (تتشارك بين الفوترات) */
export function FooterColumns({ linkClass, headingClass }: { linkClass?: string; headingClass?: string }) {
  const { href, pages, social, contact, whatsapp } = useStore();
  const socials = [
    social.instagram && { label: "إنستغرام", url: socialUrl("instagram", social.instagram) },
    social.facebook && { label: "فيسبوك", url: socialUrl("facebook", social.facebook) },
    social.tiktok && { label: "تيك توك", url: socialUrl("tiktok", social.tiktok) },
    social.snapchat && { label: "سناب شات", url: socialUrl("snapchat", social.snapchat) },
  ].filter(Boolean) as { label: string; url: string }[];
  return (
    <>
      <div>
        <h3 className={cn("mb-3 text-base font-bold", headingClass)}>معلومات</h3>
        <ul className="space-y-0.5 text-sm [&_a]:inline-flex [&_a]:min-h-10 [&_a]:items-center">
          {pages.map((p) => <li key={p.slug}><Link className={linkClass} href={href(`/page/${p.slug}`)}>{p.title}</Link></li>)}
          <li><Link className={linkClass} href={href("/track")}>تتبع طلبيتك</Link></li>
        </ul>
      </div>
      <div>
        <h3 className={cn("mb-3 text-base font-bold", headingClass)}>تواصل معنا</h3>
        <ul className="space-y-0.5 text-sm [&_a]:min-h-10 [&_a]:items-center">
          {whatsapp && <li><a className={cn("flex items-center gap-2", linkClass)} href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer"><Phone className="size-4" /> واتساب</a></li>}
          {contact.phone && <li><a className={cn("flex items-center gap-2", linkClass)} href={`tel:${contact.phone}`}><Phone className="size-4" /> <bdi dir="ltr">{contact.phone}</bdi></a></li>}
          {contact.email && <li><a className={cn("flex items-center gap-2", linkClass)} href={`mailto:${contact.email}`}><Mail className="size-4" /> {contact.email}</a></li>}
          {contact.address && <li className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0" /> {contact.address}</li>}
          {socials.map((s) => <li key={s.label}><a className={cn("flex items-center gap-2", linkClass)} href={s.url} target="_blank" rel="noopener noreferrer nofollow"><Link2 className="size-4" /> {s.label}</a></li>)}
        </ul>
      </div>
    </>
  );
}

export function Copyright({ className }: { className?: string }) {
  const { name, footerText, showBranding } = useStore();
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 text-sm", className)}>
      <span>© {new Date().getFullYear()} {name}{footerText ? ` · ${footerText}` : ""}</span>
      {showBranding && <a href="https://rukn.ly" target="_blank" rel="noopener" className="inline-flex min-h-8 items-center underline-offset-2 hover:underline">مدعوم من رُكن</a>}
    </div>
  );
}
