import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreByKey } from "@/server/stores";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const found = await getStoreByKey((await params).key);
  if (!found) return { title: { absolute: "متجر غير موجود" } };
  return {
    // absolute: عنوان المتجر ما يتأثر بقالب "| رُكن" الخاص بالمنصة
    title: { absolute: found.settings?.seoTitle || found.store.name },
    description: found.settings?.seoDescription ?? undefined,
  };
}

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ key: string }> }) {
  const found = await getStoreByKey((await params).key);
  if (!found) notFound();
  // واجهات المتاجر فاتحة دايماً (الوضع الداكن للوحات التحكم فقط)
  return <div data-theme="light" className="min-h-dvh bg-bg text-fg">{children}</div>;
}
