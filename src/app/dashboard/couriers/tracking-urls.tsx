"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { SHIPPING_COMPANIES } from "@/lib/shipping-companies";
import { saveTrackingUrlsAction } from "./actions";

/** روابط تتبع الشحنات: البياع يحط رابط تتبع شركته ({n} = رقم الشحنة) وتطلع للزبون في صفحة تتبع الطلبية */
export function TrackingUrls({ initial, writable }: { initial: Record<string, string>; writable: boolean }) {
  const [v, setV] = useState<Record<string, string>>(initial);
  const { act, pending, error } = useAct();
  return (
    <Card>
      <CardHeader title="روابط تتبع شركات الشحن" description="اختياري. اكتب رابط التتبع اللي تعطيك إياه الشركة، وحط {n} مكان رقم الشحنة. مثال: https://example.com/track/{n}" />
      <CardBody className="space-y-3">
        {SHIPPING_COMPANIES.map((c) => (
          <Input key={c.id} label={c.nameAr} dir="ltr" className="text-right" placeholder="https://…/{n}" value={v[c.id] ?? ""} disabled={!writable} onChange={(e) => setV({ ...v, [c.id]: e.target.value })} />
        ))}
        {error && <p role="alert" className={errorClass}>{error}</p>}
        <Button loading={pending} disabled={!writable} onClick={() => act(() => saveTrackingUrlsAction(v), "تم الحفظ")}>حفظ الروابط</Button>
      </CardBody>
    </Card>
  );
}
