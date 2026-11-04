import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { portalCookie, portalMember, portalStore, portalView } from "@/server/gym/portal";
import { Portal } from "./portal";

export const metadata: Metadata = { title: "صفحتي في النادي", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const s = await portalStore(getDb(), decodeURIComponent(key));
  if (!s) notFound();
  const m = await portalMember(s.scope, (await cookies()).get(portalCookie(s.store.slug))?.value);
  const view = m ? await portalView(s.scope, m.id) : null;
  return <Portal slug={s.store.slug} shop={s.store.name} view={view} />;
}
