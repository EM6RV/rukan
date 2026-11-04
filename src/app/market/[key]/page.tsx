import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { waLink } from "@/lib/whatsapp";
import { publicLine } from "@/server/public-line";
import { t } from "@/server/tenant";
import { activePromotionNames } from "./offers";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const p = await publicLine(getDb(), decodeURIComponent((await params).key), "market");
  return p ? { title: `${p.store.name} — العروض والأقسام`, description: `عروض وأقسام ${p.store.name}.` } : { title: "غير موجود", robots: { index: false } };
}

export default async function MarketPublic({ params }: { params: Promise<{ key: string }> }) {
  const p = await publicLine(getDb(), decodeURIComponent((await params).key), "market");
  if (!p) notFound();
  const [offers, cats] = await Promise.all([activePromotionNames(p.scope), p.scope.from(t.categories, undefined).then((r) => r.filter((c) => c.isVisible))]);
  const wa = p.contact.whatsapp;
  return (
    <div dir="rtl" className="min-h-dvh bg-bg text-fg">
      <header className="bg-navy px-4 py-10 text-center text-white"><h1 className="text-3xl text-white">{p.store.name}</h1>{p.contact.address && <p className="mt-1 text-white/80">{p.contact.address}</p>}</header>
      <main className="mx-auto max-w-3xl space-y-10 px-4 py-10">
        <section><h2 className="mb-3 text-2xl">العروض الحالية</h2>{offers.length ? <ul className="grid gap-3 sm:grid-cols-2">{offers.map((o) => <li key={o} className="rounded-2xl border border-gold/50 bg-gold/10 p-4 font-semibold">{o}</li>)}</ul> : <p className="text-muted">ما فيش عروض الحين.</p>}</section>
        {cats.length > 0 && <section><h2 className="mb-3 text-2xl">الأقسام</h2><p className="flex flex-wrap gap-2">{cats.map((c) => <span key={c.id} className="rounded-full border border-line bg-surface px-4 py-1.5">{c.name}</span>)}</p></section>}
        <p className="flex flex-wrap justify-center gap-3">
          <Link href={`/s/${encodeURIComponent(p.store.slug)}`} className="inline-flex h-11 items-center rounded-md border border-line px-6 font-semibold hover:border-gold">تسوّق أونلاين</Link>
          {wa && <a href={waLink(wa, `السلام عليكم، استفسار عن ${p.store.name}.`)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-md bg-[#25D366] px-6 font-semibold text-navy">واتساب</a>}
        </p>
        {p.contact.phone && <p className="text-center text-muted" dir="ltr">{p.contact.phone}</p>}
      </main>
    </div>
  );
}
