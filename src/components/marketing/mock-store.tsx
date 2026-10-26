import { Backpack, Cake, FlaskConical, Footprints, Gem, Droplets, Gift, Shirt, Sparkles, Watch, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { readableOn } from "@/lib/contrast";
import type { StoreTemplate } from "@/lib/constants";

const ICONS: Record<StoreTemplate, LucideIcon[]> = {
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
  const bg = t === "makhmal" ? "#FBF8F3" : t === "hikaya" ? "#FCF7EF" : "#FFFFFF";
  const darkHead = t === "nabd";
  const round = { naqa: "rounded-lg", makhmal: "rounded-none", nabd: "rounded-none", souq: "rounded-lg", hikaya: "rounded-3xl", lamsa: "rounded-[2rem]" }[t];
  const brandCls = { naqa: "font-semibold", makhmal: "font-extralight tracking-[0.25em]", nabd: "font-black", souq: "font-extrabold", hikaya: "font-bold", lamsa: "font-extrabold" }[t];
  const cardRound = { naqa: "rounded-md", makhmal: "", nabd: "border-2", souq: "rounded-md border", hikaya: "rounded-2xl", lamsa: "rounded-3xl" }[t];
  const heroShape = { naqa: "rounded-lg", makhmal: "", nabd: "border-2", souq: "rounded-lg", hikaya: "rounded-3xl", lamsa: "rounded-[2rem]" }[t];
  const btnShape = { naqa: "rounded-md", makhmal: "border", nabd: "", souq: "rounded-lg", hikaya: "rounded-full", lamsa: "rounded-full" }[t];
  const lightBar = t === "naqa" || t === "lamsa";

  const card = (i: number) => {
    const Icon = ICONS[t][i]!;
    return (
      <div key={i} className={cn("space-y-1.5", t === "makhmal" && "text-center")}>
        <div className={cn("flex aspect-[4/5] items-center justify-center", cardRound)} style={{ background: mix(primary, 6 + i * 3), borderColor: primary }}>
          <Icon className="size-1/2 stroke-[1.5]" style={{ color: i === 1 ? accent : primary, opacity: 0.8 }} />
        </div>
        <div className={cn("h-1.5 w-3/4 rounded-full", t === "makhmal" && "mx-auto")} style={{ background: primary, opacity: 0.55 }} />
        <div className={cn("h-1.5 w-1/3 rounded-full", t === "makhmal" && "mx-auto")} style={{ background: accent }} />
      </div>
    );
  };

  return (
    <div aria-hidden className={cn("overflow-hidden border border-line shadow-lift", round, className)} style={{ background: bg, ["--m-p" as string]: primary }}>
      <div className="px-3 py-1 text-center text-[11px] font-semibold" style={{ background: lightBar ? primary : accent, color: lightBar ? fg : accentFg }}>توصيل لكل ليبيا</div>
      <div className={cn("flex items-center px-3 py-2.5", t === "makhmal" ? "justify-center" : "justify-between")} style={{ background: darkHead ? primary : undefined, borderBottom: `1px solid color-mix(in srgb, ${primary} 15%, transparent)` }}>
        <span className={cn("text-sm", brandCls)} style={{ color: darkHead ? fg : primary }}>{name}</span>
        {t !== "makhmal" && <span className={cn("size-4", t === "hikaya" || t === "lamsa" || t === "naqa" ? "rounded-full" : "")} style={{ background: darkHead ? fg : primary }} />}
      </div>
      <div className="p-3">
        <div className={cn("relative flex flex-col items-center justify-center gap-1.5 overflow-hidden py-6 text-center", heroShape)} style={{ background: t === "hikaya" ? mix(accent, 25) : primary, color: t === "hikaya" ? primary : fg, borderColor: primary }}>
          {(t === "hikaya" || t === "lamsa") && <i className="absolute -end-4 -top-4 size-14 rounded-full" style={{ background: accent, opacity: t === "hikaya" ? 0.5 : 0.8 }} />}
          {t === "makhmal" && <i className="absolute inset-1.5 border" style={{ borderColor: accent, opacity: 0.6 }} />}
          <span className={cn("relative text-base", t === "makhmal" ? "font-light tracking-[0.25em]" : t === "nabd" ? "text-lg font-black" : "font-bold")}>{name}</span>
          {category && <span className="relative text-[11px] opacity-90">{category}</span>}
          <span className={cn("relative mt-1 px-3 py-1 text-[11px] font-bold", btnShape)} style={{ background: t === "makhmal" ? "transparent" : accent, color: t === "makhmal" ? accent : accentFg, borderColor: t === "makhmal" ? accent : fg }}>تسوّق الآن</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">{[0, 1, 2].map(card)}</div>
      </div>
    </div>
  );
}
