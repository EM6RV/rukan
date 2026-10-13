"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, FolderTree, LayoutDashboard, MoreHorizontal, Package, Palette, PenLine, RotateCcw, Settings, ShoppingBag, Ticket, Truck, UserCog, Users, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; icon: "home" | "orders" | "products" | "categories" | "customers" | "couriers" | "returns" | "coupons" | "reports" | "content" | "design" | "staff" | "settings"; badge?: number };

const ICONS: Record<NavItem["icon"], LucideIcon> = {
  home: LayoutDashboard, orders: ShoppingBag, products: Package, categories: FolderTree, customers: Users, couriers: Truck, returns: RotateCcw, coupons: Ticket, reports: BarChart3, content: PenLine, design: Palette, staff: UserCog, settings: Settings,
};

const isActive = (pathname: string, href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return <span aria-label={`${n} جديدة`} className="ms-auto inline-flex min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-xs font-bold text-navy">{n > 99 ? "99+" : n}</span>;
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1" aria-label="التنقل الرئيسي">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = isActive(pathname, it.href);
        return (
          <Link
            key={it.href} href={it.href} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-medium transition-colors", active ? "bg-gold/20 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg")}
          >
            <Icon className="size-5" aria-hidden />
            {it.label}
            <Badge n={it.badge} />
          </Link>
        );
      })}
    </nav>
  );
}

const BOTTOM_VISIBLE = 4; // لو العناصر أكثر من 5: 3 + «المزيد»

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const overflow = items.length > BOTTOM_VISIBLE + 1;
  const shown = overflow ? items.slice(0, BOTTOM_VISIBLE - 1) : items;
  const rest = overflow ? items.slice(BOTTOM_VISIBLE - 1) : [];
  const restActive = rest.some((it) => isActive(pathname, it.href));
  const restBadge = rest.reduce((s, it) => s + (it.badge ?? 0), 0);

  const tab = (active: boolean, icon: React.ReactNode, label: string, badge?: number) => (
    <>
      <span className={cn("relative flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-gold/25")}>
        {icon}
        {!!badge && <span aria-label={`${badge} جديدة`} className="absolute -top-1 end-1 min-w-4 rounded-full bg-gold px-1 text-center text-[10px] font-bold leading-4 text-navy">{badge > 99 ? "99+" : badge}</span>}
      </span>
      {label}
    </>
  );

  return (
    <>
      <nav aria-label="التنقل الرئيسي" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto flex max-w-md">
          {shown.map((it) => {
            const Icon = ICONS[it.icon];
            const active = isActive(pathname, it.href);
            return (
              <li key={it.href} className="flex-1">
                <Link href={it.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-xs font-medium", active ? "text-fg" : "text-muted")}>
                  {tab(active, <Icon className="size-5" aria-hidden />, it.label, it.badge)}
                </Link>
              </li>
            );
          })}
          {overflow && (
            <li className="flex-1">
              <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" className={cn("flex w-full flex-col items-center gap-0.5 py-2 text-xs font-medium", restActive ? "text-fg" : "text-muted")}>
                {tab(restActive, <MoreHorizontal className="size-5" aria-hidden />, "المزيد", restBadge)}
              </button>
            </li>
          )}
        </ul>
      </nav>
      {overflow && (
        <Modal open={more} onClose={() => setMore(false)} title="المزيد">
          <ul className="grid grid-cols-2 gap-3">
            {rest.map((it) => {
              const Icon = ICONS[it.icon];
              return (
                <li key={it.href}>
                  <Link href={it.href} onClick={() => setMore(false)} aria-current={isActive(pathname, it.href) ? "page" : undefined} className={cn("flex items-center gap-3 rounded-lg border border-line p-3 font-medium", isActive(pathname, it.href) && "border-gold bg-gold/15")}>
                    <Icon className="size-5" aria-hidden />{it.label}<Badge n={it.badge} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}
    </>
  );
}
