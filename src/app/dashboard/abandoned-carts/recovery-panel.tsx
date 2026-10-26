"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { formatMoney } from "@/lib/money";
import { saveRetentionAction } from "./actions";

export function RecoveryPanel({ recovered, retentionDays, writable }: { recovered: { count: number; total: number; reminded: number; rate: number | null }; retentionDays: number; writable: boolean }) {
  const [days, setDays] = useState(String(retentionDays));
  const { act, pending, error } = useAct();
  return (
    <Card className="grid gap-4 p-4 sm:grid-cols-2">
      <div>
        <p className="text-sm text-muted">مبيعات مسترجعة بالتذكير</p>
        <p className="text-2xl font-bold tabular-nums">{formatMoney(recovered.total)}</p>
        <p className="text-sm text-muted">{recovered.count} طلبية من {recovered.reminded} تذكير{recovered.rate !== null ? ` (${Math.round(recovered.rate * 100)}%)` : ""}</p>
      </div>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); act(() => saveRetentionAction(Number(days)), "تم الحفظ"); }}>
        <label className="block text-sm font-medium" htmlFor="ret">مدة الاحتفاظ بالسلات (أيام)</label>
        <div className="flex gap-2">
          <input id="ret" type="number" min={3} max={90} value={days} onChange={(e) => setDays(e.target.value)} disabled={!writable} className="h-10 w-28 rounded-md border border-line bg-surface px-3 text-sm" />
          <Button type="submit" size="sm" loading={pending} disabled={!writable}>حفظ</Button>
        </div>
        <p className="text-xs text-muted">بعدها تتمسح أرقام الزباين أوتوماتيك (من 3 إلى 90 يوم).</p>
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </form>
    </Card>
  );
}
