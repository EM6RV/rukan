import { canUse } from "@/lib/entitlements";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { Logo } from "@/components/brand/logo";
import { getDb } from "@/db";
import { cities } from "@/db/schema/platform";
import { getEnv } from "@/lib/env";
import { storeUrl } from "@/lib/store-url";
import { currentRequest } from "@/server/request-origin";
import { PRODUCT_LINES, type ProductLine } from "@/lib/product-lines";
import { requireUser } from "@/server/auth/current";
import { availableLines, lineLaunch, lineSetups, lineTrialDays, subscribedLines } from "@/server/lines";
import { loadStoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { Wizard, type StepId } from "./wizard";

export const metadata: Metadata = { title: "إعداد نشاطك" };

export default async function OnboardingPage() {
  await requireUser();
  const ctx = await loadStoreContext();
  if (ctx?.store.onboardedAt) redirect("/dashboard");

  const db = getDb();
  const env = getEnv();
  const cityRows = await db.select().from(cities).orderBy(asc(cities.sortOrder));
  const settings = ctx ? (await ctx.scope.from(t.storeSettings).limit(1))[0] : undefined;
  const logoId = ctx?.store.logoMediaId;
  const available = availableLines(await lineLaunch(db), ctx?.store.lineBeta ?? []);
  const chosen = ctx ? subscribedLines(ctx.lines) : [];
  const setups = ctx ? await lineSetups(db, ctx.store.id) : {};
  const trialDays = Object.fromEntries(await Promise.all(PRODUCT_LINES.map(async (l) => [l, ctx?.lines[l].subscribed ? Math.max(0, ctx.lines[l].daysLeft ?? 0) : await lineTrialDays(db, l)] as const))) as Record<ProductLine, number>;

  // أول خطوة ما خلصتش: الاسم ← (المتجر: النوع/الهوية/التوصيل) ← المعالج القصير لكل منظومة ← جاهز
  let initialStep: StepId = available.length > 1 ? "lines" : "basics";
  if (ctx) {
    const step = ctx.store.onboardingStep;
    const pendingOps = chosen.find((l) => l !== "store" && !setups[l]?.done) as StepId | undefined;
    initialStep = chosen.includes("store") && step < 3 ? "type" : chosen.includes("store") && step < 4 ? "identity" : chosen.includes("store") && step < 5 ? "delivery" : pendingOps ?? "done";
  }

  const req = await currentRequest();
  return (
    <div data-theme="light" className="min-h-dvh bg-bg">
      <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
        <div className="flex justify-center"><Logo className="h-12" /></div>
        <Wizard
          initialStep={initialStep}
          available={available}
          lines={chosen.length ? chosen : available.length === 1 ? available : []}
          setups={setups}
          name={ctx?.store.name ?? ""}
          slug={ctx?.store.slug ?? ""}
          businessType={ctx && ctx.store.onboardingStep >= 3 && ctx.lines.store.subscribed ? ctx.store.businessType : null}
          template={ctx?.store.template ?? "naqa"}
          primary={settings?.primaryColor ?? "#0D263E"}
          accent={settings?.accentColor ?? "#C19E58"}
          logo={logoId ? { id: logoId, url: `/api/media/${logoId}` } : null}
          cityId={settings?.cityId ?? ""}
          cities={cityRows.map((c) => ({ id: c.id, name: c.nameAr }))}
          allTemplates={ctx ? canUse(ctx.limits, "allTemplates") : true}
          urlPattern={storeUrl("{slug}", env, req)}
          rootDomainLabel={env.ROOT_DOMAIN}
          trialDays={trialDays}
        />
      </main>
    </div>
  );
}
