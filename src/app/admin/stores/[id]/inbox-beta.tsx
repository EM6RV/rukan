"use client";

import { MessagesSquare } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { setInboxBetaAction } from "../../actions";

/** تجربة «صندوق الرسائل» لمتجر معين (الوحدة «قريباً» لباقي المتاجر) */
export function InboxBeta({ storeId, enabled }: { storeId: string; enabled: boolean }) {
  const { act, pending, error } = useAct();
  return (
    <Card>
      <CardHeader title="صندوق الرسائل (تجريبي)" description="يظهر للمتجر هذا بس كتجربة. الربط الآلي مع القنوات لسه ما اشتغلش." />
      <CardBody className="flex flex-wrap items-center gap-3">
        <Button variant={enabled ? "outline" : "primary"} loading={pending} onClick={() => act(() => setInboxBetaAction(storeId, !enabled), enabled ? "اتقفلت التجربة" : "اتفعّلت التجربة")}><MessagesSquare className="size-4" aria-hidden /> {enabled ? "إيقاف التجربة" : "تفعيل التجربة"}</Button>
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </CardBody>
    </Card>
  );
}
