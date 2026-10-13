"use client";

import { useState, useTransition } from "react";
import { Info, Megaphone, PartyPopper, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { dismissAnnouncementAction } from "@/app/dashboard/announcement-actions";

type Item = { id: string; title: string; body: string; level: "info" | "warning" | "success" };
const STYLE = { info: ["bg-teal/10 text-fg ring-teal/30", Info], warning: ["bg-gold/20 text-fg ring-gold/40", TriangleAlert], success: ["bg-success/10 text-fg ring-success/30", PartyPopper] } as const;

/** إعلانات المنصة للبياعين: كل واحد يقدر يغلقها */
export function Announcements({ items }: { items: Item[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const visible = items.filter((i) => !hidden.has(i.id));
  if (visible.length === 0) return null;
  return (
    <div className="space-y-2 px-4 pt-3 lg:px-8" aria-label="إعلانات رُكن">
      {visible.map((a) => {
        const [cls, Icon] = STYLE[a.level];
        return (
          <div key={a.id} role="status" className={cn("flex items-start gap-3 rounded-lg p-3 text-sm ring-1", cls)}>
            <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1"><p className="flex items-center gap-1.5 font-semibold"><Megaphone className="size-3.5" aria-hidden />{a.title}</p><p className="whitespace-pre-line">{a.body}</p></div>
            <button type="button" aria-label="إغلاق الإعلان" className="rounded p-1 hover:bg-black/5" onClick={() => { setHidden((s) => new Set(s).add(a.id)); start(async () => { await dismissAnnouncementAction(a.id); }); }}><X className="size-4" /></button>
          </div>
        );
      })}
    </div>
  );
}
