import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "لوحة الأدمن" };

export default function AdminHome() {
  return <EmptyState icon={<ShieldCheck className="size-6" />} title="لوحة أدمن المنصة" description="المتاجر والاشتراكات والإحصائيات تجي في المرحلة 6." />;
}
