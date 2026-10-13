import type { Metadata } from "next";
import { Store } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { requireUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "لوحة التحكم" };

export default async function DashboardHome() {
  const user = await requireUser();
  // معالج إنشاء المتجر (onboarding) ولوحة البياع الكاملة في المرحلة 2.
  return (
    <div className="space-y-6">
      <h1 className="text-2xl">أهلاً {user.name} 👋</h1>
      <EmptyState icon={<Store className="size-6" />} title="لسا ما عندكش متجر" description="معالج إنشاء المتجر يجي في المرحلة القادمة. حسابك جاهز." />
    </div>
  );
}
