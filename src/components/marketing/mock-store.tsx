import { Backpack, Cake, FlaskConical, Footprints, Gem, Droplets, Gift, Shirt, Sparkles, Watch, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { readableOn } from "@/lib/contrast";
import type { StoreTemplate } from "@/lib/constants";

const ICONS: Record<StoreTemplate, LucideIcon[]> = {
  elegant: [FlaskConical, Droplets, Sparkles],
  bold: [Shirt, Footprints, Backpack],
  simple: [Gem, Watch, Sparkles],
  warm: [Cake, Gift, Sparkles],
  editorial: [Shirt, Watch, Gem],
  noir: [FlaskConical, Gem, Droplets],
  pop: [Gift, Sparkles, Cake],
  gallery: [Watch, Backpack, Shirt],
  naqa: [Gem, Watch, Sparkles],
  makhmal: [FlaskConical, Gem, Droplets],
  nabd: [Shirt, Footprints, Backpack],
  souq: [Watch, Backpack, Gem],
  hikaya: [Cake, Gift, Sparkles],
  lamsa: [Gift, Sparkles, Gem],
};

type Props = { name: string; category?: string; primary: string; accent: string; template: StoreTemplate; className?: string };

/** رسم تقريبي لواجهة متجر (بألوان وقالب) للعرض في الموقع التسويقي وفي منتقي القوالب — مش متجر حقيقي */
export function MockStore({ name, category, primary, accent, template: t, className }: Props) {
  const fg = readableOn(primary);
  const accentFg = readableOn(accent);
  const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, white)`;
  const bg = t === "elegant" || t === "makhmal" ? "#FBF8F3" : t === "warm" ? "#FFF9F1" : t === "hikaya" ? "#FCF7EF" : t === "noir" ? "#FAF8F5" : "#FFFFFF";
  const darkHead = t === "bold" || t === "noir" || t === "nabd";
  const round = { simple: "rounded-2xl", elegant: "rounded-sm", bold: "rounded-md", warm: "rounded-3xl", editorial: "rounded-none", noir: "rounded-sm", pop: "rounded-3xl", gallery: "rounded-2xl" , naqa: "rounded-lg", makhmal: "rounded-none", nabd: "rounded-none", souq: "rounded-lg", hikaya: "rounded-3xl", lamsa: "rounded-[2rem]" }[t];
  const brandCls = { simple: "font-bold", elegant: "font-light tracking-widest", bold: "font-black", warm: "font-extrabold", editorial: "font-black tracking-tight", noir: "font-light tracking-[0.3em]", pop: "font-black", gallery: "font-bold tracking-tight" , naqa: "font-semibold", makhmal: "font-extralight tracking-[0.25em]", nabd: "font-black", souq: "font-extrabold", hikaya: "font-bold", lamsa: "font-extrabold" }[t];
  const cardRound = { simple: "rounded-lg", elegant: "", bold: "border-2 shadow-[3px_3px_0_var(--m-p)]", warm: "rounded-2xl", editorial: "", noir: "rounded-t-full", pop: "rounded-2xl", gallery: "rounded-xl" , naqa: "rounded-md", makhmal: "", nabd: "border-2", souq: "rounded-md border", hikaya: "rounded-2xl", lamsa: "rounded-3xl" }[t];
  const heroShape = { simple: "rounded-xl", elegant: "", bold: "border-2", warm: "rounded-2xl", editorial: "border", noir: "", pop: "rounded-2xl", gallery: "rounded-xl" , naqa: "rounded-lg", makhmal: "", nabd: "border-2", souq: "rounded-lg", hikaya: "rounded-3xl", lamsa: "rounded-[2rem]" }[t];
  const btnShape = { simple: "rounded-full", elegant: "", bold: "border-2", warm: "rounded-full", editorial: "", noir: "border", pop: "rounded-full -rotate-2", gallery: "rounded-full" , naqa: "rounded-md", makhmal: "border", nabd: "", souq: "rounded-lg", hikaya: "rounded-full", lamsa: "rounded-full" }[t];

  const card = (i: number) => {
    const Icon = ICONS[t][i]!;
    return (
      <div key={i} className={cn("space-y-1.5", t === "editorial" && "[&>div:first-child]:aspect-[3/4]", t === "noir" && "text-center")}>
        <div className={cn("flex aspect-[4/5] items-center justify-center", cardRound)} style={{ background: mix(primary, 6 + i * 3), borderColor: primary }}>
          <Icon className="size-1/2 stroke-[1.5]" style={{ color: i === 1 ? accent : primary, opacity: 0.8 }} />
        </div>
        <div className={cn("h-1.5 w-3/4 rounded-full", t === "noir" && "mx-auto")} style={{ background: primary, opacity: 0.55 }} />
        <div className={cn("h-1.5 w-1/3 rounded-full", t === "noir" && "mx-auto")} style={{ background: accent }} />
      </div>
    );
  };

  return (
    <div aria-hidden className={cn("overflow-hidden border border-line shadow-lift", round, className)} style={{ background: bg, ["--m-p" as string]: primary }}>
      <div className="px-3 py-1 text-center text-[11px] font-semibold" style={{ background: t === "pop" || t === "gallery" || t === "simple" ? primary : accent, color: t === "pop" || t === "gallery" || t === "simple" ? fg : accentFg }}>توصيل لكل ليبيا</div>
      <div className={cn("flex items-center px-3 py-2.5", t === "editorial" || t === "noir" ? "justify-center" : "justify-between")} style={{ background: darkHead ? primary : undefined, borderBottom: `1px solid ${t === "noir" ? accent : `color-mix(in srgb, ${primary} 15%, transparent)`}` }}>
        <span className={cn("text-sm", brandCls)} style={{ color: darkHead ? fg : primary }}>{name}</span>
        {t !== "editorial" && t !== "noir" && <span className={cn("size-4", t === "warm" || t === "pop" || t === "simple" ? "rounded-full" : "")} style={{ background: darkHead ? fg : primary }} />}
      </div>
      <div className="p-3">
        <div className={cn("relative flex flex-col items-center justify-center gap-1.5 overflow-hidden py-6 text-center", heroShape)} style={{ background: t === "warm" ? mix(accent, 25) : t === "editorial" ? "#fff" : primary, color: t === "warm" ? primary : t === "editorial" ? primary : fg, borderColor: primary }}>
          {(t === "warm" || t === "pop") && <i className="absolute -end-4 -top-4 size-14 rounded-full" style={{ background: accent, opacity: t === "warm" ? 0.5 : 1 }} />}
          {t === "noir" && <i className="absolute inset-1.5 border" style={{ borderColor: accent, opacity: 0.6 }} />}
          <span className={cn("relative text-base", t === "elegant" ? "font-light tracking-[0.2em]" : t === "noir" ? "font-light tracking-[0.25em]" : t === "bold" || t === "pop" || t === "editorial" ? "text-lg font-black" : "font-bold")}>{name}</span>
          {category && <span className="relative text-[11px] opacity-90">{category}</span>}
          <span className={cn("relative mt-1 px-3 py-1 text-[11px] font-bold", btnShape)} style={{ background: t === "noir" ? "transparent" : t === "pop" ? "#fff" : t === "editorial" ? "transparent" : accent, color: t === "noir" ? accent : t === "pop" ? primary : t === "editorial" ? primary : accentFg, borderColor: t === "noir" ? accent : fg }}>تسوّق الآن</span>
        </div>
        <div className={cn("mt-3 grid gap-2", t === "gallery" ? "grid-cols-3 gap-1" : "grid-cols-3")}>{[0, 1, 2].map(card)}</div>
      </div>
    </div>
  );
}
