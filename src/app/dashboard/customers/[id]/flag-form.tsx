"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { setCustomerFlagAction } from "../actions";

export function FlagForm({ id, flag, notes, writable }: { id: string; flag: "none" | "problematic"; notes: string; writable: boolean }) {
  const [text, setText] = useState(notes);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const save = (next: "none" | "problematic") => {
    setError(null);
    start(async () => {
      const r = await setCustomerFlagAction(id, next, text);
      if (!r.ok) return setError(r.error);
      toast(next === "problematic" ? "تم تعليم الزبون كمزعج" : "تم الحفظ");
      router.refresh();
    });
  };
  return (
    <div className="space-y-3">
      <Textarea label="ملاحظات عن الزبون" rows={3} maxLength={300} value={text} disabled={!writable} onChange={(e) => setText(e.target.value)} hint="مثلاً: ما يرد على التلفون، رفض الاستلام مرتين" />
      {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {flag === "none" ? (
          <Button variant="danger" loading={pending} disabled={!writable} onClick={() => save("problematic")}>علّمه «زبون مزعج»</Button>
        ) : (
          <>
            <Button loading={pending} disabled={!writable} onClick={() => save("problematic")}>حفظ الملاحظة</Button>
            <Button variant="outline" disabled={!writable || pending} onClick={() => save("none")}>شيل العلامة</Button>
          </>
        )}
        {flag === "none" && text !== notes && <Button variant="outline" loading={pending} disabled={!writable} onClick={() => save("none")}>حفظ الملاحظة</Button>}
      </div>
    </div>
  );
}
