import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireLineContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { formatDate } from "@/lib/datetime";
import { PrintButton } from "../../orders/[id]/print-button";

export const metadata: Metadata = { title: "برنامج العضو", robots: { index: false } };

export default async function ProgramPrint({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLineContext("gym", "customers");
  const [p] = await ctx.scope.from(t.gymPrograms, eq(t.gymPrograms.id, (await params).id)).limit(1);
  if (!p) notFound();
  const [m] = await ctx.scope.from(t.gymMembers, eq(t.gymMembers.id, p.memberId)).limit(1);
  return (
    <div dir="rtl" className="min-h-dvh bg-white p-6 text-black" style={{ colorScheme: "light" }}>
      <div className="mb-4 print:hidden"><PrintButton /></div>
      <div className="mx-auto max-w-[44rem]">
        <p className="text-sm text-neutral-600">{ctx.store.name} · {formatDate(p.createdAt.getTime())}</p>
        <h1 className="mt-1 text-2xl font-bold">{p.title}</h1>
        <p className="text-neutral-700">{m?.name}</p>
        <pre className="mt-4 whitespace-pre-wrap font-[inherit] text-base leading-8">{p.content}</pre>
      </div>
    </div>
  );
}
