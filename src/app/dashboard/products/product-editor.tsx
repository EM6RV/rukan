"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { ArrowLeft, ArrowRight, ChevronRight, Copy, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm";
import { Input, Textarea } from "@/components/ui/field";
import { SortableList } from "@/components/ui/sortable-list";
import { useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/cn";
import { dirhamToInput, inputToDirham } from "@/lib/money";
import { uploadImage } from "@/lib/upload-client";
import { parseDecimal } from "@/lib/validation";
import { syncVariants } from "@/lib/variants";
import { MAX_IMAGES, MAX_OPTIONS, MAX_VARIANTS } from "@/server/catalog/product-schema";
import { deleteProductsAction, duplicateProductAction, saveProductAction } from "./actions";

export type EditorProduct = {
  id: string; name: string; description: string | null; price: number; compareAtPrice: number | null; costPrice: number | null;
  isFeatured: boolean; isVisible: boolean; categoryIds: string[]; imageMediaIds: string[];
  options: { id: string; name: string; values: { id: string; value: string; colorHex: string | null }[] }[];
  variants: { id: string; valueIds: string[]; sku: string | null; price: number | null; compareAtPrice: number | null; costPrice: number | null; stock: number; isActive: boolean }[];
};

type Opt = { id: string; name: string; values: { id: string; value: string; colorHex: string | null }[] };
type Var = { id?: string; key: string; valueIds: string[]; sku: string; price: string; stock: string; isActive: boolean; compareAtPrice: string | null; costPrice: string | null };
type Img = { id: string; url: string };

const tmp = () => `tmp_${nanoid(8)}`;
const makeVar = (valueIds: string[]): Var => ({ key: tmp(), valueIds, sku: "", price: "", stock: "0", isActive: true, compareAtPrice: null, costPrice: null });
const isColorOption = (name: string) => /لون|color|colour/i.test(name);

export function ProductEditor({
  initial, categories, writable, quotaBlocked,
}: { initial: EditorProduct | null; categories: { id: string; name: string }[]; writable: boolean; quotaBlocked: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(initial?.categoryIds ?? []);
  const [isFeatured, setIsFeatured] = useState(initial?.isFeatured ?? false);
  const [isVisible, setIsVisible] = useState(initial?.isVisible ?? true);
  const [images, setImages] = useState<Img[]>(initial?.imageMediaIds.map((id) => ({ id, url: `/api/media/${id}` })) ?? []);
  const [uploading, setUploading] = useState(0);
  const [price, setPrice] = useState(dirhamToInput(initial?.price));
  const [compareAt, setCompareAt] = useState(dirhamToInput(initial?.compareAtPrice));
  const [cost, setCost] = useState(dirhamToInput(initial?.costPrice));
  const [options, setOptions] = useState<Opt[]>(initial?.options ?? []);
  const [variants, setVariants] = useState<Var[]>(() =>
    initial
      ? initial.variants.map((v) => ({
          id: v.id, key: v.id, valueIds: v.valueIds, sku: v.sku ?? "", price: dirhamToInput(v.price), stock: String(v.stock), isActive: v.isActive,
          compareAtPrice: v.compareAtPrice === null ? null : dirhamToInput(v.compareAtPrice), costPrice: v.costPrice === null ? null : dirhamToInput(v.costPrice),
        }))
      : [makeVar([])],
  );
  const [confirm, setConfirm] = useState<null | "options-off" | "delete">(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const hasOptions = options.length > 0;

  const discount = (() => {
    const p = inputToDirham(price), c = inputToDirham(compareAt);
    return p && c && c > p ? Math.round((1 - p / c) * 100) : null;
  })();

  function updateOptions(next: Opt[]) {
    setOptions(next);
    setVariants((cur) => syncVariants(next, cur, makeVar));
  }
  const patchVar = (key: string, patch: Partial<Var>) => setVariants((cur) => cur.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  function turnOptionsOff() {
    const total = variants.reduce((s, v) => s + (parseDecimal(v.stock) ?? 0), 0);
    setOptions([]);
    setVariants([{ ...makeVar([]), stock: String(Math.max(0, Math.floor(total))) }]);
    setConfirm(null);
  }

  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_IMAGES - images.length;
    const list = [...files].slice(0, room);
    if (files.length > room) toast(`الحد الأقصى ${MAX_IMAGES} صور`, "info");
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const up = await uploadImage(file, "product");
        setImages((cur) => [...cur, { id: up.id, url: up.url }]);
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  function buildPayload(): { payload?: unknown; error?: string } {
    const p = inputToDirham(price);
    if (p === null) return { error: "اكتب سعر المنتج." };
    if (p === undefined) return { error: "السعر غير صحيح." };
    const money = (s: string, label: string) => { const v = inputToDirham(s); return v === undefined ? new Error(`${label} غير صحيح.`) : v; };
    const c = money(compareAt, "السعر قبل التخفيض"), k = money(cost, "سعر التكلفة");
    if (c instanceof Error) return { error: c.message };
    if (k instanceof Error) return { error: k.message };
    if (options.some((o) => o.values.length === 0)) return { error: "أضف قيمة وحدة على الأقل لكل خيار (أو احذف الخيار)." };

    const vs = [];
    for (const v of variants) {
      const vp = money(v.price, "سعر المتغير");
      if (vp instanceof Error) return { error: vp.message };
      const stock = v.stock.trim() === "" ? 0 : parseDecimal(v.stock);
      if (stock === null || !Number.isInteger(stock)) return { error: "المخزون لازم يكون رقم صحيح." };
      vs.push({
        id: v.id, valueIds: v.valueIds, sku: v.sku.trim() || null, price: vp,
        compareAtPrice: v.compareAtPrice === null ? null : (inputToDirham(v.compareAtPrice) ?? null),
        costPrice: v.costPrice === null ? null : (inputToDirham(v.costPrice) ?? null), stock, isActive: v.isActive,
      });
    }
    return {
      payload: {
        id: initial?.id, name, description, price: p, compareAtPrice: c, costPrice: k, isFeatured, isVisible, categoryIds,
        imageMediaIds: images.map((i) => i.id),
        options: options.map((o) => ({ id: o.id, name: o.name, values: o.values })),
        variants: vs,
      },
    };
  }

  function save() {
    setError(null);
    const { payload, error: clientError } = buildPayload();
    if (clientError) { setError(clientError); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    startTransition(async () => {
      const r = await saveProductAction(payload);
      if (!r.ok) { setError(r.error); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      toast("تم الحفظ");
      if (!initial) router.replace(`/dashboard/products/${r.data.id}`);
      else router.refresh();
    });
  }

  const label = (v: Var) =>
    v.valueIds.map((id) => options.flatMap((o) => o.values).find((x) => x.id === id)?.value ?? "؟").join(" / ") || "المنتج";
  const totalStock = variants.filter((v) => v.isActive).reduce((s, v) => s + (parseDecimal(v.stock) ?? 0), 0);

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/dashboard/products" aria-label="رجوع للمنتجات" className="flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-surface-2"><ChevronRight className="size-5" /></Link>
          <h1 className="truncate text-2xl">{initial ? "تعديل المنتج" : "منتج جديد"}</h1>
        </div>
        {initial && (
          <div className="flex shrink-0">
            <button type="button" aria-label="نسخ المنتج" title="نسخ" disabled={!writable || pending}
              onClick={() => startTransition(async () => { const r = await duplicateProductAction(initial.id); if (!r.ok) return toast(r.error, "error"); toast("تم النسخ (المنسوخ مخفي)"); router.push(`/dashboard/products/${r.data.id}`); })}
              className="flex size-10 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"><Copy className="size-5" /></button>
            <button type="button" aria-label="حذف المنتج" title="حذف" disabled={!writable} onClick={() => setConfirm("delete")}
              className="flex size-10 items-center justify-center rounded-md text-danger-fg hover:bg-surface-2 disabled:opacity-40"><Trash2 className="size-5" /></button>
          </div>
        )}
      </div>

      {!writable && <p role="status" className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger-fg">اشتراكك منتهي: ما تقدرش تعدل حالياً.</p>}
      {quotaBlocked && !initial && <p role="status" className="rounded-md bg-gold/20 px-4 py-3 text-sm font-medium">وصلت للحد الأقصى من المنتجات في باقتك، ما تقدرش تحفظ منتج جديد.</p>}
      {error && <p role="alert" className="rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger-fg">{error}</p>}

      <Card>
        <CardHeader title="المعلومات الأساسية" />
        <CardBody className="space-y-4">
          <Input label="اسم المنتج" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="مثال: عطر عود ملكي 100مل" autoFocus={!initial} />
          <Textarea label="الوصف (اختياري)" rows={5} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} hint="اكتب تفاصيل تهم الزبون: الخامة، الحجم، طريقة الاستعمال…" />
          {categories.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">الأقسام</legend>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const on = categoryIds.includes(c.id);
                  return (
                    <label key={c.id} className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors", on ? "border-gold bg-gold/20 font-medium" : "border-line hover:border-gold/60")}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => setCategoryIds((cur) => (on ? cur.filter((x) => x !== c.id) : [...cur, c.id]))} />
                      {c.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="الصور" description={`حتى ${MAX_IMAGES} صور. الأولى هي الصورة الرئيسية. اسحب للترتيب أو استعمل الأسهم.`} />
        <CardBody>
          <SortableList
            as="div" className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5" items={images} getId={(i) => i.id} onReorder={setImages}
            trailing={
              <>
                {Array.from({ length: uploading }).map((_, i) => (
                  <div key={`up-${i}`} className="flex aspect-square items-center justify-center rounded-lg border border-line bg-surface-2"><Loader2 className="size-6 animate-spin text-muted" /></div>
                ))}
                {images.length + uploading < MAX_IMAGES && (
                  <button type="button" onClick={() => fileInput.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-sm text-muted transition-colors hover:border-gold hover:text-fg">
                    <ImagePlus className="size-6" /> إضافة صور
                  </button>
                )}
              </>
            }
            render={(img, { index, isFirst, isLast, moveUp, moveDown, dragging }) => (
              <div className={cn("group relative aspect-square overflow-hidden rounded-lg border border-line bg-surface-2", dragging && "opacity-40")}>
                <img src={img.url} alt={`صورة ${index + 1}`} className="size-full object-cover" draggable={false} />
                {isFirst && <Badge tone="gold" className="absolute start-1.5 top-1.5">الرئيسية</Badge>}
                <button type="button" aria-label="حذف الصورة" onClick={() => setImages((cur) => cur.filter((i) => i.id !== img.id))} className="absolute end-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white"><X className="size-4" /></button>
                <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
                  <button type="button" aria-label="تقديم" disabled={isFirst} onClick={moveUp} className="flex size-7 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30"><ArrowRight className="size-4" /></button>
                  <button type="button" aria-label="تأخير" disabled={isLast} onClick={moveDown} className="flex size-7 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30"><ArrowLeft className="size-4" /></button>
                </div>
              </div>
            )}
          />
          <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={(e) => addImages(e.target.files)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="التسعير" />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Input label="السعر الحالي (د.ل)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="85" />
          <Input label="السعر قبل التخفيض (اختياري)" inputMode="decimal" value={compareAt} onChange={(e) => setCompareAt(e.target.value)} hint={discount ? `خصم ${discount}%` : "لازم يكون أكبر من السعر الحالي"} />
          <Input label="سعر التكلفة (اختياري)" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} hint="للأرباح فقط، ما يظهرش للزباين" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="المخزون والخيارات" description={hasOptions ? `${variants.length} متغير · المخزون الكلي ${totalStock}` : undefined} />
        <CardBody className="space-y-5">
          <Toggle
            checked={hasOptions} label="للمنتج خيارات (مقاس، لون…)" hint="كل خيار له مخزون وسعر خاص بيه"
            onChange={(on) => (on ? updateOptions([{ id: tmp(), name: "المقاس", values: [] }]) : variants.length > 1 || options.some((o) => o.values.length) ? setConfirm("options-off") : turnOptionsOff())}
          />

          {!hasOptions && variants[0] && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="الكمية المتوفرة" inputMode="numeric" value={variants[0].stock} onChange={(e) => patchVar(variants[0]!.key, { stock: e.target.value })} />
              <Input label="كود المنتج SKU (اختياري)" value={variants[0].sku} maxLength={40} dir="ltr" className="text-right" onChange={(e) => patchVar(variants[0]!.key, { sku: e.target.value })} />
            </div>
          )}

          {hasOptions && (
            <div className="space-y-4">
              {options.map((o, oi) => (
                <OptionEditor
                  key={o.id} option={o}
                  onChange={(next) => updateOptions(options.map((x, i) => (i === oi ? next : x)))}
                  onRemove={() => updateOptions(options.filter((_, i) => i !== oi))}
                />
              ))}
              {options.length < MAX_OPTIONS && (
                <Button variant="outline" size="sm" onClick={() => updateOptions([...options, { id: tmp(), name: options.length === 0 ? "المقاس" : "اللون", values: [] }])}><Plus className="size-4" /> إضافة خيار</Button>
              )}
              {variants.length > MAX_VARIANTS && <p role="alert" className="text-sm text-danger-fg">المتغيرات كثيرة ({variants.length}). الحد الأقصى {MAX_VARIANTS}، قلّل القيم.</p>}

              {variants.length > 0 && variants[0]!.valueIds.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-base">المتغيرات</h3>
                  <BulkFill onStock={(s) => setVariants((cur) => cur.map((v) => ({ ...v, stock: s })))} />
                  <div className="overflow-hidden rounded-lg border border-line">
                    <div className="hidden grid-cols-[1.4fr_1fr_1fr_1.2fr_auto] gap-3 bg-surface-2 px-3 py-2 text-sm text-muted sm:grid"><span>المتغير</span><span>السعر (د.ل)</span><span>المخزون</span><span>SKU</span><span>نشط</span></div>
                    <ul className="divide-y divide-line">
                      {variants.map((v) => (
                        <li key={v.key} className={cn("grid gap-2 p-3 sm:grid-cols-[1.4fr_1fr_1fr_1.2fr_auto] sm:items-center sm:gap-3", !v.isActive && "opacity-60")}>
                          <span className="font-medium">{label(v)}</span>
                          <input aria-label={`سعر ${label(v)}`} inputMode="decimal" value={v.price} onChange={(e) => patchVar(v.key, { price: e.target.value })} placeholder={price ? `${price} (الأساسي)` : "الأساسي"} className="h-10 min-w-0 rounded-md border border-line bg-surface px-3 text-sm" />
                          <input aria-label={`مخزون ${label(v)}`} inputMode="numeric" value={v.stock} onChange={(e) => patchVar(v.key, { stock: e.target.value })} className="h-10 min-w-0 rounded-md border border-line bg-surface px-3 text-sm" />
                          <input aria-label={`كود ${label(v)}`} dir="ltr" value={v.sku} maxLength={40} onChange={(e) => patchVar(v.key, { sku: e.target.value })} className="h-10 min-w-0 rounded-md border border-line bg-surface px-3 text-right text-sm" />
                          <label className="flex items-center gap-2 text-sm sm:justify-center"><input type="checkbox" checked={v.isActive} onChange={(e) => patchVar(v.key, { isActive: e.target.checked })} className="size-4 accent-[var(--color-gold)]" /><span className="sm:sr-only">نشط</span></label>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="الظهور" />
        <CardBody className="space-y-4">
          <Toggle checked={isVisible} onChange={setIsVisible} label="ظاهر في المتجر" hint="لو مخفي ما يشوفوش الزباين" />
          <Toggle checked={isFeatured} onChange={setIsFeatured} label="منتج مميز" hint="يظهر في الصفحة الرئيسية للمتجر" />
        </CardBody>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:start-64">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3 lg:px-5">
          <Link href="/dashboard/products" className="px-3 text-sm font-medium text-muted hover:text-fg">إلغاء</Link>
          <Button size="lg" loading={pending} disabled={!writable || (quotaBlocked && !initial) || uploading > 0} onClick={save}>{initial ? "حفظ التعديلات" : "إضافة المنتج"}</Button>
        </div>
      </div>

      <ConfirmModal open={confirm === "options-off"} onClose={() => setConfirm(null)} onConfirm={turnOptionsOff} danger confirmLabel="إلغاء الخيارات"
        title="إلغاء الخيارات" message="كل الخيارات والمتغيرات تتشال، ويبقى منتج واحد بمخزون مجموع المتغيرات." />
      <ConfirmModal open={confirm === "delete"} onClose={() => setConfirm(null)} danger confirmLabel="حذف" loading={pending}
        title="حذف المنتج" message="متأكد تبي تمسح هذا المنتج؟ الطلبيات القديمة تفضل محفوظة."
        onConfirm={() => startTransition(async () => { const r = await deleteProductsAction([initial!.id]); if (!r.ok) { setConfirm(null); return toast(r.error, "error"); } toast("تم حذف المنتج"); router.push("/dashboard/products"); })} />
    </div>
  );
}

function OptionEditor({ option, onChange, onRemove }: { option: Opt; onChange: (o: Opt) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState("");
  const color = isColorOption(option.name);

  function add() {
    const names = draft.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const have = new Set(option.values.map((v) => v.value.toLowerCase()));
    const fresh = names.filter((n, i) => !have.has(n.toLowerCase()) && names.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i).slice(0, 30 - option.values.length);
    onChange({ ...option, values: [...option.values, ...fresh.map((value) => ({ id: tmp(), value: value.slice(0, 40), colorHex: null }))] });
    setDraft("");
  }

  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <div className="flex items-end gap-2">
        <Input label="اسم الخيار" value={option.name} maxLength={30} className="h-10" onChange={(e) => onChange({ ...option, name: e.target.value })} />
        <button type="button" onClick={onRemove} aria-label="حذف الخيار" className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-md text-danger-fg hover:bg-surface-2"><Trash2 className="size-5" /></button>
      </div>
      <div className="flex flex-wrap gap-2">
        {option.values.map((v) => (
          <span key={v.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pe-1.5 ps-3 text-sm">
            {color && <input type="color" aria-label={`لون ${v.value}`} value={v.colorHex ?? "#999999"} onChange={(e) => onChange({ ...option, values: option.values.map((x) => (x.id === v.id ? { ...x, colorHex: e.target.value } : x)) })} className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0" />}
            {v.value}
            <button type="button" aria-label={`حذف ${v.value}`} onClick={() => onChange({ ...option, values: option.values.filter((x) => x.id !== v.id) })} className="flex size-5 items-center justify-center rounded-full hover:bg-line"><X className="size-3.5" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          aria-label="قيمة جديدة" value={draft} placeholder="اكتب قيمة واضغط Enter (أو افصل بفاصلة: S, M, L)" maxLength={200}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30"
        />
        <Button variant="outline" size="sm" className="h-10" onClick={add} disabled={!draft.trim()}>إضافة</Button>
      </div>
    </div>
  );
}

function BulkFill({ onStock }: { onStock: (s: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex items-center gap-2 text-sm">
      <input aria-label="مخزون موحد" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} placeholder="كمية موحدة" className="h-9 w-32 rounded-md border border-line bg-surface px-3" />
      <Button size="sm" variant="outline" disabled={!v.trim()} onClick={() => onStock(v)}>طبّق على الكل</Button>
    </div>
  );
}
