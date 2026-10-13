"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CreditCard, Globe, KeyRound, LayoutDashboard, Layers, ScrollText, Settings, Store, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin", label: "نظرة عامة", icon: LayoutDashboard },
  { href: "/admin/stores", label: "المتاجر", icon: Store },
  { href: "/admin/payments", label: "الاشتراكات والدفعات", icon: CreditCard },
  { href: "/admin/plans", label: "الباقات", icon: Layers },
  { href: "/admin/announcements", label: "الإعلانات", icon: Bell },
  { href: "/admin/site", label: "موقع رُكن", icon: Globe },
  { href: "/admin/password-resets", label: "طلبات كلمة السر", icon: KeyRound },
  { href: "/admin/audit", label: "سجل النشاط", icon: ScrollText },
  { href: "/admin/settings", label: "الإعدادات", icon: Settings },
];

const active = (path: string, href: string) => (href === "/admin" ? path === href : path.startsWith(href));

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="تنقل الأدمن" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={active(path, href) ? "page" : undefined}
          className={cn("flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors lg:text-[15px]", active(path, href) ? "bg-gold/20 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg")}>
          <Icon className="size-4.5" aria-hidden />{label}
        </Link>
      ))}
    </nav>
  );
}
