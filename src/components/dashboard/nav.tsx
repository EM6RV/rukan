"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3, Blocks, Brush, CreditCard, FolderTree, LayoutDashboard, LayoutGrid, Package, Palette, PanelRightClose, PanelRightOpen,
  PenLine, RotateCcw, Star, Search, Settings, ShoppingBag, ShoppingCart, Ticket, Truck, UserCog, Users, type LucideIcon,
} from "lucide-react";
import { activeHref, BOTTOM_NAV, MENU_HREF, NAV_GROUPS, type NavIcon, type NavItem } from "@/lib/dashboard-nav";
import { cn } from "@/lib/cn";

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  home: LayoutDashboard, orders: ShoppingBag, products: Package, categories: FolderTree, customers: Users, carts: ShoppingCart, couriers: Truck,
  returns: RotateCcw, coupons: Ticket, reviews: Star, reports: BarChart3, services: Brush, content: PenLine, design: Palette, staff: UserCog, billing: CreditCard,
  settings: Settings, modules: Blocks, menu: LayoutGrid,
};

export function CountBadge({ n, className }: { n?: number; className?: string }) {
  if (!n) return null;
  return <span aria-label={`${n} جديدة`} className={cn("inline-flex min-w-5 items-center justify-center rounded-full bg-fg px-1.5 text-xs font-bold text-bg tabular-nums", className)}>{n > 99 ? "99+" : n}</span>;
}

/** يفتح لوحة الأوامر (Ctrl+K) من أي زر */
export const openPalette = () => window.dispatchEvent(new Event("rukn:palette"));

// ===== القائمة الجانبية (كمبيوتر): مجموعات بعناوين، وتنطوي لأيقونات بس =====
export function Sidebar({ items, collapsed: initial, storeCard, storeInitial, footer }: { items: NavItem[]; collapsed: boolean; storeCard: React.ReactNode; storeInitial: string; footer: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initial);
  const active = activeHref(pathname, items);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `rukn-sidebar=${next ? "collapsed" : "open"}; path=/dashboard; max-age=31536000; samesite=lax`;
  };
  const groups = [{ key: null, title: "" }, ...NAV_GROUPS].map((g) => ({ ...g, list: items.filter((i) => i.group === g.key) })).filter((g) => g.list.length);

  return (
    <aside aria-label="القائمة الجانبية" data-collapsed={collapsed || undefined} className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-line bg-surface transition-[width] duration-200 lg:flex", collapsed ? "w-[4.5rem]" : "w-64")}>
      <div className={cn("flex h-16 shrink-0 items-center border-b border-line", collapsed ? "justify-center" : "justify-between px-4")}>
        {collapsed ? <span aria-hidden className="flex size-9 items-center justify-center rounded-lg bg-fg font-heading text-sm font-bold text-bg">{storeInitial}</span> : storeCard}
      </div>
      <nav aria-label="التنقل الرئيسي" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {groups.map((g) => (
          <div key={g.key ?? "top"} className="space-y-0.5">
            {g.title && (collapsed ? <hr className="mx-2 my-2 border-line" /> : <p className="px-3 pb-1 text-xs font-semibold text-muted">{g.title}</p>)}
            {g.list.map((it) => {
              const Icon = NAV_ICONS[it.icon];
              const on = it.href === active;
              return (
                <Link
                  key={it.href} href={it.href} aria-current={on ? "page" : undefined} title={collapsed ? it.label : undefined}
                  className={cn("relative flex h-10 items-center gap-3 rounded-lg text-[15px] font-medium transition-colors", collapsed ? "justify-center" : "px-3", on ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/70 hover:text-fg")}
                >
                  {on && <span aria-hidden className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-fg" />}
                  <Icon className="size-5 shrink-0" aria-hidden />
                  <span className={cn("truncate", collapsed && "sr-only")}>{it.label}</span>
                  <CountBadge n={it.badge} className={collapsed ? "absolute -top-1 end-0 min-w-4 px-1 text-[10px]" : "ms-auto"} />
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className={cn("flex shrink-0 items-center gap-1 border-t border-line p-2", collapsed ? "flex-col" : "justify-between")}>
        {!collapsed && footer}
        <button type="button" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? "وسّع القائمة" : "صغّر القائمة"} className="flex size-10 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg">
          {collapsed ? <PanelRightOpen className="size-5" /> : <PanelRightClose className="size-5" />}
        </button>
      </div>
    </aside>
  );
}

// ===== الشريط السفلي (موبايل): 4 أزرار ثابتة + «القائمة» =====
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const shown = BOTTOM_NAV.map((k) => items.find((i) => i.icon === k)).filter((i): i is NavItem => !!i);
  const active = activeHref(pathname, items);
  const menuActive = pathname === MENU_HREF || (!!active && !shown.some((i) => i.href === active));
  const restBadge = items.filter((i) => !shown.includes(i)).reduce((s, i) => s + (i.badge ?? 0), 0);

  const tab = (href: string, on: boolean, Icon: LucideIcon, label: string, badge?: number) => (
    <li key={href} className="flex-1">
      <Link href={href} aria-current={on ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-center text-[11px] font-medium leading-tight transition-colors", on ? "text-fg" : "text-muted")}>
        <span className={cn("relative flex h-7 w-12 items-center justify-center rounded-full transition-colors", on && "bg-surface-2")}>
          <Icon className="size-5" aria-hidden />
          <CountBadge n={badge} className="absolute -top-1 end-1 min-w-4 px-1 text-[10px] leading-4" />
        </span>
        {label}
      </Link>
    </li>
  );

  return (
    <nav aria-label="التنقل السفلي" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="mx-auto flex max-w-md">
        {shown.map((it) => tab(it.href, it.href === active, NAV_ICONS[it.icon], it.label, it.badge))}
        {tab(MENU_HREF, menuActive, NAV_ICONS.menu, "القائمة", restBadge)}
      </ul>
    </nav>
  );
}

// ===== زر البحث (يفتح Ctrl+K) =====
export function SearchButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openPalette} aria-keyshortcuts="Control+K" className={cn("flex h-10 items-center gap-2 rounded-lg border border-line bg-bg px-3 text-sm text-muted transition-colors hover:border-fg/25 hover:text-fg", className)}>
      <Search className="size-4" aria-hidden />
      <span className="flex-1 text-start">ابحث عن منتج، طلبية، زبون…</span>
      <kbd dir="ltr" className="hidden rounded border border-line bg-surface px-1.5 font-sans text-[11px] lg:inline">Ctrl K</kbd>
    </button>
  );
}

// ===== آخر صفحات فتحتها (محفوظة في المتصفح) =====
const RECENT_KEY = "rukn-recent";
type Recent = { href: string; title: string };
const readRecent = (): Recent[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Recent[]; } catch { return []; } };
let recentCache: { raw: string | null; list: Recent[] } = { raw: null, list: [] };
const recentSnapshot = () => {
  let raw: string | null = null;
  try { raw = localStorage.getItem(RECENT_KEY); } catch {}
  if (raw !== recentCache.raw) recentCache = { raw, list: readRecent() };
  return recentCache.list;
};
const EMPTY: Recent[] = [];
const recentSubscribe = (cb: () => void) => { window.addEventListener("rukn:recent", cb); window.addEventListener("storage", cb); return () => { window.removeEventListener("rukn:recent", cb); window.removeEventListener("storage", cb); }; };
export const useRecent = () => useSyncExternalStore(recentSubscribe, recentSnapshot, () => EMPTY);

/** يسجّل كل صفحة يفتحها البياع (العنوان من document.title) */
export function RecentTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === MENU_HREF || pathname === "/dashboard") return;
    const id = setTimeout(() => {
      const title = document.title.replace(/\s*\|\s*رُكن$/, "").trim();
      if (!title) return;
      const next = [{ href: pathname, title }, ...readRecent().filter((r) => r.href !== pathname)].slice(0, 6);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
      window.dispatchEvent(new Event("rukn:recent"));
    }, 300); // ننتظر العنوان يتحدث بعد التنقل
    return () => clearTimeout(id);
  }, [pathname]);
  return null;
}
