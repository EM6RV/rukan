import { canUse } from "@/lib/entitlements";
import type { Metadata } from "next";
import { StorePreview } from "@/components/dashboard/store-preview";
import type { InitialSection } from "@/components/dashboard/sections-editor";
import { isStoreFont } from "@/lib/store-fonts";
import { listHomeSections } from "@/server/content-service";
import { requireStoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { DesignTabs } from "./design-tabs";

export const metadata: Metadata = { title: "التصميم" };

export default async function DesignPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const ctx = await requireStoreContext("settings");
  const [sections, [s]] = await Promise.all([listHomeSections(ctx.scope), ctx.scope.from(t.storeSettings).limit(1)]);
  const initial: InitialSection[] = sections.map((x) => ({
    ...x, image: typeof x.config.imageMediaId === "string" ? { id: x.config.imageMediaId, url: `/api/media/${x.config.imageMediaId}?w=320` } : null,
  }));
  const font = s?.fontKey ?? "ibm-plex";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl">التصميم</h1><p className="text-muted">غيّر القالب والألوان والخط ورتّب أقسام الصفحة الرئيسية. المعاينة تتحدث بعد كل حفظ.</p></div>
        <StorePreview slug={ctx.store.slug} mode="button" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <DesignTabs
          writable={ctx.access.writable} allTemplates={canUse(ctx.limits, "allTemplates")} defaultTab={tab === "home" ? "home" : "identity"} sections={initial}
          design={{ template: ctx.store.template, primary: s?.primaryColor ?? "#0D263E", accent: s?.accentColor ?? "#C19E58", fontKey: isStoreFont(font) ? font : "ibm-plex", logo: ctx.store.logoMediaId ? { id: ctx.store.logoMediaId, url: `/api/media/${ctx.store.logoMediaId}?w=320` } : null }}
        />
        <StorePreview slug={ctx.store.slug} mode="aside" />
      </div>
    </div>
  );
}
