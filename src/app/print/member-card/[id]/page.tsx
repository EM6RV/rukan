import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BarcodeSvg } from "@/components/barcode-svg";
import { requireLineContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { eq } from "drizzle-orm";
import { PrintButton } from "../../orders/[id]/print-button";

export const metadata: Metadata = { title: "بطاقة العضو", robots: { index: false } };

export default async function MemberCard({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLineContext("gym", "customers");
  const [m] = await ctx.scope.from(t.gymMembers, eq(t.gymMembers.id, (await params).id)).limit(1);
  if (!m) notFound();
  return (
    <div dir="rtl" className="min-h-dvh bg-white p-4 text-black" style={{ colorScheme: "light" }}>
      <div className="mb-4 print:hidden"><PrintButton /></div>
      <div className="mx-auto w-[85.6mm] rounded-xl border-2 border-black p-4 text-center" style={{ height: "54mm" }}>
        <p className="text-lg font-bold">{ctx.store.name}</p>
        <p className="mt-1 text-base">{m.name}</p>
        <BarcodeSvg code={m.qrToken} height={44} className="mx-auto mt-2 h-16 w-full" />
        <p className="mt-1 break-all text-[8px]" dir="ltr">{m.qrToken}</p>
      </div>
    </div>
  );
}
