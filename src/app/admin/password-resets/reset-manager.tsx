"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { enterDelay, enterItem } from "@/components/ui/motion";
import { formatDateTimeYear } from "@/lib/datetime";
import type { ResetRequestRow } from "@/server/auth/password-reset";
import { dismissResetAction, issueResetLinkAction } from "../actions";

type Issued = { url: string; whatsappUrl: string | null; expiresAt: number; name: string };

export function ResetManager({ rows }: { rows: ResetRequestRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [issued, setIssued] = useState<Issued | null>(null);

  function issue(row: ResetRequestRow) {
    start(async () => {
      let r: Awaited<ReturnType<typeof issueResetLinkAction>>;
      try { r = await issueResetLinkAction(row.id); } catch { return toast("ما قدرنا نوصل للسيرفر. تأكد من الإنترنت وجرّب مرة ثانية.", "error"); }
      if (!r.ok) return toast(r.error, "error");
      setIssued({ ...r.data, name: row.user.name });
      router.refresh();
    });
  }
  function dismiss(row: ResetRequestRow) {
    start(async () => {
      let r: Awaited<ReturnType<typeof dismissResetAction>>;
      try { r = await dismissResetAction(row.id); } catch { return toast("ما قدرنا نوصل للسيرفر. تأكد من الإنترنت وجرّب مرة ثانية.", "error"); }
      if (!r.ok) return toast(r.error, "error");
      toast("تم تجاهل الطلب");
      router.refresh();
    });
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast("تم نسخ الرابط"); } catch { toast("ما قدرنا ننسخ الرابط. انسخه بإيدك.", "error"); }
  }

  return (
    <>
      <ul className="space-y-3">
        {rows.map((row, i) => (
          <li key={row.id} style={enterDelay(i)} className={enterItem}>
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">{row.user.name} <Badge tone={row.status === "pending" ? "gold" : "teal"}>{row.status === "pending" ? "بانتظار الرابط" : "رابط مُصدر"}</Badge></p>
                <p className="text-sm text-muted"><bdi dir="ltr">{row.user.phone}</bdi>{row.stores.length > 0 && ` · ${row.stores.join("، ")}`}</p>
                <p className="text-xs text-muted">{formatDateTimeYear(row.createdAt)}{row.expiresAt ? ` · ينتهي ${formatDateTimeYear(row.expiresAt)}` : ""}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" loading={pending} onClick={() => issue(row)}>{row.status === "issued" ? "إصدار رابط جديد" : "جهّز الرابط"}</Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => dismiss(row)}>تجاهل</Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <Modal open={!!issued} onClose={() => setIssued(null)} title={`رابط استرجاع ${issued?.name ?? ""}`} footer={<Button variant="ghost" onClick={() => setIssued(null)}>إغلاق</Button>}>
        {issued && (
          <div className="space-y-4">
            <p className="text-sm leading-7 text-muted">الرابط يظهر هنا مرة وحدة. ابعثه للبياع على واتساب. صالح لين {formatDateTimeYear(issued.expiresAt)} ولمرة وحدة.</p>
            <p dir="ltr" className="break-all rounded-md bg-surface-2 px-3 py-2 text-left text-sm">{issued.url}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => copy(issued.url)}><Copy className="size-4" aria-hidden /> نسخ الرابط</Button>
              {issued.whatsappUrl && (
                <a href={issued.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-md bg-gold px-5 font-semibold text-navy hover:brightness-95"><MessageCircle className="size-4" aria-hidden /> ابعثه على واتساب</a>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
