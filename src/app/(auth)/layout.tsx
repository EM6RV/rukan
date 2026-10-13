import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { getCurrentUser } from "@/server/auth/current";

export const metadata: Metadata = { title: { template: "%s | رُكن", default: "رُكن" } };

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div data-theme="light" className="min-h-dvh bg-bg">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
        <Link href="/" className="mx-auto" aria-label="رُكن">
          <Logo className="h-14" />
        </Link>
        {children}
      </main>
    </div>
  );
}
