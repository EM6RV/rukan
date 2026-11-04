"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "./store-context";

/** قائمة الموبايل (أقسام + صفحات). الشكل يتحكم فيه القالب عبر className. */
export function MobileMenu({ buttonClass, panelClass }: { buttonClass?: string; panelClass?: string }) {
  const { href, categories, pages } = useStore();
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<Element | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  // الهيدر في أغلب القوالب فيه backdrop-blur، وهذا يخلي أي عنصر fixed جواه ينحصر في ارتفاع الهيدر.
  // نعرض القائمة في غلاف المتجر (مش body) علشان متغيرات الألوان تبقى شغالة.
  const openMenu = () => { setHost(btn.current?.closest("[data-theme]") ?? document.body); setOpen(true); };
  return (
    <>
      <button ref={btn} type="button" aria-label="القائمة" aria-expanded={open} onClick={openMenu} className={cn("flex size-11 items-center justify-center lg:hidden", buttonClass)}>
        <Menu className="size-6" />
      </button>
      {open && host && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="القائمة">
          <button type="button" aria-label="إغلاق" className="absolute inset-0 bg-black/50" onClick={close} />
          <nav className={cn("absolute inset-y-0 start-0 flex w-[min(20rem,85vw)] flex-col gap-1 overflow-y-auto bg-white p-5 text-(--sp) shadow-lift", panelClass)}>
            <button type="button" aria-label="إغلاق القائمة" onClick={close} className="mb-3 flex size-10 items-center justify-center self-end rounded-full hover:bg-(--sp-soft)"><X className="size-5" /></button>
            <Link href={href("/")} onClick={close} className="rounded-md px-3 py-2.5 font-semibold hover:bg-(--sp-soft)">الرئيسية</Link>
            <Link href={href("/search")} onClick={close} className="rounded-md px-3 py-2.5 font-semibold hover:bg-(--sp-soft)">كل المنتجات</Link>
            {categories.length > 0 && <p className="mt-3 px-3 text-xs font-semibold text-(--sp-muted)">الأقسام</p>}
            {categories.map((c) => <Link key={c.slug} href={href(`/category/${encodeURIComponent(c.slug)}`)} onClick={close} className="rounded-md px-3 py-2.5 hover:bg-(--sp-soft)">{c.name}</Link>)}
            <p className="mt-3 px-3 text-xs font-semibold text-(--sp-muted)">معلومات</p>
            {pages.map((p) => <Link key={p.slug} href={href(`/page/${p.slug}`)} onClick={close} className="rounded-md px-3 py-2.5 hover:bg-(--sp-soft)">{p.title}</Link>)}
            <Link href={href("/track")} onClick={close} className="rounded-md px-3 py-2.5 hover:bg-(--sp-soft)">تتبع طلبيتك</Link>
          </nav>
        </div>,
        host,
      )}
    </>
  );
}
