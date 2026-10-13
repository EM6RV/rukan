import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { requireAdmin } from "@/server/auth/current";
import { logoutAction } from "../(auth)/actions";

export const metadata: Metadata = { title: { template: "%s | رُكن", default: "لوحة الأدمن | رُكن" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" aria-label="الأدمن"><Logo className="h-9" /></Link>
            <Badge tone="gold"><ShieldCheck className="size-3.5" /> الأدمن</Badge>
          </div>
          <div className="flex items-center gap-1">
            <span className="hidden text-sm text-muted sm:inline">{user.name}</span>
            <Link href="/dashboard" className="rounded-md px-2.5 py-1.5 text-sm text-link hover:bg-surface-2">لوحة المتجر</Link>
            <ThemeToggle />
            <form action={logoutAction}><button aria-label="تسجيل الخروج" className="flex size-10 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"><LogOut className="size-5" /></button></form>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:py-8">
        <aside className="lg:sticky lg:top-24 lg:self-start"><AdminNav /></aside>
        <main className="min-w-0 space-y-5">{children}</main>
      </div>
    </div>
  );
}
