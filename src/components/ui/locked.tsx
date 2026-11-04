"use client";

import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { ButtonLink } from "./button";
import { Modal } from "./modal";
import { cn } from "@/lib/cn";

export type LockedInfo = { title: string; benefit: string; planName?: string | null };

/** نافذة «الميزة مش في باقتك»: اسمها، فايدتها، الباقة اللي فيها، وزر الترقية */
export function UpgradeDialog({ open, onClose, info, upgradeHref = "/dashboard/billing" }: { open: boolean; onClose: () => void; info: LockedInfo; upgradeHref?: string }) {
  return (
    <Modal open={open} onClose={onClose} title={info.title}>
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-surface-2 text-fg"><Lock className="size-6" aria-hidden /></div>
        <p className="leading-7">{info.benefit}</p>
        <p className="text-sm text-muted">{info.planName ? <>متاحة في باقة <strong className="text-fg">{info.planName}</strong>.</> : "مش متاحة في باقتك الحالية."}</p>
        <ButtonLink href={upgradeHref} fullWidth><Sparkles className="size-4" aria-hidden /> رقّي باقتك</ButtonLink>
      </div>
    </Modal>
  );
}

/** عنصر مقفول: يبان باهت بقفل، ولما يضغط عليه تطلع نافذة الترقية بدل ما يدخل */
export function LockedButton({ info, className, children }: { info: LockedInfo; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${info.title} (مقفولة في باقتك)`} className={cn("relative text-muted opacity-70 hover:opacity-100", className)}>
        {children}
        <Lock className="ms-auto size-3.5 shrink-0" aria-hidden />
      </button>
      <UpgradeDialog open={open} onClose={() => setOpen(false)} info={info} />
    </>
  );
}
