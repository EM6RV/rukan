"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Eye, Loader2, X } from "lucide-react";
import type { ComponentType } from "react";
import type { CardProduct, ProductDetail } from "@/server/storefront/types";
import { useStore } from "./store-context";

// تحميل كسول: يكسر الدورة (product-view ← القوالب ← quick-cards ← هنا) ويخفف حزمة صفحات المتجر
const ProductView = dynamic(() => import("./product-view").then((m) => m.ProductView), { ssr: false });

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; product: ProductDetail };

/** نافذة العرض السريع: تجيب تفاصيل المنتج عند الفتح بس، وتعرض نفس واجهة الشراء */
function QuickViewDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const store = useStore();
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(store.href(`/quick/${encodeURIComponent(slug)}`), { signal: ctl.signal })
      .then(async (r) => {
        const j = await r.json();
        setState(r.ok && j.product ? { status: "ready", product: j.product } : { status: "error", message: j.error ?? "ما قدرنا نفتح المنتج" });
      })
      .catch((e) => { if (!ctl.signal.aborted) setState({ status: "error", message: e instanceof Error ? "تعذّر التحميل، جرّب مرة ثانية" : "تعذّر التحميل" }); });
    return () => ctl.abort();
  }, [slug, store]);

  return (
    <dialog ref={ref} aria-label="نظرة سريعة على المنتج" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto max-h-[92dvh] w-[min(64rem,96vw)] overflow-y-auto rounded-2xl bg-white p-0 text-(--sp) backdrop:bg-black/50">
      <div className="sticky top-0 z-10 flex justify-end bg-white/95 p-2">
        <button type="button" onClick={onClose} aria-label="إغلاق" className="flex size-11 items-center justify-center rounded-full hover:bg-black/5"><X className="size-5" /></button>
      </div>
      <div className="px-4 pb-6 md:px-8">
        {state.status === "loading" && <p role="status" className="flex items-center justify-center gap-2 py-24 text-(--sp-muted)"><Loader2 className="size-5 animate-spin" /> جاري التحميل…</p>}
        {state.status === "error" && <p role="alert" className="py-24 text-center text-red-700">{state.message}</p>}
        {state.status === "ready" && (
          <>
            <ProductView product={state.product} quick />
            <Link href={store.href(`/product/${encodeURIComponent(slug)}`)} className="mt-6 inline-block text-sm font-medium underline underline-offset-4">عرض التفاصيل الكاملة</Link>
          </>
        )}
      </div>
    </dialog>
  );
}

/** يغلّف كرت المنتج بزر «نظرة سريعة» (يظهر عند المرور/التركيز على الكمبيوتر؛ على الجوال الكرت يفتح الصفحة مباشرة) */
export function withQuickView(Card: ComponentType<{ product: CardProduct; priority?: boolean }>) {
  function WithQuickView(props: { product: CardProduct; priority?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
      <div className="group/qv relative">
        <Card {...props} />
        {props.product.inStock && (
          <button type="button" onClick={() => setOpen(true)} aria-label={`نظرة سريعة على ${props.product.name}`}
            className="absolute end-2 top-2 hidden size-10 items-center justify-center rounded-full bg-white/95 text-black shadow-md transition-opacity focus-visible:opacity-100 md:flex md:opacity-0 md:group-hover/qv:opacity-100 md:group-focus-within/qv:opacity-100">
            <Eye className="size-5" aria-hidden />
          </button>
        )}
        {open && <QuickViewDialog slug={props.product.slug} onClose={() => setOpen(false)} />}
      </div>
    );
  }
  WithQuickView.displayName = `WithQuickView(${Card.displayName ?? Card.name ?? "Card"})`;
  return WithQuickView;
}
