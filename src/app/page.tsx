import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { FadeIn } from "@/components/ui/motion";

// صفحة مؤقتة: الموقع التسويقي الكامل (وتعديل نصوصه من الأدمن) في المرحلة 6.
export default function Home() {
  return (
    <div data-theme="light" className="min-h-dvh bg-bg">
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-7 px-5 text-center">
        <FadeIn><Logo className="h-16" /></FadeIn>
        <FadeIn delay={0.08}>
          <h1 className="text-balance text-3xl sm:text-4xl">ركنك في السوق… أونلاين.</h1>
        </FadeIn>
        <FadeIn delay={0.16}>
          <p className="max-w-md text-lg text-muted">افتح متجرك الإلكتروني في دقيقتين، مع دفع عند الاستلام ومندوبين ومرتجعات ومدن ليبيا جاهزة.</p>
        </FadeIn>
        <FadeIn delay={0.24} className="flex flex-wrap justify-center gap-3">
          <ButtonLink href="/register" size="lg">افتح متجرك مجاناً</ButtonLink>
          <ButtonLink href="/login" size="lg" variant="outline">تسجيل الدخول</ButtonLink>
        </FadeIn>
      </main>
    </div>
  );
}
