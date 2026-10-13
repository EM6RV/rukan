"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { uploadImage, type UploadKind } from "@/lib/upload-client";

type Props = {
  label?: string;
  hint?: string;
  kind: UploadKind;
  value: { id: string; url: string } | null;
  onChange: (v: { id: string; url: string } | null) => void;
  shape?: "square" | "wide";
  className?: string;
  /** لإيصالات الأدمن: المتجر اللي الإيصال يتبعه */
  storeId?: string;
};

/** رفع صورة واحدة (لوجو، صورة قسم…) مع معاينة وحذف. */
export function ImageUploader({ label, hint, kind, value, onChange, shape = "square", className, storeId }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const up = await uploadImage(file, kind, { storeId });
      onChange({ id: up.id, url: up.url });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <span className="block text-sm font-medium">{label}</span>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={value ? "تغيير الصورة" : "رفع صورة"}
          className={cn(
            "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-surface-2 text-muted transition-colors hover:border-gold hover:text-fg",
            shape === "square" ? "size-24" : "h-24 w-40",
          )}
        >
          {value ? (
            <img src={value.url} alt="" className="size-full object-contain" />
          ) : busy ? null : (
            <ImagePlus className="size-7" />
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
              <Loader2 className="size-6 animate-spin" />
            </span>
          )}
        </button>
        <div className="space-y-1 text-sm">
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="font-medium text-link hover:underline disabled:opacity-50">
            {value ? "تغيير" : "رفع صورة"}
          </button>
          {value && (
            <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1 text-danger-fg hover:underline">
              <Trash2 className="size-3.5" /> حذف
            </button>
          )}
          {hint && <p className="text-muted">{hint}</p>}
        </div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
    </div>
  );
}
