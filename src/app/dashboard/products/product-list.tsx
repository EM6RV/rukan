"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, Package, Pencil, Percent, Star, Trash2, Boxes } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { enterDelay, enterItem } from "@/components/ui/motion";
import { ConfirmModal } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import {
  bulkPriceAction, bulkStockAction, deleteProductsAction, duplicateProductAction, setFeaturedAction, setVisibilityAction,
} from "./actions";

type Item = {
  id: string; name: string; price: number; compareAtPrice: number | null; isVisible: boolean; isFeatured: boolean;
  thumbMediaId: string | null; stock: number; variantCount: number;
};

export function ProductList({ items, writable, hasFilters }: { items: Item[]; writable: boolean; hasFilters: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<null | "price" | "stock" | "delete">(null);
  const [mode, setMode] = useState("percent");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  // التغييرات السريعة (إخفاء، تمييز، مخزون) تبان فوراً وترجع لو فشل الحفظ
  const [list, patch] = useOptimistic(items, (cur, u: { ids: string[]; set: Partial<Item> }) => cur.map((i) => (u.ids.includes(i.id) ? { ...i, ...u.set } : i)));

  const ids = [...selected];
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function exec(fn: () => Promise<{ ok: boolean; error?: string }>, success: string, closeDialog = true, optimistic?: { ids: string[]; set: Partial<Item> }) {
    setError(null);
    startTransition(async () => {
      if (optimistic) patch(optimistic);
      let r: { ok: boolean; error?: string };
      try { r = await fn(); } catch { r = { ok: false, error: "ما قدرنا نوصل للسيرفر. تأكد من الإنترنت وجرّب مرة ثانية." }; }
      if (!r.ok) { if (dialog) setError(r.error ?? "صار خطأ"); else toast(r.error ?? "صار خطأ", "error"); return; }
      toast(success);
      if (closeDialog) { setDialog(null); setValue(""); }
      setSelected(new Set());
      router.refresh();
    });
  }

  if (items.length === 0) {
    return hasFilters
      ? <EmptyState icon={<Package className="size-6" />} title="ما لقينا منتجات" description="جرّب تغيّر البحث أو الفلتر." action={<Link href="/dashboard/products" className="inline-flex h-11 items-center rounded-md border border-line px-5 font-semibold hover:bg-surface-2">عرض كل المنتجات</Link>} />
      : <EmptyState icon={<Package className="size-6" />} title="ما عندكش منتجات لسا" description="أضف منتجك الأول، أو استورد قائمة منتجاتك من Excel."
          action={<ButtonLink href="/dashboard/products/new">أضف منتج</ButtonLink>} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-1 text-sm">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))} className="size-4 accent-[var(--color-teal)]" />
          تحديد الكل
        </label>
        {selected.size > 0 && <span className="text-muted">{selected.size} محدد</span>}
      </div>

      <ul className="space-y-2">
        {list.map((p, i) => {
          const low = p.stock === 0 ? "out" : p.stock <= 5 ? "low" : null;
          return (
            <li key={p.id} style={enterDelay(i)} className={cn(enterItem, "flex items-center gap-3 rounded-2xl border bg-surface p-3 shadow-soft transition-colors", selected.has(p.id) ? "border-fg/40 bg-surface-2/60" : "border-line", !p.isVisible && "opacity-75")}>
              <label className="-mx-2 flex size-11 shrink-0 cursor-pointer items-center justify-center"><input type="checkbox" aria-label={`تحديد ${p.name}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="size-5 accent-[var(--color-teal)]" /></label>
              <Link href={`/dashboard/products/${p.id}`} aria-label={p.name} className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                {p.thumbMediaId ? <img src={`/api/media/${p.thumbMediaId}?w=160`} alt="" width={64} height={64} loading={i < 6 ? "eager" : "lazy"} fetchPriority={i < 3 ? "high" : undefined} decoding="async" className="size-full object-cover" /> : <Package className="size-6 text-muted" />}
              </Link>
              <div className="min-w-0 flex-1 space-y-0.5">
                <Link href={`/dashboard/products/${p.id}`} className="block truncate py-2 font-semibold hover:underline">{p.name}</Link>
                <p className="text-sm">
                  <span className="font-semibold">{formatMoney(p.price)}</span>
                  {p.compareAtPrice !== null && <span className="ms-2 text-muted line-through">{formatMoney(p.compareAtPrice)}</span>}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {low === "out" ? <Badge tone="danger">نفد</Badge> : low === "low" ? <Badge tone="gold">باقي {p.stock}</Badge> : <span className="text-muted">المخزون {p.stock}</span>}
                  {p.variantCount > 1 && <span className="text-muted">· {p.variantCount} متغير</span>}
                  {!p.isVisible && <Badge><EyeOff className="size-3" /> مخفي</Badge>}
                </div>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-0.5 sm:flex sm:items-center">
                <Icon label={p.isFeatured ? "إلغاء التمييز" : "منتج مميز"} disabled={!writable} onClick={() => exec(() => setFeaturedAction(p.id, !p.isFeatured), p.isFeatured ? "تم إلغاء التمييز" : "تم تمييز المنتج", false, { ids: [p.id], set: { isFeatured: !p.isFeatured } })}>
                  <Star className={cn("size-4", p.isFeatured && "fill-gold text-gold")} />
                </Icon>
                <Icon label={p.isVisible ? "إخفاء" : "إظهار"} disabled={!writable} onClick={() => exec(() => setVisibilityAction([p.id], !p.isVisible), p.isVisible ? "تم إخفاء المنتج" : "تم إظهار المنتج", false, { ids: [p.id], set: { isVisible: !p.isVisible } })}>
                  {p.isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Icon>
                <Icon label="نسخ" disabled={!writable || pending} onClick={() => exec(() => duplicateProductAction(p.id), "تم نسخ المنتج وهو مخفي. عدّله وأظهره.", false)}><Copy className="size-4" /></Icon>
                <Link href={`/dashboard/products/${p.id}`} aria-label="تعديل" title="تعديل" className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg pointer-coarse:size-11"><Pencil className="size-4" /></Link>
              </div>
            </li>
          );
        })}
      </ul>

      {selected.size > 0 && (
        <div className="fixed inset-x-3 bottom-20 z-30 mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-lift lg:bottom-6 lg:ms-0">
          <span className="px-2 text-sm font-semibold">{selected.size} محدد</span>
          <Button size="sm" variant="outline" disabled={!writable || pending} onClick={() => exec(() => setVisibilityAction(ids, true), "تم الإظهار", false, { ids, set: { isVisible: true } })}><Eye className="size-4" /> إظهار</Button>
          <Button size="sm" variant="outline" disabled={!writable || pending} onClick={() => exec(() => setVisibilityAction(ids, false), "تم الإخفاء", false, { ids, set: { isVisible: false } })}><EyeOff className="size-4" /> إخفاء</Button>
          <Button size="sm" variant="outline" disabled={!writable} onClick={() => { setMode("percent"); setValue(""); setError(null); setDialog("price"); }}><Percent className="size-4" /> السعر</Button>
          <Button size="sm" variant="outline" disabled={!writable} onClick={() => { setMode("set"); setValue(""); setError(null); setDialog("stock"); }}><Boxes className="size-4" /> المخزون</Button>
          <Button size="sm" variant="danger" disabled={!writable} onClick={() => setDialog("delete")}><Trash2 className="size-4" /> حذف</Button>
        </div>
      )}

      <Modal
        open={dialog === "price"} onClose={() => setDialog(null)} title={`تعديل سعر ${selected.size} منتج`}
        footer={<><Button variant="ghost" onClick={() => setDialog(null)}>إلغاء</Button><Button loading={pending} disabled={!value.trim()} onClick={() => exec(() => bulkPriceAction(ids, { mode, value }), "تم تعديل الأسعار")}>طبّق</Button></>}
      >
        <div className="space-y-4">
          <Select label="طريقة التعديل" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="percent">زيادة/نقص بنسبة %</option>
            <option value="add">زيادة/نقص بمبلغ (د.ل)</option>
            <option value="set">تحديد سعر موحد (د.ل)</option>
          </Select>
          <Input label={mode === "percent" ? "النسبة % (سالب للتخفيض)" : mode === "add" ? "المبلغ بالدينار (سالب للتخفيض)" : "السعر الجديد (د.ل)"} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus placeholder={mode === "percent" ? "10 أو -15" : "5"} />
          <p className="text-sm text-muted">يتطبق على السعر وعلى الأسعار الخاصة بالمتغيرات. ولو السعر قبل التخفيض صار أقل من الجديد يتشال.</p>
          {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={dialog === "stock"} onClose={() => setDialog(null)} title={`تعديل مخزون ${selected.size} منتج`}
        footer={<><Button variant="ghost" onClick={() => setDialog(null)}>إلغاء</Button><Button loading={pending} disabled={!value.trim()} onClick={() => exec(() => bulkStockAction(ids, { mode, value }), "تم تعديل المخزون", true, mode === "set" && /^\d+$/.test(value.trim()) ? { ids: list.filter((p) => ids.includes(p.id) && p.variantCount <= 1).map((p) => p.id), set: { stock: Number(value.trim()) } } : undefined)}>طبّق</Button></>}
      >
        <div className="space-y-4">
          <Select label="طريقة التعديل" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="set">تحديد كمية موحدة</option>
            <option value="add">إضافة/نقص كمية</option>
          </Select>
          <Input label={mode === "set" ? "الكمية" : "الكمية (سالب للنقص)"} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <p className="text-sm text-muted">يتطبق على كل متغيرات المنتجات المحددة، وما ينزلش المخزون تحت الصفر.</p>
          {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
        </div>
      </Modal>

      <ConfirmModal
        open={dialog === "delete"} onClose={() => setDialog(null)} danger loading={pending} confirmLabel="حذف"
        title="حذف المنتجات" message={`حذف ${selected.size} منتج؟ الطلبيات القديمة تبقى محفوظة.`}
        onConfirm={() => exec(() => deleteProductsAction(ids), "تم الحذف")}
      />
    </div>
  );
}

function Icon({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="flex size-9 items-center justify-center rounded-md text-muted transition-colors pointer-coarse:size-11 hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40">
      {children}
    </button>
  );
}
