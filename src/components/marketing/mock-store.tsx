import { Backpack, FlaskConical, Footprints, Gem, Droplets, Shirt, Sparkles, Watch, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { readableOn } from "@/lib/contrast";

const ICONS: Record<Props["template"], LucideIcon[]> = {
  elegant: [FlaskConical, Droplets, Sparkles],
  bold: [Shirt, Footprints, Backpack],
  simple: [Gem, Watch, Sparkles],
};

type Props = { name: string; category?: string; primary: string; accent: string; template: "elegant" | "bold" | "simple"; className?: string };

/** رسم تقريبي لواجهة متجر (بألوان وقالب) للعرض في الموقع التسويقي — مش متجر حقيقي */
export function MockStore({ name, category, primary, accent, template, className }: Props) {
  const fg = readableOn(primary);
  const accentFg = readableOn(accent);
  const bg = template === "elegant" ? "#FBF8F3" : "#FFFFFF";
  const card = (i: number) => {
    const Icon = ICONS[template][i]!;
    return (
    <div key={i} className="space-y-1.5">
      <div className={cn("flex aspect-[4/5] items-center justify-center", template === "elegant" ? "bg-white" : template === "bold" ? "border-2 shadow-[3px_3px_0_var(--m-p)]" : "rounded-lg")} style={{ background: `color-mix(in srgb, ${primary} ${6 + i * 3}%, white)`, borderColor: primary }}>
        <Icon className="size-1/2 stroke-[1.5]" style={{ color: i === 1 ? accent : primary, opacity: 0.8 }} />
      </div>
      <div className="h-1.5 w-3/4 rounded-full" style={{ background: primary, opacity: 0.55 }} />
      <div className="h-1.5 w-1/3 rounded-full" style={{ background: accent }} />
    </div>
    );
  };
  return (
    <div aria-hidden className={cn("overflow-hidden border border-line shadow-lift", template === "bold" ? "rounded-md" : "rounded-2xl", className)} style={{ background: bg, ["--m-p" as string]: primary }}>
      <div className="px-3 py-1 text-center text-[11px] font-semibold" style={{ background: accent, color: accentFg }}>توصيل لكل ليبيا</div>
      <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: `1px solid color-mix(in srgb, ${primary} 15%, transparent)` }}>
        <span className={cn("text-sm", template === "elegant" ? "font-light tracking-widest" : template === "bold" ? "font-black" : "font-bold")} style={{ color: primary }}>{name}</span>
        <span className="size-4 rounded-full" style={{ background: primary }} />
      </div>
      <div className="p-3">
        <div className={cn("flex flex-col items-center justify-center gap-1.5 py-6 text-center", template === "bold" ? "border-2" : template === "elegant" ? "" : "rounded-xl")} style={{ background: primary, color: fg, borderColor: primary }}>
          <span className={cn("text-base", template === "elegant" ? "font-light tracking-[0.2em]" : template === "bold" ? "text-lg font-black" : "font-bold")}>{name}</span>
          {category && <span className="text-[11px] opacity-90">{category}</span>}
          <span className={cn("mt-1 px-3 py-1 text-[11px] font-bold", template === "simple" ? "rounded-full" : template === "bold" ? "border-2" : "")} style={{ background: accent, color: accentFg, borderColor: fg }}>تسوّق الآن</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">{[0, 1, 2].map(card)}</div>
      </div>
    </div>
  );
}
