"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderTree, LayoutDashboard, Package, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; icon: "home" | "products" | "categories" | "settings" };

const ICONS: Record<NavItem["icon"], LucideIcon> = {
  home: LayoutDashboard, products: Package, categories: FolderTree, settings: Settings,
};

const isActive = (pathname: string, href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

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
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="التنقل الرئيسي" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto flex max-w-md">
        {items.map((it) => {
          const Icon = ICONS[it.icon];
          const active = isActive(pathname, it.href);
          return (
            <li key={it.href} className="flex-1">
              <Link href={it.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-xs font-medium", active ? "text-fg" : "text-muted")}>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-gold/25")}><Icon className="size-5" aria-hidden /></span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
