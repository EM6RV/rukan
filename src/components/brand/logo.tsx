import { cn } from "@/lib/cn";

type Props = { variant?: "full" | "icon"; className?: string; priority?: boolean };

// نستعمل ملفات SVG الأصلية كما هي (ما نرسمش اللوجو ولا نكتبه بخط).
// نسخة الوضع الداكن = نفس الـ paths مع الكحلي أبيض، والتبديل بالـ CSS حسب data-theme.
export function Logo({ variant = "full", className }: Props) {
  const base = variant === "full" ? "rukn-logo" : "rukn-icon";
  const ratio = variant === "full" ? "aspect-[567/155.63]" : "aspect-[143.25/155.63]";
  const common = cn(ratio, "h-10 w-auto select-none", className);
  return (
    <>
      {}
      <img src={`/brand/${base}.svg`} alt="رُكن RUKN" className={cn("logo-light", common)} draggable={false} />
      {}
      <img src={`/brand/${base}-dark.svg`} alt="" aria-hidden className={cn("logo-dark", common)} draggable={false} />
    </>
  );
}
