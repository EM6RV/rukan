import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, Search, TriangleAlert } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cookies } from "next/headers";
import { BottomNav, RecentTracker, SearchButton, Sidebar } from "@/components/dashboard/nav";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { dashboardNav } from "@/server/dashboard-nav";
import { SkipLink } from "@/components/ui/skip-link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { hasPermission } from "@/server/permissions";
import { Announcements } from "@/components/dashboard/announcements";
import { PlanNotice } from "@/components/dashboard/plan-notice";
import { OfflineBanner } from "@/components/dashboard/offline-banner";
import { PwaSetup } from "@/components/dashboard/pwa";
import { OrdersWatcher } from "@/components/dashboard/orders-watcher";
import { getDb } from "@/db";
import { activeAnnouncementsFor } from "@/server/admin/announcements";
import { getOrdersPulse } from "@/server/orders/pulse";
import { requireStoreContext } from "@/server/store-context";
import { logoutAction } from "../(auth)/actions";

export const metadata: Metadata = { title: { template: "%s | رُكن", default: "رُكن" } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStoreContext(null);
  // المندوب ما يشوف تنبيهات الطلبيات الجديدة (يشوف طلبياته بس)
  const pulse = hasPermission(ctx, "orders") && ctx.role !== "courier" ? await getOrdersPulse(ctx.scope) : null;
  const items = dashboardNav(ctx).map((i) => (i.icon === "orders" ? { ...i, badge: pulse?.newCount } : i));
  const collapsed = (await cookies()).get("rukn-sidebar")?.value === "collapsed";
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
      <Sidebar
        items={items}
        collapsed={collapsed}
        storeInitial={ctx.store.name.trim().charAt(0) || "ر"}
        storeCard={
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5" aria-label={`${ctx.store.name}: الرئيسية`}>
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-fg font-heading text-sm font-bold text-bg">{ctx.store.name.trim().charAt(0) || "ر"}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{ctx.store.name}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span aria-hidden className={`size-1.5 rounded-full ${access.state === "active" ? "bg-success" : access.state === "trial" ? "bg-gold" : "bg-danger"}`} />
                {access.state === "active" ? "نشط" : access.state === "trial" ? "تجريبي" : access.state === "expired" ? "منتهي" : "موقوف"}{ctx.planName && ` · ${ctx.planName}`}
              </span>
            </span>
          </Link>
        }
        footer={<span className="truncate ps-2 text-sm text-muted">{ctx.user.name}</span>}
      />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 lg:h-16 lg:px-8">
          <Link href="/dashboard" aria-label="الرئيسية" className="flex min-h-11 items-center gap-2 lg:hidden"><Logo variant="icon" className="h-8" /><span className="max-w-[10rem] truncate font-semibold">{ctx.store.name}</span></Link>
          <SearchButton className="hidden w-full max-w-md lg:flex" />
          <div className="flex items-center">
            <button type="button" data-palette-open aria-label="البحث السريع" className="flex size-10 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg lg:hidden"><Search className="size-5" /></button>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        {banner && (
          <div role="status" className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium ${banner.tone === "danger" ? "bg-danger/15 text-danger-fg" : "bg-gold/20"}`}>
            <TriangleAlert className="size-4 shrink-0" aria-hidden /> <span className="min-w-0 flex-1">{banner.text}</span>
            {hasPermission(ctx, "billing") && access.state !== "suspended" && <Link href="/dashboard/billing" className="shrink-0 rounded-md bg-fg px-3 py-1 text-xs font-semibold text-bg hover:opacity-90">جدّد الاشتراك</Link>}
          </div>
        )}
        {ctx.store.planNotice && hasPermission(ctx, "billing") && <PlanNotice notice={ctx.store.planNotice} cycle={ctx.store.billingCycle} planName={ctx.planName} />}
        <OfflineBanner />
        <PwaSetup />
        <Announcements items={announcements} />
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-6 pb-28 outline-none lg:px-8 lg:py-8 lg:pb-10">{children}</main>
        <BottomNav items={items} />
        <CommandPalette items={items} />
        <RecentTracker />
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
