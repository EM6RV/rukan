import type { Metadata } from "next";
import Link from "next/link";
import { isNull } from "drizzle-orm";
import { CheckCircle2, Circle, FolderTree, Package } from "lucide-react";
import { StoreLinkCard } from "@/components/dashboard/copy-link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getEnv } from "@/lib/env";
import { storeUrl } from "@/lib/store-url";
import { requireStoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";

export const metadata: Metadata = { title: "الرئيسية" };

export default async function DashboardHome() {
  const ctx = await requireStoreContext("dashboard");
  const { scope, store, limits } = ctx;

  const [productCount, categoryCount, [settings]] = await Promise.all([
    scope.count(t.products, isNull(t.products.deletedAt)),
    scope.count(t.categories),
    scope.from(t.storeSettings).limit(1),
  ]);

  const checklist = [
    { done: !!store.logoMediaId, label: "ارفع لوجو متجرك", href: "/dashboard/settings" },
    { done: categoryCount > 0, label: "أضف أول قسم", href: "/dashboard/categories" },
    { done: productCount > 0, label: "أضف أول منتج", href: "/dashboard/products/new" },
    { done: !!settings?.whatsapp, label: "حط رقم واتساب للتواصل", href: "/dashboard/settings?tab=contact" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">أهلاً {ctx.user.name} 👋</h1>
        <p className="text-muted">هذي لمحة سريعة عن متجرك «{store.name}».</p>
      </div>

      <Card>
        <CardHeader title="رابط متجرك" description="شاركه في إنستغرام وتيك توك وواتساب." />
        <CardBody><StoreLinkCard url={storeUrl(store.slug, getEnv())} name={store.name} /></CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat href="/dashboard/products" icon={<Package className="size-5" />} label="المنتجات" value={productCount} limit={limits.maxProducts} />
        <Stat href="/dashboard/categories" icon={<FolderTree className="size-5" />} label="الأقسام" value={categoryCount} />
      </div>

      {doneCount < checklist.length && (
        <Card>
          <CardHeader title="ابدا من هنا" description={`${doneCount} من ${checklist.length} خلصت`} />
          <CardBody className="space-y-1 p-2">
            <div className="mx-3 mb-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gold transition-all" style={{ width: `${(doneCount / checklist.length) * 100}%` }} /></div>
            {checklist.map((c) => (
              <Link key={c.label} href={c.href} className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2">
                {c.done ? <CheckCircle2 className="size-5 text-success-fg" /> : <Circle className="size-5 text-muted" />}
                <span className={c.done ? "text-muted line-through" : "font-medium"}>{c.label}</span>
              </Link>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Stat({ href, icon, label, value, limit }: { href: string; icon: React.ReactNode; label: string; value: number; limit?: number | null }) {
  return (
    <Link href={href}>
      <Card className="flex items-center gap-4 p-5 transition-shadow hover:shadow-lift">
        <div className="flex size-11 items-center justify-center rounded-lg bg-gold/20">{icon}</div>
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="text-2xl font-bold">{value}{limit ? <span className="text-sm font-normal text-muted"> / {limit}</span> : null}</p>
        </div>
      </Card>
    </Link>
  );
}
