import { Lock, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { getDb } from "@/db";
import { cheapestPlanWith, FEATURE_INFO, type Feature } from "@/lib/entitlements";
import { getPlatformConfig } from "@/server/admin/settings";
import { publicPlans } from "@/server/admin/plans";

/** صفحة ميزة مقفولة بالباقة: اسمها وفايدتها والباقة اللي فيها وزر «رقّي باقتك» (بدل ما الصفحة تختفي) */
export async function LockedPage({ feature, title }: { feature: Feature; title?: string }) {
  const db = getDb();
  const config = await getPlatformConfig(db);
  const plan = cheapestPlanWith((await publicPlans(db, config.freePlanEnabled)).map((p) => ({ ...p, nameAr: p.name })), feature);
  const info = FEATURE_INFO[feature];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl">{title ?? info.title}</h1>
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-surface-2"><Lock className="size-6" aria-hidden /></div>
        <h2 className="text-lg">{info.title} مش في باقتك</h2>
        <p className="max-w-sm leading-7 text-muted">{info.benefit}</p>
        {plan && <p className="text-sm">متاحة في باقة <strong>{plan.name}</strong>{plan.slug !== "pro" ? " وأعلى" : ""}.</p>}
        <ButtonLink href="/dashboard/billing"><Sparkles className="size-4" aria-hidden /> رقّي باقتك</ButtonLink>
      </div>
    </div>
  );
}
