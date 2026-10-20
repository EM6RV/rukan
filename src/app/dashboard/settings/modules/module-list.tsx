"use client";

import { startTransition, useOptimistic, useState } from "react";
import { Boxes, Calculator, Lock, MessagesSquare, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UpgradeDialog } from "@/components/ui/locked";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import type { StoreModule } from "@/lib/constants";
import type { ModuleState } from "@/server/modules";
import { setModuleAction } from "./actions";

const ICONS: Record<StoreModule, React.ReactNode> = { warehouses: <Boxes />, purchasing: <Truck />, accounting: <Calculator />, marketplaceInbox: <MessagesSquare /> };
type Mod = { key: StoreModule; title: string; description: string; state: ModuleState };

export function ModuleList({ modules, writable }: { modules: Mod[]; writable: boolean }) {
  const { toast } = useToast();
  // التغيير يبان فوراً، ويرجع لو السيرفر رفض
  const [list, setOptimistic] = useOptimistic(modules, (cur, { key, on }: { key: StoreModule; on: boolean }) => cur.map((m) => (m.key === key ? { ...m, state: on ? "on" : "off" } as Mod : m)));
  const [locked, setLocked] = useState<Mod | null>(null);

  const toggle = (m: Mod, on: boolean) =>
    startTransition(async () => {
      setOptimistic({ key: m.key, on });
      const r = await setModuleAction({ key: m.key, on });
      toast(r.ok ? (on ? `تم تشغيل «${m.title}»` : `تم طفي «${m.title}»، وبياناتها محفوظة`) : r.error, r.ok ? "success" : "error");
    });

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map((m) => (
          <li key={m.key} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <div aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 [&_svg]:size-5">{ICONS[m.key]}</div>
              <div className="min-w-0 flex-1">
                <h2 className="flex flex-wrap items-center gap-2 text-base">{m.title}{m.state === "soon" && <Badge tone="teal">قريباً</Badge>}{m.state === "locked" && <Badge><Lock className="size-3" aria-hidden /> مش في باقتك</Badge>}</h2>
                <p className="mt-1 text-sm leading-6 text-muted">{m.description}</p>
              </div>
            </div>
            <div className="mt-auto border-t border-line pt-3">
              {m.state === "locked" ? (
                <button type="button" onClick={() => setLocked(m)} className="text-sm font-semibold text-link hover:underline">شن الباقة اللي فيها؟</button>
              ) : (
                <Toggle label={m.state === "soon" ? "قريباً" : m.state === "on" ? "شغّالة" : "مطفية"} checked={m.state === "on"} disabled={!writable || m.state === "soon"} onChange={(on) => toggle(m, on)} />
              )}
            </div>
          </li>
        ))}
      </ul>
      {locked && <UpgradeDialog open onClose={() => setLocked(null)} info={{ title: locked.title, benefit: locked.description }} />}
    </>
  );
}
