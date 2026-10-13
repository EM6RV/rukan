"use client";

import { Copy, ExternalLink, MessageCircle } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { whatsappShareUrl } from "@/lib/store-url";

export function StoreLinkCard({ url, name }: { url: string; name: string }) {
  const { toast } = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("تم نسخ الرابط");
    } catch {
      toast("ما قدرنا ننسخ الرابط. انسخه بإيدك.", "error");
    }
  }
  const btn = "inline-flex h-9 pointer-coarse:h-11 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-medium transition-colors hover:bg-surface-2";
  return (
    <div className="space-y-3">
      <div dir="ltr" className="truncate rounded-md bg-surface-2 px-3 py-2.5 text-sm font-medium">{url}</div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={btn}><Copy className="size-4" /> نسخ</button>
        <a href={url} target="_blank" rel="noopener noreferrer" className={btn}><ExternalLink className="size-4" /> فتح المتجر</a>
        <a href={whatsappShareUrl(`تسوّق من ${name} 🛍️\n${url}`)} target="_blank" rel="noopener noreferrer" className={btn}><MessageCircle className="size-4" /> شارك</a>
      </div>
    </div>
  );
}
