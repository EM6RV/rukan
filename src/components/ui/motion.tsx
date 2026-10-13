import { cn } from "@/lib/cn";

/**
 * ظهور ناعم (تلاشي + حركة بسيطة لفوق) بـ CSS بحت، يشتغل بدون JavaScript وما ينتظر hydration
 * (مهم لسرعة أول عرض وSEO). Framer Motion نستعمله للمكونات التفاعلية (إشعارات، نوافذ…).
 */
export function FadeIn({
  delay = 0, className, style, ...props
}: React.HTMLAttributes<HTMLDivElement> & { delay?: number }) {
  return <div className={cn("animate-[fade-up_0.45s_ease-out_both]", className)} style={{ animationDelay: `${delay}s`, ...style }} {...props} />;
}
