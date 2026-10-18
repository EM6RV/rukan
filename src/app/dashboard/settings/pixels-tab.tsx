"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { savePixelAction } from "./actions";
import { Footer, useSave } from "./settings-shared";

export type PixelsProps = { metaPixelId: string; tiktokPixelId: string; allowed: boolean };

export function PixelsTab({ metaPixelId, tiktokPixelId, allowed, writable }: PixelsProps & { writable: boolean }) {
  const [v, setV] = useState({ metaPixelId, tiktokPixelId });
  const { save, pending, error } = useSave(savePixelAction);
  return (
    <Card><CardBody>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(v); }}>
        {!allowed && <div className="flex items-start gap-3 rounded-lg border border-gold bg-gold/10 p-3 text-sm"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> Pixels متاحة في الباقات الأعلى. تقدر تجهّز المعرّفات من الحين وتشتغل أول ما ترقّى.</div>}
        <p className="text-sm text-muted">اربط متجرك ببكسل إعلاناتك باش تتابع الزيارات والإضافة للسلة والشراء. اكتب المعرّف (ID) بس، مش الكود كامل.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Meta Pixel ID (فيسبوك / إنستغرام)" dir="ltr" className="text-right" inputMode="numeric" value={v.metaPixelId} maxLength={25} disabled={!allowed} onChange={(e) => setV({ ...v, metaPixelId: e.target.value })} placeholder="1234567890123456" />
          <Input label="TikTok Pixel ID" dir="ltr" className="text-right" value={v.tiktokPixelId} maxLength={25} disabled={!allowed} onChange={(e) => setV({ ...v, tiktokPixelId: e.target.value })} placeholder="C1ABCDEF2GHIJ3KLM" />
        </div>
        <Footer pending={pending} error={error} disabled={!writable || !allowed} />
      </form>
    </CardBody></Card>
  );
}
