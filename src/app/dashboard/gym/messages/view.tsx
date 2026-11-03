"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { GYM_MESSAGE_KINDS, GYM_MESSAGE_LABELS, GYM_VARS, type GymMessageKind, type TodayMessage } from "@/server/gym/message-meta";
import { messageSentAction, saveTemplateAction } from "../actions";

export function MessagesView({ messages, templates, writable }: { messages: TodayMessage[]; templates: Record<GymMessageKind, { body: string; isCustom: boolean }>; writable: boolean }) {
  const router = useRouter();
  const act = useAct();
  const [kind, setKind] = useState<GymMessageKind>("expiring");
  const [body, setBody] = useState(templates.expiring.body);
  return (
    <div className="space-y-5">
      {act.error && <p role="alert" className={errorClass}>{act.error}</p>}
      <Card>
        <CardHeader title={`مستحقة اليوم (${messages.length})`} />
        <ul className="divide-y divide-line text-sm">{messages.map((m) => (
          <li key={`${m.memberId}${m.kind}${m.refId}`} className="flex flex-wrap items-center gap-2 px-5 py-3"><span className="min-w-0 flex-1"><b>{m.name}</b> <span className="text-muted">· {GYM_MESSAGE_LABELS[m.kind]}</span><span className="block truncate text-xs text-muted">{m.text}</span></span>
            {m.link && <a href={m.link} target="_blank" rel="noopener noreferrer" onClick={() => writable && act.act(() => messageSentAction(m.memberId, m.kind, m.refId), "اتعلّمت تم", () => router.refresh())} className="rounded-md bg-[#25D366] px-3 py-1.5 font-semibold text-navy">واتساب</a>}
            {writable && <Button size="sm" variant="ghost" onClick={() => act.act(() => messageSentAction(m.memberId, m.kind, m.refId), "تم", () => router.refresh())}>تم</Button>}</li>))}
          {messages.length === 0 && <li className="px-5 py-4 text-muted">ما فيش رسائل مستحقة اليوم 👌</li>}</ul>
      </Card>
      <Card>
        <CardHeader title="قوالب الرسائل" description={`المتغيرات: ${GYM_VARS.map((v) => `{${v}}`).join(" ")}`} />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">{GYM_MESSAGE_KINDS.map((k) => <button key={k} onClick={() => { setKind(k); setBody(templates[k].body); }} className={`rounded-full border px-3 py-1 text-sm ${kind === k ? "border-gold bg-gold/15 font-semibold" : "border-line"}`}>{GYM_MESSAGE_LABELS[k]}</button>)}</div>
          <Textarea label={GYM_MESSAGE_LABELS[kind]} rows={4} value={body} maxLength={600} onChange={(e) => setBody(e.target.value)} />
          {writable && <div className="flex gap-2"><Button loading={act.pending} onClick={() => act.act(() => saveTemplateAction(kind, body), "تم الحفظ", () => router.refresh())}>احفظ</Button><Button variant="ghost" onClick={() => act.act(() => saveTemplateAction(kind, null), "رجعنا للافتراضي", () => router.refresh())}>الافتراضي</Button></div>}
        </CardBody>
      </Card>
    </div>
  );
}
