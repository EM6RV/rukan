"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, EyeOff, FileText, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { SectionsEditor, type InitialSection } from "@/components/dashboard/sections-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm";
import { Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SortableList } from "@/components/ui/sortable-list";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import { notifyStoreSaved } from "@/lib/preview-signal";
import { deletePageAction, reorderPagesAction, savePageAction, saveTextsAction } from "./actions";

type PageItem = { id: string; slug: string; title: string; body: string; isPublished: boolean; isCore: boolean };
type Props = {
  writable: boolean; defaultTab: string; sections: InitialSection[]; pages: PageItem[];
  texts: { announcementBar: string; thanksMessage: string; footerText: string };
};

type Res = { ok: boolean; error?: string };
function useAct() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<Res>, success: string, onDone?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "صار خطأ");
      toast(success);
      notifyStoreSaved();
      onDone?.();
      router.refresh();
    });
  };
  return { act, pending, error, setError };
}
const ErrorLine = ({ error }: { error: string | null }) => (error ? <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{error}</p> : null);

export function ContentTabs(p: Props) {
  return (
    <Tabs
      defaultKey={p.defaultTab}
      items={[
        { key: "home", label: "الصفحة الرئيسية", content: <SectionsEditor initial={p.sections} writable={p.writable} /> },
        { key: "pages", label: "الصفحات", content: <PagesManager pages={p.pages} writable={p.writable} /> },
        { key: "texts", label: "نصوص المتجر", content: <TextsForm texts={p.texts} writable={p.writable} /> },
      ]}
    />
  );
}

function TextsForm({ texts, writable }: { texts: Props["texts"]; writable: boolean }) {
  const [v, setV] = useState(texts);
  const { act, pending, error } = useAct();
  return (
    <Card><CardBody>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); act(() => saveTextsAction(v), "تم الحفظ"); }}>
        <Input label="الشريط الإعلاني" value={v.announcementBar} maxLength={120} disabled={!writable} onChange={(e) => setV({ ...v, announcementBar: e.target.value })} hint={`${v.announcementBar.length}/120 · يظهر فوق كل صفحات المتجر. فاضي = بدون شريط. مثال: توصيل مجاني فوق 150 د.ل`} />
        <Textarea label="رسالة الشكر بعد الطلب" rows={3} maxLength={300} value={v.thanksMessage} disabled={!writable} onChange={(e) => setV({ ...v, thanksMessage: e.target.value })} hint={`${v.thanksMessage.length}/300 · تظهر للزبون بعد ما يأكد طلبيته`} />
        <Input label="نص الفوتر" value={v.footerText} maxLength={120} disabled={!writable} onChange={(e) => setV({ ...v, footerText: e.target.value })} hint="يظهر تحت كل صفحات المتجر" />
        <p className="text-sm text-muted">أرقام التواصل وروابط السوشيال تتعدل من «الإعدادات ← التواصل».</p>
        <ErrorLine error={error} />
        <Button type="submit" loading={pending} disabled={!writable}>حفظ</Button>
      </form>
    </CardBody></Card>
  );
}

function PagesManager({ pages, writable }: { pages: PageItem[]; writable: boolean }) {
  const [items, setItems] = useState(pages);
  const [prev, setPrev] = useState(pages);
  if (pages !== prev) { setPrev(pages); setItems(pages); }
  const [editing, setEditing] = useState<PageItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<PageItem | null>(null);
  const reorder = useAct();
  const del = useAct();

  function onReorder(next: PageItem[]) {
    if (!writable) return;
    const before = items;
    setItems(next);
    reorder.act(async () => { const r = await reorderPagesAction(next.map((x) => x.id)); if (!r.ok) setItems(before); return r; }, "تم الترتيب");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted">صفحات المتجر (من نحن، السياسات…). تظهر في الفوتر.</p><Button disabled={!writable} onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> صفحة جديدة</Button></div>
      <ErrorLine error={reorder.error} />
      <SortableList
        className="space-y-2" items={items} getId={(x) => x.id} onReorder={onReorder}
        render={(x, { isFirst, isLast, moveUp, moveDown, dragging }) => (
          <Card className={`flex items-center gap-3 p-3 ${dragging ? "opacity-50" : ""}`}>
            <GripVertical className="hidden size-5 shrink-0 cursor-grab text-muted sm:block" aria-hidden />
            <FileText className="size-5 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0 flex-1"><p className="flex items-center gap-2 font-semibold"><span className="truncate">{x.title}</span>{!x.isPublished && <Badge><EyeOff className="size-3" aria-hidden /> مخفية</Badge>}</p><p className="truncate text-sm text-muted">{x.body.replace(/\s+/g, " ").slice(0, 60)}</p></div>
            <div className="flex shrink-0 items-center">
              <button type="button" aria-label="تحريك لفوق" onClick={moveUp} disabled={isFirst || !writable} className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 disabled:opacity-40"><ArrowUp className="size-4" /></button>
              <button type="button" aria-label="تحريك لتحت" onClick={moveDown} disabled={isLast || !writable} className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 disabled:opacity-40"><ArrowDown className="size-4" /></button>
              <button type="button" aria-label="تعديل" onClick={() => setEditing(x)} disabled={!writable} className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 disabled:opacity-40"><Pencil className="size-4" /></button>
              {!x.isCore && <button type="button" aria-label="حذف" onClick={() => { del.setError(null); setDeleting(x); }} disabled={!writable} className="flex size-9 items-center justify-center rounded-md hover:bg-surface-2 disabled:opacity-40"><Trash2 className="size-4 text-danger-fg" /></button>}
            </div>
          </Card>
        )}
      />
      {editing && <PageForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} danger loading={del.pending} title="حذف الصفحة" message={del.error ?? `حذف صفحة «${deleting?.title}»؟`} confirmLabel="حذف" onConfirm={() => deleting && del.act(() => deletePageAction(deleting.id), "تم المسح", () => setDeleting(null))} />
    </div>
  );
}

function PageForm({ initial, onClose }: { initial?: PageItem; onClose: () => void }) {
  const [v, setV] = useState({ title: initial?.title ?? "", body: initial?.body ?? "", isPublished: initial?.isPublished ?? true });
  const { act, pending, error } = useAct();
  return (
    <Modal open onClose={onClose} title={initial ? "تعديل الصفحة" : "صفحة جديدة"} className="max-w-2xl"
      footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} disabled={v.title.trim().length < 2} onClick={() => act(() => savePageAction({ id: initial?.id, ...v }), "تم الحفظ", onClose)}>حفظ</Button></>}>
      <div className="space-y-4">
        <Input label="عنوان الصفحة" value={v.title} maxLength={60} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <Textarea label="المحتوى" rows={10} maxLength={10000} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} hint="نص عادي. السطر الجديد يبقى سطر جديد." />
        <Toggle checked={v.isPublished} onChange={(isPublished) => setV({ ...v, isPublished })} label="منشورة" hint="المخفية ما تظهرش للزباين" />
        <ErrorLine error={error} />
      </div>
    </Modal>
  );
}
