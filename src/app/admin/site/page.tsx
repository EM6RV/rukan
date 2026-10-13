import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { getDb } from "@/db";
import { getSiteContent } from "@/server/admin/site-content";
import { SiteEditor } from "./site-editor";

export const metadata: Metadata = { title: "محتوى موقع رُكن" };

export default async function AdminSite() {
  const content = await getSiteContent(getDb());
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl">محتوى موقع رُكن</h1><p className="text-muted">كل نص وصورة في الصفحة الرئيسية للمنصة. الأسعار تتسحب تلقائياً من «الباقات».</p></div>
        <a href="/" target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium hover:bg-surface-2"><ExternalLink className="size-4" aria-hidden /> فتح الموقع</a>
      </div>
      <SiteEditor key={JSON.stringify(content)} initial={content} heroImage={content.hero.imageMediaId ? { id: content.hero.imageMediaId, url: `/api/media/${content.hero.imageMediaId}?w=320` } : null} />
    </>
  );
}
