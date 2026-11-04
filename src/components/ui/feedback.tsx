import Link from "next/link";
import { Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-2", className)} />
);

export const Spinner = ({ className }: { className?: string }) => (
  <Loader2 role="status" aria-label="جاري التحميل" className={cn("size-5 animate-spin text-muted", className)} />
);

/** غلاف هياكل التحميل: يعلن للقارئ الصوتي إن الصفحة تتحمل */
export function SkeletonPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label="جاري التحميل" className={cn("space-y-5", className)}>
      <span className="sr-only">جاري التحميل…</span>
      {children}
    </div>
  );
}

/** عنوان الصفحة (عنوان + سطر وصف) */
export const SkeletonHeader = () => (
  <div className="space-y-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-72 max-w-full" /></div>
);

/** بطاقة صف في قائمة (مثل طلبية أو منتج) */
export function SkeletonRow({ thumb }: { thumb?: boolean }) {
  return (
    <div aria-hidden className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-soft">
      {thumb && <Skeleton className="size-16 shrink-0 rounded-lg" />}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2"><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-20 rounded-full" /></div>
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3.5 w-2/5" />
      </div>
      <div className="space-y-2"><Skeleton className="ms-auto h-5 w-20" /><Skeleton className="ms-auto h-5 w-24 rounded-full" /></div>
    </div>
  );
}

export function EmptyState({
  icon, title, description, action, className,
}: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex animate-[fade-up_0.35s_ease-out_both] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-surface/40 px-6 py-14 text-center", className)}>
      {icon && <div className="flex size-14 items-center justify-center rounded-full bg-gold/15 text-navy ring-8 ring-gold/10 dark:text-gold">{icon}</div>}
      <h2 className="text-lg">{title}</h2>
      {description && <p className="max-w-sm text-sm leading-7 text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** حالة خطأ داخل الصفحة: شنو صار + شنو أسوي (إعادة محاولة أو رجوع) */
export function ErrorState({
  title = "صار خطأ وما قدرنا نكمل", description = "جرّب مرة ثانية. لو استمر الخطأ تأكد من الإنترنت أو كلمنا.", onRetry, homeHref, code, className,
}: { title?: string; description?: string; onRetry?: () => void; homeHref?: string; code?: string; className?: string }) {
  return (
    <div role="alert" className={cn("flex animate-[fade-up_0.3s_ease-out_both] flex-col items-center justify-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 px-6 py-14 text-center", className)}>
      <div className="flex size-14 items-center justify-center rounded-full bg-danger/15 text-danger-fg"><TriangleAlert className="size-6" aria-hidden /></div>
      <h2 className="text-lg">{title}</h2>
      <p className="max-w-sm text-sm leading-7 text-muted">{description}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {onRetry && <Button onClick={onRetry}>إعادة المحاولة</Button>}
        {homeHref && <Link href={homeHref} className="inline-flex h-11 items-center rounded-md border border-line px-5 text-[15px] font-semibold hover:bg-surface-2">الرئيسية</Link>}
      </div>
      {code && <p dir="ltr" className="text-xs text-muted">رمز الخطأ: {code}</p>}
    </div>
  );
}

// ===== هياكل تحميل جاهزة بشكل المحتوى الحقيقي (loading.tsx لكل صفحة يختار واحد منها) =====
const cardCls = "rounded-2xl border border-line bg-surface";

/** صفحة قائمة: عنوان + فلاتر + صفوف */
export function SkeletonListPage({ rows = 6, filters = true, thumb }: { rows?: number; filters?: boolean; thumb?: boolean }) {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      {filters && <Skeleton className="h-11 rounded-xl" />}
      <div className="space-y-2">{Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} thumb={thumb} />)}</div>
    </SkeletonPage>
  );
}

/** شبكة بطاقات أرقام */
export const SkeletonStats = ({ n = 4 }: { n?: number }) => (
  <div aria-hidden className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {Array.from({ length: n }).map((_, i) => <div key={i} className={cn(cardCls, "space-y-2 p-4")}><Skeleton className="h-4 w-20" /><Skeleton className="h-7 w-24" /></div>)}
  </div>
);

/** بطاقة فيها عنوان وسطور */
export const SkeletonCard = ({ lines = 4, className }: { lines?: number; className?: string }) => (
  <div aria-hidden className={cn(cardCls, "space-y-3 p-5", className)}>
    <Skeleton className="h-5 w-32" />
    {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} className={cn("h-4", i % 2 ? "w-3/5" : "w-4/5")} />)}
  </div>
);

/** صفحة لوحة: عنوان + أرقام + بطاقتين */
export function SkeletonDashboardPage() {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      <SkeletonStats />
      <div className="grid gap-4 lg:grid-cols-2"><SkeletonCard lines={5} className="h-64" /><SkeletonCard lines={5} className="h-64" /></div>
    </SkeletonPage>
  );
}

/** صفحة تفاصيل: عنوان + عمودين */
export function SkeletonDetailPage() {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      <div className="grid gap-4 lg:grid-cols-3"><div className="space-y-4 lg:col-span-2"><SkeletonCard lines={5} /><SkeletonCard lines={3} /></div><SkeletonCard lines={6} /></div>
    </SkeletonPage>
  );
}

/** صفحة نموذج/إعدادات: عنوان + تبويبات + خانات */
export function SkeletonFormPage({ tabs = true, fields = 5 }: { tabs?: boolean; fields?: number }) {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      {tabs && <div aria-hidden className="flex gap-2 overflow-hidden border-b border-line pb-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-20 shrink-0" />)}</div>}
      <div aria-hidden className={cn(cardCls, "space-y-5 p-5")}>
        {Array.from({ length: fields }).map((_, i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-11" /></div>)}
        <Skeleton className="h-11 w-32" />
      </div>
    </SkeletonPage>
  );
}

/** شبكة مربعات/بطاقات (القائمة، الوحدات، الباقات) */
export function SkeletonTilesPage({ n = 6, tall }: { n?: number; tall?: boolean }) {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      <div aria-hidden className={cn("grid gap-3", tall ? "sm:grid-cols-2" : "grid-cols-3 sm:grid-cols-4")}>
        {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className={cn("rounded-2xl", tall ? "h-40" : "h-24")} />)}
      </div>
    </SkeletonPage>
  );
}
