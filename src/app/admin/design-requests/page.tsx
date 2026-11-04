import type { Metadata } from "next";
import Link from "next/link";
import { Brush, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { getDb } from "@/db";
import { DESIGN_SERVICE_LABELS } from "@/lib/constants";
import { formatDateTimeYear } from "@/lib/datetime";
import { toWhatsappNumber } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import { listDesignRequests } from "@/server/design-services";

export const metadata: Metadata = { title: "طلبات التصميم" };
export const dynamic = "force-dynamic";

export default async function DesignRequestsPage() {
  const rows = await listDesignRequests(getDb());
  return (
    <>
      <div><h1 className="text-2xl">طلبات التصميم</h1><p className="text-muted">كل طلب ريل أو لوجو أو هوية من البياعين. التفاصيل والملفات تجيك على واتساب، وهنا السجل ومعرفة مين استعمل تصميمه المجاني.</p></div>
      {rows.length === 0 ? (
        <EmptyState icon={<Brush className="size-6" />} title="ما فيش طلبات تصميم" description="لما بياع يطلب تصميم من لوحته يظهر هنا." />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const wa = r.ownerPhone ? toWhatsappNumber(r.ownerPhone) : null;
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 text-sm">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      <Link href={`/admin/stores?q=${encodeURIComponent(r.storeSlug)}`} className="text-link hover:underline">{r.storeName}</Link>
                      <Badge tone="teal">{DESIGN_SERVICE_LABELS[r.service]}</Badge>
                      {r.isFree && <Badge tone="gold">مجاني ضمن الباقة</Badge>}
                    </p>
                    {r.note && <p className="max-w-prose whitespace-pre-line text-muted">{r.note}</p>}
                    <p className="text-xs text-muted">{formatDateTimeYear(r.createdAt)}</p>
                  </div>
                  {wa && <a href={waLink(wa, `السلام عليكم، بخصوص طلب التصميم (${DESIGN_SERVICE_LABELS[r.service]}) لمتجر «${r.storeName}».`)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 font-medium hover:bg-surface-2"><MessageCircle className="size-4" aria-hidden /> كلّم البياع</a>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
