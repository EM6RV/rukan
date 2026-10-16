"use client";

import { Lock } from "lucide-react";
import { ImageUploader } from "@/components/dashboard/image-uploader";
import { MockStore } from "@/components/marketing/mock-store";
import { PALETTES } from "@/lib/business-presets";
import { cn } from "@/lib/cn";
import { STORE_TEMPLATES, STORE_TEMPLATE_LABELS, type StoreTemplate } from "@/lib/constants";

const TEMPLATE_BLURB: Record<StoreTemplate, string> = {
  elegant: "للعطور والعناية: هادي وراقي",
  bold: "للملابس والشباب: قوي وجريء",
  simple: "لأي نشاط: بسيط ونظيف",
  warm: "أكل وحلويات وهدايا: دافي وكبسولات",
  editorial: "أزياء وإكسسوارات: مجلة بخطوط ضخمة",
  noir: "عطور وذهب: داكن وفخم بخطوط ذهبية",
  pop: "هدايا وأطفال: ملون ومرح",
  gallery: "الصور أولاً: معرض بدون إطارات",
};

type Props = {
  logo: { id: string; url: string } | null;
  onLogo: (l: { id: string; url: string } | null) => void;
  template: StoreTemplate;
  onTemplate: (t: StoreTemplate) => void;
  primary: string;
  accent: string;
  onColors: (primary: string, accent: string) => void;
  allTemplates: boolean;
};

/** لوجو + قالب + ألوان (مشترك بين معالج الإعداد وصفحة الإعدادات) */
export function IdentityPicker({ logo, onLogo, template, onTemplate, primary, accent, onColors, allTemplates }: Props) {
  return (
    <div className="space-y-6">
      <ImageUploader label="لوجو المتجر (اختياري)" hint="يفضل صورة مربعة بخلفية شفافة." kind="logo" value={logo} onChange={onLogo} />

      <div className="space-y-2">
        <span className="block text-sm font-medium">القالب</span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {STORE_TEMPLATES.map((tpl) => {
            const locked = !allTemplates && tpl !== "simple";
            const on = template === tpl;
            return (
              <button
                key={tpl} type="button" disabled={locked} onClick={() => onTemplate(tpl)} aria-pressed={on}
                className={cn("relative space-y-2 rounded-xl border p-2 text-center text-xs transition-all disabled:opacity-50", on ? "border-gold ring-2 ring-gold/40" : "border-line hover:border-gold/60")}
              >
                <MockStore template={tpl} name="متجرك" primary={primary} accent={accent} className="pointer-events-none origin-top text-start" />
                <span className="block text-sm font-semibold">{STORE_TEMPLATE_LABELS[tpl]}</span>
                <span className="block text-muted">{TEMPLATE_BLURB[tpl]}</span>
                {locked && <Lock className="absolute end-2 top-2 size-4 text-muted" aria-label="باقة نمو وما فوق" />}
              </button>
            );
          })}
        </div>
        {!allTemplates && <p className="text-sm text-muted">باقي القوالب متاحة في باقة «سنوية» وما فوق.</p>}
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-medium">الألوان</span>
        <div className="flex flex-wrap gap-2">
          {PALETTES.map((p) => {
            const on = p.primary.toLowerCase() === primary.toLowerCase() && p.accent.toLowerCase() === accent.toLowerCase();
            return (
              <button key={p.name} type="button" onClick={() => onColors(p.primary, p.accent)} aria-pressed={on} aria-label={p.name}
                className={cn("flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs transition-all", on ? "border-gold ring-2 ring-gold/40" : "border-line hover:border-gold/60")}>
                <span className="flex"><i className="size-4 rounded-full ring-1 ring-black/10" style={{ background: p.primary }} /><i className="-ms-1.5 size-4 rounded-full ring-1 ring-black/10" style={{ background: p.accent }} /></span>
                {p.name}
              </button>
            );
          })}
        </div>
        <div className="flex gap-4 pt-1">
          <ColorField label="اللون الأساسي" value={primary} onChange={(v) => onColors(v, accent)} />
          <ColorField label="لون التمييز" value={accent} onChange={(v) => onColors(primary, v)} />
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-9 cursor-pointer rounded-md border border-line bg-transparent p-0.5" />
      <span className="space-y-0.5"><span className="block font-medium">{label}</span><span dir="ltr" className="block text-xs text-muted">{value.toUpperCase()}</span></span>
    </label>
  );
}
