"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, CheckCircle2, Landmark, Loader2, Tag, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { trackPixel } from "@/lib/pixels";
import type { DeliveryRate } from "@/server/storefront/types";
import { checkCouponAction, placeOrderAction } from "@/app/s/[key]/actions";
import { useResolvedCart } from "./cart-view";
import { useStore } from "./store-context";
import { getKit } from "./templates";
import { MediaImage } from "./ui";

type Payment = { method: "cod" | "bank_transfer" | "gateway"; config: Record<string, unknown> };
type Saved = { name: string; phone: string; cityId: string; address: string };
const EMPTY: Saved = { name: "", phone: "", cityId: "", address: "" };

// حفظ بيانات الزبون في متصفحه فقط (للطلبات القادمة)
const savedKey = (storeId: string) => `rukn-customer:${storeId}`;
function useSavedCustomer(storeId: string): [Saved, string] {
  const raw = useSyncExternalStore(
    (cb) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); },
    () => { try { return localStorage.getItem(savedKey(storeId)) ?? ""; } catch { return ""; } },
    () => "",
  );
  const saved = useMemo(() => { try { return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Saved>) } : EMPTY; } catch { return EMPTY; } }, [raw]);
  return [saved, raw];
}

export function CheckoutForm({ rates, payments, defaultCityId }: { rates: DeliveryRate[]; payments: Payment[]; defaultCityId: string | null }) {
  const store = useStore();
  const [saved, raw] = useSavedCustomer(store.id);
  // نعيد بناء الفورم لما تتحمل البيانات المحفوظة بعد الـ hydration
  return <CheckoutInner key={raw} initial={saved} rates={rates} payments={payments} defaultCityId={defaultCityId} />;
}

function CheckoutInner({ initial, rates, payments, defaultCityId }: { initial: Saved; rates: DeliveryRate[]; payments: Payment[]; defaultCityId: string | null }) {
  const store = useStore();
  const kit = getKit(store.template);
  const router = useRouter();
  const { lines, loading, subtotal, cart } = useResolvedCart();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [cityId, setCityId] = useState(initial.cityId || defaultCityId || "");
  const [address, setAddress] = useState(initial.address);
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState<"cod" | "bank_transfer">(payments.some((p) => p.method === "cod") ? "cod" : "bank_transfer");
  const [receipt, setReceipt] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [honey, setHoney] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const rate = rates.find((r) => r.cityId === cityId);
  const discount = Math.min(coupon?.discount ?? 0, subtotal);
  const afterDiscount = subtotal - discount;
  const free = store.freeDeliveryOver !== null && afterDiscount >= store.freeDeliveryOver;
  const fee = rate ? (free ? 0 : rate.fee) : null;
  const total = afterDiscount + (fee ?? 0);
  const bank = payments.find((p) => p.method === "bank_transfer");
  const bankCfg = (bank?.config ?? {}) as { bankName?: string; accountHolder?: string; accountNumber?: string; note?: string };

  const tracked = useRef(false);
  useEffect(() => {
    if (!loading && lines.length > 0 && !tracked.current) {
      tracked.current = true;
      trackPixel({ name: "InitiateCheckout", value: subtotal, count: lines.reduce((s, l) => s + l.quantity, 0) });
    }
  }, [loading, lines, subtotal]);

  const itemsPayload = cart.items;

  function applyCoupon() {
    setCouponMsg(null);
    startTransition(async () => {
      const r = await checkCouponAction(store.key, couponInput, itemsPayload);
      if (!r.ok) { setCoupon(null); setCouponMsg(r.error); return; }
      setCoupon({ code: r.code, discount: r.discount });
      setCouponMsg(`تم تطبيق الكود (−${formatMoney(r.discount)})`);
    });
  }

  async function uploadReceipt(file: File | undefined) {
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/s/${encodeURIComponent(store.key)}/receipt`, { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error ?? "فشل رفع الإيصال.");
      setReceipt({ id: json.id, name: file.name });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (method === "bank_transfer" && !receipt) { setError("ارفع صورة إيصال التحويل أول."); return; }
    startTransition(async () => {
      const r = await placeOrderAction(store.key, {
        items: itemsPayload, name, phone, cityId, address, notes, paymentMethod: method,
        couponCode: coupon?.code ?? null, receiptMediaId: method === "bank_transfer" ? receipt?.id : null, website: honey,
      });
      if (!r.ok) { setError(r.error); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      try { localStorage.setItem(savedKey(store.id), JSON.stringify({ name, phone, cityId, address })); } catch {}
      try { sessionStorage.setItem(`rukn-purchase:${r.data.trackingToken}`, JSON.stringify({ total: r.data.total, number: r.data.number, count: lines.reduce((s, l) => s + l.quantity, 0) })); } catch {}
      router.push(store.href(`/order/${r.data.trackingToken}`));
    });
  }

  if (loading) return <div className={cn(kit.cls.panel, "animate-pulse py-16 text-center text-(--sp-muted)")}>جاري التحميل…</div>;
  if (lines.length === 0) {
    return (
      <div className={cn(kit.cls.panel, "mx-auto max-w-md space-y-4 py-12 text-center")}>
        <p className="text-lg font-semibold">سلتك فاضية</p>
        <Link href={store.href("/search")} className={kit.cls.btn}>تصفّح المنتجات</Link>
      </div>
    );
  }

  const field = "space-y-1.5";
  const label = "block text-sm font-semibold";
  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-8">
        {error && <p role="alert" className="border-s-4 border-red-600 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p>}

        <section className={cn(kit.cls.panel, "space-y-5")}>
          <h2 className="text-lg font-bold">بيانات التوصيل</h2>
          <div className={field}><label htmlFor="co-name" className={label}>الاسم</label><input id="co-name" required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={kit.cls.input} /></div>
          <div className={field}>
            <label htmlFor="co-phone" className={label}>رقم الهاتف</label>
            <input id="co-phone" required type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="09X XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} className={cn(kit.cls.input, "text-right")} />
            <p className="text-xs text-(--sp-muted)">رقم ليبي: 091 / 092 / 093 / 094 / 095 أو +218</p>
          </div>
          <div className={field}>
            <label htmlFor="co-city" className={label}>المدينة</label>
            <select id="co-city" required value={cityId} onChange={(e) => setCityId(e.target.value)} className={kit.cls.input}>
              <option value="">اختار المدينة</option>
              {rates.map((r) => <option key={r.cityId} value={r.cityId}>{r.city}</option>)}
            </select>
            {rate && <p className="text-sm text-(--sp-muted)">التوصيل: <b className="text-(--sp)">{fee === 0 ? "مجاني" : formatMoney(rate.fee)}</b>{rate.eta ? ` · ${rate.eta}` : ""}</p>}
          </div>
          <div className={field}><label htmlFor="co-address" className={label}>المنطقة / العنوان</label><textarea id="co-address" required minLength={3} maxLength={200} rows={2} autoComplete="street-address" placeholder="مثال: حي الأندلس، قرب مسجد…" value={address} onChange={(e) => setAddress(e.target.value)} className={cn(kit.cls.input, "h-auto py-3")} /></div>
          <div className={field}><label htmlFor="co-notes" className={label}>ملاحظات (اختياري)</label><textarea id="co-notes" maxLength={300} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={cn(kit.cls.input, "h-auto py-3")} /></div>
          {/* honeypot: خفي، البشر ما يعبّوه */}
          <div aria-hidden className="absolute -start-[9999px] h-0 overflow-hidden"><label>الموقع<input tabIndex={-1} autoComplete="off" value={honey} onChange={(e) => setHoney(e.target.value)} /></label></div>
        </section>

        <section className={cn(kit.cls.panel, "space-y-4")}>
          <h2 className="text-lg font-bold">طريقة الدفع</h2>
          {payments.filter((p) => p.method === "cod" || p.method === "bank_transfer").map((p) => {
            const on = method === p.method;
            return (
              <label key={p.method} className={cn("flex cursor-pointer items-start gap-3 border p-4 transition-colors", on ? "border-(--sp) bg-(--sp-soft)" : "border-(--sp-line)")}>
                <input type="radio" name="payment" className="mt-1 size-4 accent-(--sp)" checked={on} onChange={() => setMethod(p.method as "cod" | "bank_transfer")} />
                <span className="flex-1 space-y-1">
                  <span className="flex items-center gap-2 font-semibold">{p.method === "cod" ? <Banknote className="size-5" /> : <Landmark className="size-5" />}{p.method === "cod" ? "الدفع عند الاستلام" : "تحويل مصرفي"}</span>
                  <span className="block text-sm text-(--sp-muted)">{p.method === "cod" ? "تدفع للمندوب لما يوصلك الطلب." : "حوّل المبلغ وارفع صورة الإيصال."}</span>
                </span>
              </label>
            );
          })}
          {method === "bank_transfer" && (
            <div className="space-y-4 border border-dashed border-(--sp-line) p-4">
              <dl className="space-y-1 text-sm">
                {bankCfg.bankName && <div className="flex justify-between gap-3"><dt className="text-(--sp-muted)">المصرف</dt><dd className="font-semibold">{bankCfg.bankName}</dd></div>}
                {bankCfg.accountHolder && <div className="flex justify-between gap-3"><dt className="text-(--sp-muted)">صاحب الحساب</dt><dd className="font-semibold">{bankCfg.accountHolder}</dd></div>}
                {bankCfg.accountNumber && <div className="flex justify-between gap-3"><dt className="text-(--sp-muted)">رقم الحساب</dt><dd dir="ltr" className="select-all font-semibold">{bankCfg.accountNumber}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="text-(--sp-muted)">المبلغ المطلوب</dt><dd className="font-bold">{formatMoney(total)}</dd></div>
              </dl>
              {bankCfg.note && <p className="text-sm text-(--sp-muted)">{bankCfg.note}</p>}
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className={cn(kit.cls.btnOutline, "w-full")}>
                {uploading ? <Loader2 className="size-5 animate-spin" /> : receipt ? <CheckCircle2 className="size-5 text-green-700" /> : <Upload className="size-5" />}
                {receipt ? `تم رفع: ${receipt.name.slice(0, 24)}` : "ارفع صورة الإيصال"}
              </button>
              <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => uploadReceipt(e.target.files?.[0])} />
            </div>
          )}
        </section>
      </div>

      <aside className={cn(kit.cls.panel, "h-fit space-y-5 lg:sticky lg:top-28")}>
        <h2 className="text-lg font-bold">ملخص الطلبية</h2>
        <ul className="max-h-64 space-y-3 overflow-y-auto">
          {lines.map((l) => (
            <li key={l.variantId} className="flex items-center gap-3 text-sm">
              <span className="relative size-14 shrink-0 overflow-hidden bg-(--sp-soft)">
                {l.image && <MediaImage id={l.image} alt="" sizes="56px" widths={[160]} />}
                <span className="absolute end-0 top-0 min-w-5 bg-(--sp) px-1 text-center text-[11px] font-bold leading-5 text-(--sp-fg)">{l.quantity}</span>
              </span>
              <span className="min-w-0 flex-1"><span className="line-clamp-1 font-medium">{l.name}</span>{l.variantLabel && <span className="block text-xs text-(--sp-muted)">{l.variantLabel}</span>}</span>
              <span className="font-semibold">{formatMoney(l.price * l.quantity)}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-2 border-t border-(--sp-line) pt-4">
          <div className="flex gap-2">
            <input aria-label="كود الخصم" placeholder="كود الخصم" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} className={cn(kit.cls.input, "!h-11 flex-1")} />
            <button type="button" onClick={applyCoupon} disabled={pending || !couponInput.trim()} className={cn(kit.cls.btnOutline, "!h-11 !px-4 shrink-0")}><Tag className="size-4" /> تطبيق</button>
          </div>
          {couponMsg && <p role="status" className={cn("text-sm font-medium", coupon ? "text-green-700" : "text-red-700")}>{couponMsg}</p>}
        </div>

        <dl className="space-y-2 border-t border-(--sp-line) pt-4 text-sm">
          <div className="flex justify-between"><dt>المجموع</dt><dd className="font-semibold">{formatMoney(subtotal)}</dd></div>
          {discount > 0 && <div className="flex justify-between text-green-700"><dt>الخصم</dt><dd className="font-semibold">−{formatMoney(discount)}</dd></div>}
          <div className="flex justify-between"><dt>التوصيل</dt><dd className="font-semibold">{fee === null ? "اختار المدينة" : fee === 0 ? "مجاني" : formatMoney(fee)}</dd></div>
          <div className="flex justify-between border-t border-(--sp-line) pt-3 text-lg font-bold"><dt>الإجمالي</dt><dd>{formatMoney(total)}</dd></div>
        </dl>
        <button type="submit" disabled={pending || uploading || fee === null} className={cn(kit.cls.btn, "w-full")}>
          {pending && <Loader2 className="size-5 animate-spin" />} أكّد الطلب
        </button>
        <p className="text-center text-xs text-(--sp-muted)">بالضغط على «أكّد الطلب» توافق على سياسات المتجر.</p>
      </aside>
    </form>
  );
}
