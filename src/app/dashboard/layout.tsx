import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, TriangleAlert } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { BottomNav, SidebarNav, type NavItem } from "@/components/dashboard/nav";
import { SkipLink } from "@/components/ui/skip-link";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { can } from "@/server/permissions";
import { Announcements } from "@/components/dashboard/announcements";
import { OfflineBanner } from "@/components/dashboard/offline-banner";
import { OrdersWatcher } from "@/components/dashboard/orders-watcher";
import { getDb } from "@/db";
import { activeAnnouncementsFor } from "@/server/admin/announcements";
import { getOrdersPulse } from "@/server/orders/pulse";
import { requireStoreContext } from "@/server/store-context";
import { logoutAction } from "../(auth)/actions";

const ALL_ITEMS: (NavItem & { permission: Parameters<typeof can>[1] })[] = [
  { href: "/dashboard", label: "الرئيسية", icon: "home", permission: "dashboard" },
  { href: "/dashboard/orders", label: "الطلبيات", icon: "orders", permission: "orders" },
  { href: "/dashboard/products", label: "المنتجات", icon: "products", permission: "products" },
  { href: "/dashboard/categories", label: "الأقسام", icon: "categories", permission: "categories" },
  { href: "/dashboard/customers", label: "الزبائن", icon: "customers", permission: "customers" },
  { href: "/dashboard/abandoned-carts", label: "السلات المتروكة", icon: "carts", permission: "customers" },
  { href: "/dashboard/couriers", label: "المندوبون والكاش", icon: "couriers", permission: "couriers" },
  { href: "/dashboard/returns", label: "المرتجعات", icon: "returns", permission: "returns" },
  { href: "/dashboard/coupons", label: "الكوبونات", icon: "coupons", permission: "marketing" },
  { href: "/dashboard/reports", label: "التقارير", icon: "reports", permission: "reports" },
  { href: "/dashboard/content", label: "محتوى المتجر", icon: "content", permission: "settings" },
  { href: "/dashboard/design", label: "التصميم", icon: "design", permission: "settings" },
  { href: "/dashboard/staff", label: "الموظفين", icon: "staff", permission: "staff" },
  { href: "/dashboard/billing", label: "الاشتراك", icon: "billing", permission: "billing" },
  { href: "/dashboard/settings", label: "الإعدادات", icon: "settings", permission: "settings" },
];

export const metadata: Metadata = { title: { template: "%s | رُكن", default: "رُكن" } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStoreContext(null);
  // المندوب ما يشوف تنبيهات الطلبيات الجديدة (يشوف طلبياته بس)
  const pulse = can(ctx.role, "orders") && ctx.role !== "courier" ? await getOrdersPulse(ctx.scope) : null;
  const items = ALL_ITEMS.filter((i) => can(ctx.role, i.permission)).map((i): NavItem => ({ href: i.href, label: i.label, icon: i.icon, badge: i.icon === "orders" ? pulse?.newCount : undefined }));
  const { access } = ctx;
  const announcements = await activeAnnouncementsFor(getDb(), ctx.user.id);

  const banner =
    access.state === "suspended" ? { tone: "danger", text: "متجرك موقوف. تواصل مع الدعم لإعادة تفعيله." }
    : access.state === "expired" ? { tone: "danger", text: "انتهت فترة اشتراكك: متجرك مغلق للزباين واللوحة للقراءة فقط." }
    : access.daysLeft !== null && access.daysLeft <= 5 ? { tone: "warning", text: `باقي ${access.daysLeft} ${access.daysLeft === 1 ? "يوم" : "أيام"} على انتهاء ${access.state === "trial" ? "التجربة المجانية" : "اشتراكك"}.` }
    : null;

  return (
    <div className="min-h-dvh bg-bg lg:flex">
      <SkipLink />
      <aside aria-label="القائمة الجانبية" className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-line px-5"><Link href="/dashboard" aria-label="الرئيسية"><Logo className="h-9" /></Link></div>
        <div className="space-y-4 p-4">
          <div className="relative isolate overflow-hidden rounded-xl bg-navy p-3.5 text-white ring-1 ring-white/10">
            <div aria-hidden className="pointer-events-none absolute -top-8 -start-8 -z-10 size-24 rounded-full bg-gold/30 blur-2xl" />
            <p className="truncate font-semibold">{ctx.store.name}</p>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-white/75">
              <Badge tone={access.state === "active" ? "success" : access.state === "trial" ? "gold" : "danger"} className="bg-white/10 text-white ring-white/25">
                {access.state === "active" ? "نشط" : access.state === "trial" ? "تجريبي" : access.state === "expired" ? "منتهي" : "موقوف"}
              </Badge>
              {ctx.planName && <span>باقة {ctx.planName}</span>}
            </div>
          </div>
          <SidebarNav items={items} />
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-line p-3">
          <span className="truncate ps-2 text-sm text-muted">{ctx.user.name}</span>
          <div className="flex"><ThemeToggle /><LogoutButton /></div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/85 px-4 backdrop-blur-md lg:hidden">
          <Link href="/dashboard" aria-label="الرئيسية" className="flex min-h-11 items-center gap-2"><Logo variant="icon" className="h-8" /><span className="max-w-[10rem] truncate font-semibold">{ctx.store.name}</span></Link>
          <div className="flex"><ThemeToggle /><LogoutButton /></div>
        </header>
        {banner && (
          <div role="status" className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium ${banner.tone === "danger" ? "bg-danger/15 text-danger-fg" : "bg-gold/20"}`}>
            <TriangleAlert className="size-4 shrink-0" aria-hidden /> <span className="min-w-0 flex-1">{banner.text}</span>
            {can(ctx.role, "billing") && access.state !== "suspended" && <Link href="/dashboard/billing" className="shrink-0 rounded-md bg-fg px-3 py-1 text-xs font-semibold text-bg hover:opacity-90">جدّد الاشتراك</Link>}
          </div>
        )}
        <OfflineBanner />
        <Announcements items={announcements} />
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-6 pb-28 outline-none lg:px-8 lg:py-8 lg:pb-10">{children}</main>
        <BottomNav items={items} />
        {pulse && <OrdersWatcher initialLatestId={pulse.latest?.id ?? null} />}
      </div>
    </div>
  );
}

function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button aria-label="تسجيل الخروج" className="flex size-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg"><LogOut className="size-5" /></button>
    </form>
  );
}
