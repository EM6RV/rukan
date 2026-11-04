import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { Logo } from "@/components/brand/logo";
import { getDb } from "@/db";
import { cities } from "@/db/schema/platform";
import { getEnv } from "@/lib/env";
import { storeUrl } from "@/lib/store-url";
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants";
import { requireUser } from "@/server/auth/current";
import { getPlatformSetting } from "@/server/platform-settings";
import { loadStoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { Wizard } from "./wizard";

export const metadata: Metadata = { title: "إعداد متجرك" };

export default async function OnboardingPage() {
  await requireUser();
  const ctx = await loadStoreContext();
  if (ctx?.store.onboardedAt) redirect("/dashboard");

  const db = getDb();
  const env = getEnv();
  const cityRows = await db.select().from(cities).orderBy(asc(cities.sortOrder));
  const settings = ctx ? (await ctx.scope.from(t.storeSettings).limit(1))[0] : undefined;
  const trialDays = await getPlatformSetting<number>(db, "trial_days", DEFAULT_TRIAL_DAYS);
  const logoId = ctx?.store.logoMediaId;

  return (
    <div data-theme="light" className="min-h-dvh bg-bg">
      <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
        <div className="flex justify-center"><Logo className="h-12" /></div>
        <Wizard
          initialStep={ctx ? Math.min(6, Math.max(2, ctx.store.onboardingStep + 1)) : 2}
          name={ctx?.store.name ?? ""}
          slug={ctx?.store.slug ?? ""}
          businessType={ctx && ctx.store.onboardingStep >= 3 ? ctx.store.businessType : null}
          template={ctx?.store.template ?? "simple"}
          primary={settings?.primaryColor ?? "#0D263E"}
          accent={settings?.accentColor ?? "#C19E58"}
          logo={logoId ? { id: logoId, url: `/api/media/${logoId}` } : null}
          cityId={settings?.cityId ?? ""}
          cities={cityRows.map((c) => ({ id: c.id, name: c.nameAr }))}
          allTemplates={ctx?.limits.allTemplates ?? true}
          urlPattern={storeUrl("{slug}", env)}
          rootDomainLabel={env.ROOT_DOMAIN}
          trialDays={trialDays}
        />
      </main>
    </div>
  );
}
