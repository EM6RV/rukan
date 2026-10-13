import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { getStoreByKey, isStorePublic } from "@/server/stores";

export default async function StoreHome({ params }: { params: Promise<{ key: string }> }) {
  const found = await getStoreByKey((await params).key);
  if (!found) notFound();
  const { store, settings } = found;

  if (!isStorePublic(store.status)) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
        <EmptyState icon={<Store className="size-6" />} title="هذا المتجر غير متاح حالياً" description="رجّع زيارتنا قريب بإذن الله." className="w-full" />
      </main>
    );
  }

  // واجهة المتجر الحقيقية (القوالب الثلاثة) تتبنى في المرحلة 3. هذي صفحة مؤقتة تثبت التوجيه وألوان البياع.
  return (
    <main>
      <header className="px-4 py-5 text-center text-white" style={{ background: settings?.primaryColor ?? "#0D263E" }}>
        <h1 className="text-2xl">{store.name}</h1>
      </header>
      <section className="mx-auto max-w-md px-4 py-16">
        <EmptyState icon={<Store className="size-6" />} title="المتجر قيد التجهيز" description="المنتجات تنضاف قريب. ابقى قريب!" />
      </section>
    </main>
  );
}
