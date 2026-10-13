"use client";

import { useState } from "react";
import { Megaphone, Plus } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/feedback";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Toggle } from "@/components/ui/toggle";
import { dateInputToMs, msToDateInput } from "@/lib/date-input";
import { formatDate } from "@/lib/datetime";
import { deleteAnnouncementAction, saveAnnouncementAction } from "../actions";

type Item = { id: string; title: string; body: string; level: "info" | "warning" | "success"; startsAt: number | null; endsAt: number | null; isActive: boolean; createdAt: number; dismissedBy: number };
const LEVEL = { info: ["معلومة", "teal"], warning: ["تنبيه", "gold"], success: ["خبر حلو", "success"] } as const;

function Form({ initial, onClose }: { initial?: Item; onClose: () => void }) {
  const [v, setV] = useState({ title: initial?.title ?? "", body: initial?.body ?? "", level: initial?.level ?? "info", startsAt: msToDateInput(initial?.startsAt ?? null), endsAt: msToDateInput(initial?.endsAt ?? null), isActive: initial?.isActive ?? true });
  const { act, pending, error } = useAct();
  return (
    <Modal open onClose={onClose} title={initial ? "تعديل الإعلان" : "إعلان جديد"} footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={() => act(() => saveAnnouncementAction({ id: initial?.id, ...v, startsAt: dateInputToMs(v.startsAt, "start"), endsAt: dateInputToMs(v.endsAt, "end") }), "تم الحفظ", onClose)}>حفظ</Button></>}>
      <div className="space-y-4">
        <Input label="العنوان" value={v.title} maxLength={80} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <Textarea label="النص" rows={4} maxLength={500} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} hint={`${v.body.length}/500`} />
        <Select label="النوع" value={v.level} onChange={(e) => setV({ ...v, level: e.target.value as Item["level"] })}>{Object.entries(LEVEL).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select>
        <div className="grid grid-cols-2 gap-3"><Input label="يبدأ من" type="date" value={v.startsAt} onChange={(e) => setV({ ...v, startsAt: e.target.value })} hint="فاضي = الحين" /><Input label="ينتهي في" type="date" value={v.endsAt} onChange={(e) => setV({ ...v, endsAt: e.target.value })} hint="فاضي = بدون نهاية" /></div>
        <Toggle label="فعّال" checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} />
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

export function AnnouncementManager({ items }: { items: Item[] }) {
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const del = useAct();
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> إعلان جديد</Button></div>
      {items.length === 0 ? <EmptyState icon={<Megaphone className="size-6" />} title="ما فيش إعلانات" description="أنشئ إعلان يوصل لكل البياعين." /> : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id}>
              <Card className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-base">{a.title}</h2><Badge tone={LEVEL[a.level][1]}>{LEVEL[a.level][0]}</Badge>{!a.isActive && <Badge>معطّل</Badge>}</div>
                <p className="whitespace-pre-line text-sm">{a.body}</p>
                <p className="text-xs text-muted">{a.startsAt ? `من ${formatDate(a.startsAt)}` : "من الحين"}{a.endsAt ? ` · لين ${formatDate(a.endsAt)}` : ""} · أغلقه {a.dismissedBy} بياع</p>
                <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(a)}>تعديل</Button><Button size="sm" variant="ghost" onClick={() => { del.setError(null); setDeleting(a); }}>حذف</Button></div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing && <Form key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} danger loading={del.pending} title="حذف الإعلان" message={del.error ?? `حذف «${deleting?.title}»؟`} confirmLabel="حذف" onConfirm={() => deleting && del.act(() => deleteAnnouncementAction(deleting.id), "تم المسح", () => setDeleting(null))} />
    </div>
  );
}
