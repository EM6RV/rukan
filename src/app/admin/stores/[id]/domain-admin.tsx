"use client";

import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { adminDomainStatusAction } from "../../actions";

const LABEL = { pending: ["بانتظار التحقق", "gold"], verified: ["مفعّل", "success"], failed: ["مرفوض", "danger"] } as const;

/** اعتماد/رفض يدوي للدومين الخاص (للدعم لما التحقق الآلي ما ينفعش). تذكير: لازم الدومين يكون مضاف في Render كمان. */
export function DomainAdmin({ id, domain, status }: { id: string; domain: string; status: "pending" | "verified" | "failed" }) {
  const { act, pending, error } = useAct();
  return (
    <Card>
      <CardHeader title="الدومين الخاص" description="لازم يكون الدومين مضاف أيضاً في خدمة Render (Custom Domains) علشان يشتغل وتتجهز الشهادة." />
      <CardBody className="flex flex-wrap items-center gap-3">
        <span dir="ltr" className="font-semibold">{domain}</span><Badge tone={LABEL[status][1]}>{LABEL[status][0]}</Badge>
        <div className="ms-auto flex gap-2">
          {status !== "verified" && <Button size="sm" loading={pending} onClick={() => act(() => adminDomainStatusAction(id, "verified"), "تم اعتماد الدومين")}>اعتماد يدوي</Button>}
          {status !== "failed" && <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => adminDomainStatusAction(id, "failed"), "تم رفض الدومين")}>رفض</Button>}
        </div>
        {error && <p role="alert" className={`${errorClass} w-full`}>{error}</p>}
      </CardBody>
    </Card>
  );
}
