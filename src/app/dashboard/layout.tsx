import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { requireUser } from "@/server/auth/current";
import { logoutAction } from "../(auth)/actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/dashboard" aria-label="لوحة التحكم"><Logo className="h-9" /></Link>
          <div className="flex items-center gap-1">
            <span className="hidden text-sm text-muted sm:inline">{user.name}</span>
            <ThemeToggle />
            <form action={logoutAction}>
              <button aria-label="تسجيل الخروج" className="flex size-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg">
                <LogOut className="size-5" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
