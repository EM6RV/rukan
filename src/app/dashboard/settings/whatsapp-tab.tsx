"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_KEY_LABELS, WHATSAPP_VARIABLES } from "@/lib/whatsapp-defaults";
import { saveWhatsappTemplateAction } from "./actions";

export type WhatsappProps = { templates: Record<string, { body: string; isCustom: boolean }> };

export function WhatsappTab({ templates, writable }: WhatsappProps & { writable: boolean }) {
  const [values, setValues] = useState(() => Object.fromEntries(Object.entries(templates).map(([k, v]) => [k, v.body])));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function save(key: string, body: string, reset = false) {
    setBusy(key); setError(null);
    start(async () => {
      const r = await saveWhatsappTemplateAction({ key, body });
      setBusy(null);
      if (!r.ok) return setError({ key, message: r.error ?? "صار خطأ" });
      if (reset) setValues((v) => ({ ...v, [key]: DEFAULT_WHATSAPP_TEMPLATES[key]! }));
      toast(reset ? "رجعت الرسالة للأصل" : "تم الحفظ");
      router.refresh();
    });
  }

  return (
    <Card><CardBody className="space-y-6">
      <div className="space-y-1 text-sm text-muted">
        <p>هذي الرسائل تنفتح جاهزة في واتساب لما تضغط زر الواتساب في الطلبية. عدّلها كيف ما تبي.</p>
        <p>المتغيرات: {WHATSAPP_VARIABLES.map((v) => <code key={v} dir="ltr" className="mx-1 rounded bg-surface-2 px-1.5 py-0.5 text-fg">{`{${v}}`}</code>)}</p>
      </div>
      {Object.keys(templates).map((key) => (
        <div key={key} className="space-y-2 border-t border-line pt-4 first:border-0 first:pt-0">
          <Textarea
            label={WHATSAPP_KEY_LABELS[key] ?? key} rows={3} maxLength={600} value={values[key] ?? ""} disabled={!writable}
            error={error?.key === key ? error.message : undefined}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
          <div className="flex gap-2">
            <Button size="sm" loading={busy === key} disabled={!writable || values[key] === templates[key]!.body} onClick={() => save(key, values[key] ?? "")}>حفظ</Button>
            <Button size="sm" variant="ghost" disabled={!writable || (values[key] === DEFAULT_WHATSAPP_TEMPLATES[key] && !templates[key]!.isCustom)} onClick={() => save(key, "", true)}>رجّع الأصل</Button>
          </div>
        </div>
      ))}
    </CardBody></Card>
  );
}
