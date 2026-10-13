import type { Metadata } from "next";
import { StorePreview } from "@/components/dashboard/store-preview";
import type { InitialSection } from "@/components/dashboard/sections-editor";
import { listHomeSections, listPages } from "@/server/content-service";
import { requireStoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { ContentTabs } from "./content-tabs";

export const metadata: Metadata = { title: "محتوى المتجر" };

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const ctx = await requireStoreContext("settings");
  const [sections, pages, [s]] = await Promise.all([listHomeSections(ctx.scope), listPages(ctx.scope), ctx.scope.from(t.storeSettings).limit(1)]);
  const initial: InitialSection[] = sections.map((x) => ({
    ...x, image: typeof x.config.imageMediaId === "string" ? { id: x.config.imageMediaId, url: `/api/media/${x.config.imageMediaId}?w=320` } : null,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl">محتوى المتجر</h1><p className="text-muted">كل نص وصورة في متجرك تتعدل من هنا، من غير ما تحتاج كود.</p></div>
        <StorePreview slug={ctx.store.slug} mode="button" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <ContentTabs
          writable={ctx.access.writable} defaultTab={["home", "pages", "texts"].includes(tab ?? "") ? tab! : "home"} sections={initial} pages={pages}
          texts={{ announcementBar: s?.announcementBar ?? "", thanksMessage: s?.thanksMessage ?? "", footerText: s?.footerText ?? "" }}
        />
        <StorePreview slug={ctx.store.slug} mode="aside" />
      </div>
    </div>
  );
}
