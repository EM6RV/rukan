"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, Share2, ShoppingBag } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media-url";
import { formatMoney } from "@/lib/money";
import { discountPercent } from "@/lib/pricing";
import { trackPixel } from "@/lib/pixels";
import type { ProductDetail } from "@/server/storefront/types";
import { FavoriteButton } from "./favorites";
import { useCart } from "./cart-context";
import { useStore } from "./store-context";
import { getKit } from "./templates";
import { MediaImage, Price } from "./ui";

/** معرض صور: سحب أفقي (snap) على الموبايل + مصغرات */
function Gallery({ images, name, frame }: { images: string[]; name: string; frame: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    // في RTL الـ scrollLeft سالب: نحسب الإزاحة من عرض العنصر
    const w = el.clientWidth;
    el.scrollTo({ left: -(i * w), behavior: "smooth" });
    setIndex(i);
  };
  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    setIndex(Math.max(0, Math.min(images.length - 1, Math.round(Math.abs(el.scrollLeft) / el.clientWidth))));
  };

  if (images.length === 0) return <div className={cn("flex aspect-square items-center justify-center text-(--sp-muted)", frame)}><ShoppingBag className="size-16" /></div>;
  return (
    <div className="space-y-3">
      <div className={cn("relative overflow-hidden", frame)}>
        <div ref={track} tabIndex={0} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-roledescription="معرض صور" role="group">
          {images.map((id, i) => (
            <div key={id} className="aspect-square w-full shrink-0 cursor-zoom-in snap-center md:aspect-[4/5]" onClick={() => setZoom(true)}>
              <MediaImage id={id} alt={`${name} - صورة ${i + 1}`} priority={i === 0} sizes="(min-width: 1024px) 50vw, 100vw" widths={[640, 960, 1280]} />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5 lg:hidden" aria-hidden>
            {images.map((_, i) => <span key={i} className={cn("h-1.5 rounded-full bg-white shadow transition-all", i === index ? "w-5" : "w-1.5 opacity-70")} />)}
          </div>
        )}
      </div>
      {zoom && (
        <div role="dialog" aria-modal="true" aria-label="تكبير الصورة" className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-4" onClick={() => setZoom(false)}>
          { }
          <img src={mediaUrl(images[index] ?? images[0]!, 1600)} alt={name} className="max-h-full max-w-full object-contain" />
          <button type="button" aria-label="إغلاق" className="absolute end-4 top-4 flex size-11 items-center justify-center rounded-full bg-white/90 text-xl text-black">×</button>
        </div>
      )}
      {images.length > 1 && (
        <div className="hidden gap-2 lg:flex">
          {images.map((id, i) => (
            <button key={id} type="button" onClick={() => go(i)} aria-label={`الصورة ${i + 1}`} aria-current={i === index} className={cn("size-20 overflow-hidden border-2 transition-opacity", i === index ? "border-(--sp)" : "border-transparent opacity-60 hover:opacity-100")}>
              { }
              <img src={mediaUrl(id, 160)} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductView({ product, quick = false }: { product: ProductDetail; quick?: boolean }) {
  const store = useStore();
  const kit = getKit(store.template);
  const cart = useCart();
  const router = useRouter();
  const { toast } = useToast();

  // الاختيار الافتراضي: أول متغير متوفر
  const initial = useMemo(() => {
    const first = product.variants.find((v) => v.stock > 0) ?? product.variants[0];
    return Object.fromEntries(product.options.map((o) => [o.id, o.values.find((v) => first?.valueIds.includes(v.id))?.id ?? o.values[0]?.id ?? ""]));
  }, [product]);
  const [selected, setSelected] = useState<Record<string, string>>(initial);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [note, setNote] = useState("");
  const pz = product.personalization;

  const variant = useMemo(() => {
    const ids = Object.values(selected);
    return product.variants.find((v) => v.valueIds.length === ids.length && ids.every((id) => v.valueIds.includes(id))) ?? (product.options.length === 0 ? product.variants[0] : undefined);
  }, [selected, product]);

  // هل القيمة متوفرة مع باقي الاختيارات الحالية؟
  const available = (optionId: string, valueId: string) =>
    product.variants.some((v) => v.stock > 0 && v.valueIds.includes(valueId) && product.options.every((o) => o.id === optionId || v.valueIds.includes(selected[o.id] ?? "")));

  const stock = variant?.stock ?? 0;
  const maxQty = Math.max(1, Math.min(stock, 20));
  const price = (variant?.price ?? product.price) + (pz && note.trim() ? pz.price : 0);
  const compareAt = variant ? variant.compareAt : product.compareAt;
  const canBuy = !!variant && stock > 0;

  useEffect(() => { trackPixel({ name: "ViewContent", value: product.price, id: product.id, contentName: product.name }); }, [product]);

  function addToCart(goCheckout: boolean) {
    if (!variant || stock <= 0) return;
    const q = Math.min(qty, maxQty);
    cart.add(variant.id, q, pz ? note : undefined);
    trackPixel({ name: "AddToCart", value: price * q, id: product.id, contentName: product.name, quantity: q });
    if (goCheckout) return router.push(store.href("/checkout"));
    setAdded(true);
    toast("تمت الإضافة للسلة");
    setTimeout(() => setAdded(false), 2000);
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: product.name, url });
      else { await navigator.clipboard.writeText(url); toast("تم نسخ رابط المنتج"); }
    } catch {}
  }

  // الشريط اللاصق يظهر بس لما يطلع زر الشراء الأصلي من الشاشة (بدل ما يكرره ويغطيه)
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaVisible, setCtaVisible] = useState(true);
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setCtaVisible(!!e?.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const pct = discountPercent(price, compareAt);

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
      <Gallery images={product.images} name={product.name} frame={kit.cls.imageFrame} />

      <div className="space-y-6">
        <div className="space-y-3">
          {pct && <span className={cn("inline-block", kit.cls.badge)}>خصم {pct}%</span>}
          {quick ? <h2 className={cn(kit.cls.heading, "!text-2xl")}>{product.name}</h2> : <h1 className={cn(kit.cls.heading, "!text-2xl md:!text-4xl")}>{product.name}</h1>}
          <Price price={price} compareAt={compareAt} size="lg" />
          {product.brand && <p className="text-sm text-(--sp-muted)">من <Link href={store.href(`/search?brand=${encodeURIComponent(product.brand.slug)}`)} className="font-semibold underline-offset-4 hover:underline">{product.brand.name}</Link></p>}
          {product.tags.length > 0 && <ul className="flex flex-wrap gap-2" aria-label="وسوم">{product.tags.map((tg) => <li key={tg}><Link href={store.href(`/search?tag=${encodeURIComponent(tg)}`)} className="rounded-full bg-(--sp-soft) px-3 py-1 text-xs">#{tg}</Link></li>)}</ul>}
        </div>

        {product.options.map((o) => {
          const isColor = o.values.some((v) => v.colorHex);
          return (
            <fieldset key={o.id} className="space-y-2.5">
              <legend className="text-sm font-semibold">{o.name}: <span className="font-normal text-(--sp-muted)">{o.values.find((v) => v.id === selected[o.id])?.value}</span></legend>
              <div className="flex flex-wrap gap-2">
                {o.values.map((v) => {
                  const on = selected[o.id] === v.id;
                  const ok = available(o.id, v.id);
                  return isColor && v.colorHex ? (
                    <button key={v.id} type="button" aria-label={v.value} aria-pressed={on} onClick={() => { setSelected((s) => ({ ...s, [o.id]: v.id })); setQty(1); }}
                      className={cn("relative size-10 rounded-full border-2 transition-all", on ? "border-(--sp) ring-2 ring-(--sa) ring-offset-2" : "border-(--sp-line)", !ok && "opacity-40")}
                      style={{ background: v.colorHex }}>
                      {!ok && <span className="absolute inset-0 flex items-center justify-center"><span className="h-px w-8 -rotate-45 bg-black/70" /></span>}
                    </button>
                  ) : (
                    <button key={v.id} type="button" aria-pressed={on} onClick={() => { setSelected((s) => ({ ...s, [o.id]: v.id })); setQty(1); }}
                      className={cn(kit.cls.chip, "min-w-12 text-center", on && kit.cls.chipOn, !ok && !on && "opacity-45 line-through")}>
                      {v.value}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        {pz && (
          <div className="space-y-2">
            <label htmlFor={quick ? "pz-q" : "pz"} className="text-sm font-semibold">{pz.label}{pz.price > 0 && <span className="font-normal text-(--sp-muted)"> (+ {formatMoney(pz.price)})</span>} <span className="font-normal text-(--sp-muted)">اختياري</span></label>
            <input id={quick ? "pz-q" : "pz"} value={note} maxLength={pz.maxChars} onChange={(e) => setNote(e.target.value)} className={kit.cls.input} placeholder={`حتى ${pz.maxChars} حرف`} />
            <p className="text-xs text-(--sp-muted)">{note.length}/{pz.maxChars}</p>
          </div>
        )}
        {product.isBundle && <p className="text-sm font-semibold text-(--sa-text)">باقة مجمعة بسعر خاص</p>}
        {variant && stock > 0 && stock <= 5 && <p className="text-sm font-semibold text-(--sa-text)">باقي {stock} فقط!</p>}
        {(!variant || stock <= 0) && <p role="status" className="text-sm font-semibold text-red-700">{variant ? "نفد من المخزون" : "هذا الاختيار غير متوفر"}</p>}

        <div ref={ctaRef} className="flex items-center gap-3">
          <div className="flex h-13 items-center border border-(--sp-line)" role="group" aria-label="الكمية">
            <button type="button" aria-label="نقص" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex size-12 items-center justify-center disabled:opacity-30"><Minus className="size-4" /></button>
            <span className="w-8 text-center font-semibold" aria-live="polite">{qty}</span>
            <button type="button" aria-label="زيادة" disabled={qty >= maxQty || !canBuy} onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="flex size-12 items-center justify-center disabled:opacity-30"><Plus className="size-4" /></button>
          </div>
          <button type="button" onClick={() => addToCart(false)} disabled={!canBuy} className={cn(kit.cls.btn, "flex-1")}>
            {added ? <><Check className="size-5" /> تمت الإضافة</> : <><ShoppingBag className="size-5" /> أضف للسلة</>}
          </button>
        </div>
        <button type="button" onClick={() => addToCart(true)} disabled={!canBuy} className={cn(kit.cls.btnOutline, "w-full")}>اشتر الآن</button>

        <ul className="space-y-1.5 border-t border-(--sp-line) pt-5 text-sm text-(--sp-muted)">
          <li>✓ الدفع عند الاستلام</li>
          {store.freeDeliveryOver !== null && <li>✓ توصيل مجاني للطلبيات فوق {(store.freeDeliveryOver / 1000).toLocaleString("en-US")} {store.currency}</li>}
          <li>✓ توصيل لكل مدن ليبيا</li>
        </ul>

        {product.description && (
          <div className="space-y-2 border-t border-(--sp-line) pt-5">
            <h2 className="text-lg font-bold">الوصف</h2>
            <div className="whitespace-pre-line leading-8">{product.description}</div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <FavoriteButton product={{ id: product.id, slug: product.slug, name: product.name, price: product.price, compareAt: product.compareAt, thumb: product.images[0] ?? null }} />
          <button type="button" onClick={share} className="inline-flex items-center gap-2 text-sm font-medium text-(--sp-muted) hover:text-(--sp)"><Share2 className="size-4" /> مشاركة المنتج</button>
          {store.pages.some((p) => p.slug === "size-guide") && product.options.some((o) => /مقاس|size/i.test(o.name)) && (
            <a href={store.href("/page/size-guide")} className="text-sm font-medium underline underline-offset-4">دليل المقاسات</a>
          )}
        </div>
      </div>

      {/* شريط الشراء الثابت على الموبايل */}
      {!quick && <div className={cn("fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-(--sp-line) bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform lg:hidden", ctaVisible && "pointer-events-none translate-y-full")} inert={ctaVisible}>
        <div className="min-w-0 flex-1"><Price price={price} compareAt={compareAt} size="md" /></div>
        <button type="button" onClick={() => addToCart(false)} disabled={!canBuy} className={cn(kit.cls.btn, "!h-11 shrink-0 !px-6")}>{canBuy ? "أضف للسلة" : "نفد"}</button>
      </div>}
    </div>
  );
}
