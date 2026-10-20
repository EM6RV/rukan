import { cn } from "@/lib/cn";

/**
 * ظهور ناعم (تلاشي + حركة بسيطة لفوق) بـ CSS بحت، يشتغل بدون JavaScript وما ينتظر hydration
 * (مهم لسرعة أول عرض وSEO). حتى الإشعارات والنوافذ بحركات CSS، باش ما تتحمل مكتبة حركة في كل صفحة.
 */
export function FadeIn({
  delay = 0, className, style, ...props
}: React.HTMLAttributes<HTMLDivElement> & { delay?: number }) {
  return <div className={cn("animate-[rise_0.4s_ease-out_both]", className)} style={{ animationDelay: `${delay}s`, ...style }} {...props} />;
}

/** دخول عناصر القوائم بتدرّج خفيف (حد أقصى 6 عناصر علشان ما تتأخر القائمة الطويلة). تحترم «تقليل الحركة» تلقائياً. */
// يبدا نص ظاهر (مش من الصفر) باش ما يأخرش أول عرض للمحتوى (LCP)
export const enterItem = "animate-[rise_0.22s_ease-out_both]";
export const enterDelay = (i: number): React.CSSProperties => ({ animationDelay: `${Math.min(i, 6) * 25}ms` });
