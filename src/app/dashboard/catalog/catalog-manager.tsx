"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { formatDate } from "@/lib/datetime";
import type { ExpiringItem } from "@/server/catalog/expiry";
import { deleteBrandAction, deletePresetAction, saveBrandAction, savePresetAction } from "./actions";

type Brand = { id: string; name: string; productCount: number };
type Preset = { id: string; name: string; values: { value: string; colorHex: string | null }[] };

export function CatalogManager({ brands, presets, tags, expiring, canEdit }: { brands: Brand[]; presets: Preset[]; tags: { tag: string; count: number }[]; expiring: ExpiringItem[]; canEdit: boolean }) {
  const { act, pending, error } = useAct();
  const [brand, setBrand] = useState("");
  const [pName, setPName] = useState("");
  const [pValues, setPValues] = useState("");

  return (
    <div className="space-y-5">
      {error && <p role="alert" className={errorClass}>{error}</p>}

      {expiring.length > 0 && (
        <Card>
          <CardHeader title="قرب ينتهي" description="منتجات فيها مخزون وتنتهي صلاحيتها خلال 30 يوم." />
          <CardBody>
            <ul className="divide-y divide-line">
              {expiring.map((e) => (
                <li key={e.variantId} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/dashboard/products/${e.productId}`} className="font-medium hover:underline">{e.name}{e.label ? ` (${e.label})` : ""}</Link>
                  <span className="text-sm text-muted">باقي {e.stock} قطعة</span>
                  <span className="flex-1" />
                  <Badge tone={e.daysLeft <= 0 ? "danger" : "gold"}>{e.daysLeft <= 0 ? "منتهي" : `باقي ${e.daysLeft} يوم`}</Badge>
                  <span className="text-xs text-muted">{formatDate(new Date(e.expiresAt))}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="البراندات" description="يختارها الزبون كفلتر في المتجر." />
        <CardBody className="space-y-4">
          {canEdit && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act(() => saveBrandAction({ name: brand }), "تمت الإضافة", () => setBrand("")); }}>
              <Input label="" aria-label="اسم البراند" placeholder="اسم البراند" value={brand} maxLength={60} onChange={(e) => setBrand(e.target.value)} />
              <Button type="submit" disabled={!brand.trim() || pending}><Plus className="size-4" /> إضافة</Button>
            </form>
          )}
          {brands.length === 0 ? <p className="text-sm text-muted">ما فيه براندات لسه.</p> : (
            <ul className="divide-y divide-line">
              {brands.map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-2">
                  <span className="font-medium">{b.name}</span><span className="text-sm text-muted">{b.productCount} منتج</span><span className="flex-1" />
                  {canEdit && <button type="button" aria-label={`حذف ${b.name}`} disabled={pending} onClick={() => act(() => deleteBrandAction(b.id), "تم الحذف")} className="flex size-9 items-center justify-center rounded-md text-danger-fg hover:bg-surface-2"><Trash2 className="size-4" /></button>}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="مكتبة الخيارات" description="مقاسات وألوان جاهزة: تضيفها لأي منتج بضغطة من محرر المنتج." />
        <CardBody className="space-y-4">
          {canEdit && (
            <form className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); act(() => savePresetAction({ name: pName, values: pValues.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean).map((value) => ({ value, colorHex: null })) }), "تمت الإضافة", () => { setPName(""); setPValues(""); }); }}>
              <Input label="اسم الخيار" value={pName} maxLength={60} placeholder="مقاسات الملابس" onChange={(e) => setPName(e.target.value)} />
              <Input label="القيم (افصل بفاصلة)" value={pValues} placeholder="S, M, L, XL" onChange={(e) => setPValues(e.target.value)} />
              <Button type="submit" disabled={!pName.trim() || !pValues.trim() || pending}><Plus className="size-4" /> إضافة</Button>
            </form>
          )}
          {presets.length === 0 ? <p className="text-sm text-muted">ما فيه خيارات محفوظة.</p> : (
            <ul className="divide-y divide-line">
              {presets.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-sm text-muted">{p.values.map((v) => v.value).join("، ")}</span><span className="flex-1" />
                  {canEdit && <button type="button" aria-label={`حذف ${p.name}`} disabled={pending} onClick={() => act(() => deletePresetAction(p.id), "تم الحذف")} className="flex size-9 items-center justify-center rounded-md text-danger-fg hover:bg-surface-2"><Trash2 className="size-4" /></button>}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="الوسوم" description="تنضاف من محرر المنتج. الزبون يفلتر بيها في المتجر." />
        <CardBody>
          {tags.length === 0 ? <p className="text-sm text-muted">ما فيه وسوم لسه.</p> : <ul className="flex flex-wrap gap-2">{tags.map((t) => <li key={t.tag}><Badge>#{t.tag} · {t.count}</Badge></li>)}</ul>}
        </CardBody>
      </Card>
    </div>
  );
}
