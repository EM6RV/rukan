import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { SkipLink } from "@/components/ui/skip-link";
import { toWhatsappNumber } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";

/** رأس الموقع التسويقي (مشترك بين الرئيسية وصفحات الأنشطة) */
export function SiteHeader({ cta }: { cta: string }) {
  return (
    <>
      <SkipLink />
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" aria-label="رُكن"><Logo className="h-9" priority /></Link>
          <nav aria-label="الموقع" className="hidden items-center gap-6 text-[15px] font-medium text-muted md:flex">
            <Link href="/#niches" className="hover:text-fg">أنشطة</Link><Link href="/#templates" className="hover:text-fg">القوالب</Link><Link href="/#stories" className="hover:text-fg">المميزات</Link><Link href="/#pricing" className="hover:text-fg">الأسعار</Link><Link href="/#faq" className="hover:text-fg">أسئلة شائعة</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-semibold hover:bg-surface-2">دخول</Link>
            <ButtonLink href="/register" size="sm">{cta}</ButtonLink>
          </div>
        </div>
      </header>
    </>
  );
}

export function SiteFooter({ text, supportWhatsapp }: { text: string; supportWhatsapp: string | null }) {
  const support = supportWhatsapp ? toWhatsappNumber(supportWhatsapp) : null;
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm">
        <div className="flex items-center gap-3"><Logo className="h-8" /><span className="text-muted">{text}</span></div>
        <nav aria-label="روابط" className="flex flex-wrap items-center gap-5 font-medium">
          <Link href="/login" className="hover:underline">تسجيل الدخول</Link><Link href="/register" className="hover:underline">فتح متجر</Link>
          {support && <a href={waLink(support, "السلام عليكم، عندي سؤال عن منصة رُكن")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-success-fg hover:underline"><MessageCircle className="size-4" aria-hidden /> تواصل معانا</a>}
        </nav>
      </div>
    </footer>
  );
}

/** عنوان قسم موحّد: عنوان + خط ذهبي قصير + وصف */
export function SectionHead({ title, subtitle, light }: { title: string; subtitle?: string; light?: boolean }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center md:mb-12">
      <h2 className={`text-balance text-3xl tracking-tight md:text-4xl ${light ? "text-white" : ""}`}>{title}</h2>
      <span aria-hidden className="mx-auto mt-4 block h-1 w-12 rounded-full bg-gold" />
      {subtitle && <p className={`mt-4 text-lg leading-8 ${light ? "text-white/75" : "text-muted"}`}>{subtitle}</p>}
    </div>
  );
}
