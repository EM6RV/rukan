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

/** دخول عناصر القوائم بتدرّج خفيف (حد أقصى 8 عناصر علشان ما تتأخر القائمة الطويلة). تحترم «تقليل الحركة» تلقائياً. */
export const enterItem = "animate-[fade-up_0.3s_ease-out_both]";
export const enterDelay = (i: number): React.CSSProperties => ({ animationDelay: `${Math.min(i, 8) * 35}ms` });
