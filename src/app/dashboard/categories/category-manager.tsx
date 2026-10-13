"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, EyeOff, FolderTree, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { ImageUploader } from "@/components/dashboard/image-uploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/feedback";
import { Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SortableList } from "@/components/ui/sortable-list";
import { useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import { deleteCategoryAction, reorderCategoriesAction, saveCategoryAction } from "./actions";

type Category = {
  id: string; name: string; description: string | null; isVisible: boolean; productCount: number;
  image: { id: string; url: string } | null;
};
type Draft = { id?: string; name: string; description: string; isVisible: boolean; image: { id: string; url: string } | null };
const EMPTY: Draft = { name: "", description: "", isVisible: true, image: null };

export function CategoryManager({ initial, writable }: { initial: Category[]; writable: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // المصدر الأساسي هو السيرفر: نعيد المزامنة بعد أي تغيير
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) { setPrevInitial(initial); setItems(initial); }

  function save() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const r = await saveCategoryAction({
        id: draft.id, name: draft.name, description: draft.description, imageMediaId: draft.image?.id ?? null, isVisible: draft.isVisible,
      });
      if (!r.ok) return setError(r.error);
      setDraft(null);
      toast(draft.id ? "تم الحفظ" : "تمت إضافة القسم");
      router.refresh();
    });
  }

  function remove() {
    if (!toDelete) return;
    startTransition(async () => {
      const r = await deleteCategoryAction(toDelete.id);
      setToDelete(null);
      if (!r.ok) return toast(r.error, "error");
      toast("تم حذف القسم");
      router.refresh();
    });
  }

  async function onReorder(next: Category[]) {
    const before = items;
    setItems(next);
    const r = await reorderCategoriesAction(next.map((c) => c.id));
    if (!r.ok) { setItems(before); toast(r.error, "error"); } else router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">الأقسام</h1>
          <p className="text-muted">رتّب أقسامك بالسحب أو بالأسهم. الترتيب نفسه يظهر في متجرك.</p>
        </div>
        <Button onClick={() => { setError(null); setDraft(EMPTY); }} disabled={!writable}><Plus className="size-4" /> قسم جديد</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<FolderTree className="size-6" />} title="ما عندكش أقسام" description="الأقسام تساعد زباينك يلقوا المنتجات بسهولة (مثلاً: عطور رجالية، فساتين…)."
          action={<Button onClick={() => setDraft(EMPTY)} disabled={!writable}>أضف أول قسم</Button>} />
      ) : (
        <SortableList
          className="space-y-2" items={items} getId={(c) => c.id} onReorder={onReorder}
          render={(c, { isFirst, isLast, moveUp, moveDown, dragging }) => (
            <Card className={`flex items-center gap-3 p-3 transition-opacity ${dragging ? "opacity-50" : ""}`}>
              <GripVertical className="hidden size-5 shrink-0 cursor-grab text-muted sm:block" aria-hidden />
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2">
                {}
                {c.image ? <img src={c.image.url} alt="" className="size-full object-cover" /> : <FolderTree className="size-6 text-muted" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.name}</p>
                <p className="flex items-center gap-2 text-sm text-muted">{c.productCount} منتج {!c.isVisible && <Badge><EyeOff className="size-3" /> مخفي</Badge>}</p>
              </div>
              <div className="flex shrink-0 items-center">
                <IconBtn label="تحريك لفوق" onClick={moveUp} disabled={isFirst || !writable}><ArrowUp className="size-4" /></IconBtn>
                <IconBtn label="تحريك لتحت" onClick={moveDown} disabled={isLast || !writable}><ArrowDown className="size-4" /></IconBtn>
                <IconBtn label="تعديل" onClick={() => { setError(null); setDraft({ id: c.id, name: c.name, description: c.description ?? "", isVisible: c.isVisible, image: c.image }); }} disabled={!writable}><Pencil className="size-4" /></IconBtn>
                <IconBtn label="حذف" onClick={() => setToDelete(c)} disabled={!writable} danger><Trash2 className="size-4" /></IconBtn>
              </div>
            </Card>
          )}
        />
      )}

      <Modal
        open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "تعديل القسم" : "قسم جديد"}
        footer={<><Button variant="ghost" onClick={() => setDraft(null)} disabled={pending}>إلغاء</Button><Button onClick={save} loading={pending} disabled={!draft?.name.trim()}>حفظ</Button></>}
      >
        {draft && (
          <div className="space-y-4">
            <Input label="اسم القسم" value={draft.name} maxLength={60} autoFocus onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Textarea label="وصف (اختياري)" rows={2} maxLength={300} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <ImageUploader label="صورة القسم (اختياري)" kind="category" value={draft.image} onChange={(image) => setDraft({ ...draft, image })} />
            <Toggle checked={draft.isVisible} onChange={(isVisible) => setDraft({ ...draft, isVisible })} label="ظاهر في المتجر" />
            {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{error}</p>}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} loading={pending} danger confirmLabel="حذف"
        title="حذف القسم"
        message={toDelete ? `حذف قسم «${toDelete.name}»؟ المنتجات اللي فيه تبقى، بس تتشال من القسم.` : ""}
      />
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`flex size-9 items-center justify-center rounded-md transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30 ${danger ? "text-danger-fg" : "text-muted hover:text-fg"}`}>
      {children}
    </button>
  );
}
