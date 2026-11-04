"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { formatDateTime } from "@/lib/datetime";
import { closeConversationAction, logConversationAction } from "./actions";

type Channel = { id: string; kind: "instagram" | "facebook" | "whatsapp" | "site"; label: string; status: string; ready: boolean };
type Conv = { id: string; channel: string; name: string; handle: string | null; status: "open" | "closed" | "converted"; unread: number; at: number; orderId: string | null };

function LogForm({ channels, onClose }: { channels: Channel[]; onClose: () => void }) {
  const [v, setV] = useState({ kind: channels[0]?.kind ?? "whatsapp", name: "", body: "" });
  const { act, pending, error } = useAct();
  return (
    <Modal open onClose={onClose} title="تسجيل محادثة" footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={() => act(() => logConversationAction(v), "تم التسجيل", onClose)}>حفظ</Button></>}>
      <div className="space-y-4">
        <Select label="القناة" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as Channel["kind"] })}>{channels.map((c) => <option key={c.id} value={c.kind}>{c.label}</option>)}</Select>
        <Input label="اسم الزبون" value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Textarea label="الرسالة" rows={4} maxLength={2000} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

export function InboxView({ channels, conversations, writable }: { channels: Channel[]; conversations: Conv[]; writable: boolean }) {
  const [adding, setAdding] = useState(false);
  const { act, pending } = useAct();
  return (
    <div className="space-y-5">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {channels.map((c) => (
          <li key={c.id}><Card className="space-y-2 p-4"><p className="font-semibold">{c.label}</p><Badge>{c.ready ? "مربوطة" : "غير مربوطة · قريباً"}</Badge></Card></li>
        ))}
      </ul>
      <div className="flex justify-end"><Button disabled={!writable} onClick={() => setAdding(true)}><Plus className="size-4" /> تسجيل محادثة</Button></div>
      {conversations.length === 0 ? <EmptyState title="ما فيه محادثات" description="لما نربط القنوات، رسايل الزباين تنزل هنا. توا تقدر تسجل المحادثات يدوياً." /> : (
        <ul className="grid gap-2">
          {conversations.map((c) => (
            <li key={c.id}>
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1"><p className="font-semibold">{c.name}</p><p className="text-sm text-muted">{c.channel} · {formatDateTime(c.at)}</p></div>
                <Badge tone={c.status === "open" ? "gold" : "neutral"}>{{ open: "مفتوحة", closed: "مقفولة", converted: "تحولت لطلبية" }[c.status]}</Badge>
                {writable && c.status === "open" && <><Link href={`/dashboard/orders/new?name=${encodeURIComponent(c.name)}`} className="inline-flex h-9 items-center rounded-md bg-gold px-3 text-sm font-semibold text-navy">حوّل لطلبية</Link><Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => closeConversationAction(c.id), "تم الإقفال")}>إقفال</Button></>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {adding && <LogForm channels={channels} onClose={() => setAdding(false)} />}
    </div>
  );
}
