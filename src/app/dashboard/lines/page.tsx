import type { Metadata } from "next";
import Link from "next/link";
import { Dumbbell, Gamepad2, ShoppingBasket, Store, type LucideIcon } from "lucide-react";
import { LineStatus } from "@/components/dashboard/line-status";
import { Card, CardBody } from "@/components/ui/card";
import { getDb } from "@/db";
import { daysText } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { LINE_INFO, PRODUCT_LINES, type LineIcon } from "@/lib/product-lines";
import { availableLines, lineLaunch, lineTrialDays } from "@/server/lines";
import { renewLinkFor } from "@/server/lines-view";
import { requireStoreContext } from "@/server/store-context";
import { StartTrialButton } from "./start-trial";

export const metadata: Metadata = { title: "منظوماتي" };
const ICONS: Record<LineIcon, LucideIcon> = { store: Store, market: ShoppingBasket, lounge: Gamepad2, gym: Dumbbell };

export default async function LinesPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const ctx = await requireStoreContext("billing");
  const { add } = await searchParams;
  const db = getDb();
  const available = availableLines(await lineLaunch(db), ctx.store.lineBeta);
  const rows = await Promise.all(PRODUCT_LINES.map(async (l) => ({
    line: l, access: ctx.lines[l], available: available.includes(l),
    renew: ctx.lines[l].subscribed ? await renewLinkFor(db, ctx, l) : null,
    trialDays: ctx.lines[l].subscribed ? 0 : await lineTrialDays(db, l),
  })));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">منظوماتي</h1>
        <p className="text-muted">كل منظومة باشتراك لحالها، وكلهم في نفس الحساب: نفس الزباين والمنتجات والموظفين والخزنة.</p>
      </div>
      <div className="grid gap-4">
        {rows.map(({ line, access, available: ok, renew, trialDays }) => {
          const info = LINE_INFO[line];
          const Icon = ICONS[info.icon];
          return (
            <Card key={line} className={cn(add === line && "ring-2 ring-gold")}>
              <CardBody className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface-2"><Icon className="size-6" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg">{info.brand} <span className="text-sm font-normal text-muted">· {info.card}</span></h2>
                    <p className="text-sm text-muted">{info.description}</p>
                  </div>
                  {access.subscribed && <Link href={info.home} className="shrink-0 text-sm font-medium text-link">افتح</Link>}
                </div>
                {access.subscribed ? <LineStatus access={access} renew={renew} />
                  : ok ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">لـ{info.who}.</p><StartTrialButton line={line} label={`ابدا تجربة مجانية ${daysText(trialDays)}`} /></div>
                  : <p className="text-sm font-medium text-muted">قريباً</p>}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
